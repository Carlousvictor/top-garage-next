import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// Dual-key lookup do tenant (user_id-first + fallback .id), padrão do projeto.
async function getTenantId(supabase, user) {
    const { data: profile } = await supabase
        .from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle()
    if (profile?.tenant_id) return profile.tenant_id
    const { data: byId } = await supabase
        .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    return byId?.tenant_id ?? null
}

// POST /api/stock/inventory — cria uma sessão de inventário.
// Congela um snapshot de TODOS os produtos do tenant (ordem por nome + estoque
// atual). Só permite UMA sessão aberta por vez — se já existir, devolve o id dela
// pra o cliente abrir em vez de duplicar.
export async function POST(request) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada para este usuário.' }, { status: 403 })

    // Guard: já existe inventário aberto?
    const { data: open } = await supabase
        .from('inventories')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (open?.id) {
        return NextResponse.json({ id: open.id, existing: true })
    }

    let note = null
    try { note = (await request.json())?.note ?? null } catch { /* corpo opcional */ }

    // Snapshot dos produtos — mesma ordem (name) usada na listagem do estoque.
    const { data: products, error: prodErr } = await supabase
        .from('products')
        .select('id, name, sku, quantity')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
    if (prodErr) return NextResponse.json({ error: 'Erro ao carregar produtos: ' + prodErr.message }, { status: 400 })
    if (!products || products.length === 0) {
        return NextResponse.json({ error: 'Nenhum produto cadastrado para inventariar.' }, { status: 400 })
    }

    const { data: inv, error: invErr } = await supabase
        .from('inventories')
        .insert([{ tenant_id: tenantId, status: 'open', note }])
        .select('id')
        .single()
    if (invErr) return NextResponse.json({ error: 'Erro ao criar inventário: ' + invErr.message }, { status: 400 })

    // position = índice no snapshot ordenado por nome → garante folha = tela.
    const itemsToInsert = products.map((p, idx) => ({
        tenant_id: tenantId,
        inventory_id: inv.id,
        product_id: p.id,
        position: idx,
        product_name: p.name || '(sem nome)',
        sku: p.sku || null,
        system_quantity: Number(p.quantity) || 0,
        counted_quantity: null,
    }))

    const { error: itemsErr } = await supabase.from('inventory_items').insert(itemsToInsert)
    if (itemsErr) {
        // Rollback best-effort: remove o header pra não deixar sessão sem itens.
        await supabase.from('inventories').delete().eq('id', inv.id).eq('tenant_id', tenantId)
        return NextResponse.json({ error: 'Erro ao gerar itens do inventário: ' + itemsErr.message }, { status: 400 })
    }

    return NextResponse.json({ id: inv.id })
}

// DELETE /api/stock/inventory?id=123 — exclui uma sessão de inventário.
// Útil quando o operador abriu sem querer. NÃO reverte ajustes de estoque
// de um inventário já finalizado — é só a remoção do registro.
export async function DELETE(request) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    // Confirma posse pelo tenant antes de excluir.
    const { data: inv } = await supabase
        .from('inventories')
        .select('id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
    if (!inv) return NextResponse.json({ error: 'Inventário não encontrado' }, { status: 404 })

    // Itens primeiro (defensivo; FK também tem ON DELETE CASCADE), depois o header.
    await supabase.from('inventory_items').delete().eq('inventory_id', id).eq('tenant_id', tenantId)
    const { error } = await supabase.from('inventories').delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
}

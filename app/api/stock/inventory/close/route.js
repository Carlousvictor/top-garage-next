import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantId(supabase, user) {
    const { data: profile } = await supabase
        .from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle()
    if (profile?.tenant_id) return profile.tenant_id
    const { data: byId } = await supabase
        .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    return byId?.tenant_id ?? null
}

// POST /api/stock/inventory/close — finaliza um inventário.
// Body: { inventory_id, apply }  (apply=true ajusta products.quantity p/ a contagem)
// Só ajusta itens COM contagem preenchida; itens em branco ficam intactos.
// Devolve o resumo de divergências (sistema vs físico).
export async function POST(request) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 })

    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }) }
    const { inventory_id, apply = true } = body
    if (!inventory_id) return NextResponse.json({ error: 'inventory_id obrigatório' }, { status: 400 })

    const { data: inv } = await supabase
        .from('inventories')
        .select('id, status')
        .eq('id', inventory_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
    if (!inv) return NextResponse.json({ error: 'Inventário não encontrado' }, { status: 404 })
    if (inv.status !== 'open') return NextResponse.json({ error: 'Inventário já finalizado' }, { status: 409 })

    const { data: items, error: itemsErr } = await supabase
        .from('inventory_items')
        .select('id, product_id, product_name, sku, system_quantity, counted_quantity, position')
        .eq('inventory_id', inventory_id)
        .eq('tenant_id', tenantId)
        .order('position', { ascending: true })
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 400 })

    const counted = (items || []).filter(it => it.counted_quantity !== null && it.counted_quantity !== undefined)

    // Saldo AO VIVO: divergência é contra o products.quantity ATUAL (não o snapshot
    // do início), refletindo vendas feitas durante a contagem. Busca o saldo corrente.
    const productIds = [...new Set(counted.map(it => it.product_id).filter(v => v != null))]
    const currentMap = {}
    if (productIds.length > 0) {
        const { data: prods } = await supabase
            .from('products').select('id, quantity').in('id', productIds).eq('tenant_id', tenantId)
        for (const p of (prods || [])) currentMap[p.id] = Number(p.quantity) || 0
    }
    const currentQty = (it) => (it.product_id != null && currentMap[it.product_id] != null)
        ? currentMap[it.product_id]
        : (Number(it.system_quantity) || 0)

    const divergences = counted
        .map(it => ({
            position: it.position,
            product_name: it.product_name,
            sku: it.sku,
            system_quantity: currentQty(it),
            counted_quantity: Number(it.counted_quantity) || 0,
            diff: (Number(it.counted_quantity) || 0) - currentQty(it),
        }))
        .filter(d => d.diff !== 0)

    let appliedCount = 0
    if (apply) {
        // Ajusta o estoque item a item — só os que têm contagem e produto vinculado.
        for (const it of counted) {
            if (!it.product_id) continue
            const { error: updErr } = await supabase
                .from('products')
                .update({ quantity: Number(it.counted_quantity) || 0 })
                .eq('id', it.product_id)
                .eq('tenant_id', tenantId)
            if (!updErr) appliedCount++
        }
    }

    const { error: closeErr } = await supabase
        .from('inventories')
        .update({ status: 'closed', closed_at: new Date().toISOString(), applied_to_stock: !!apply })
        .eq('id', inventory_id)
        .eq('tenant_id', tenantId)
    if (closeErr) return NextResponse.json({ error: closeErr.message }, { status: 400 })

    return NextResponse.json({
        success: true,
        applied: !!apply,
        appliedCount,
        countedCount: counted.length,
        totalItems: (items || []).length,
        divergences,
    })
}

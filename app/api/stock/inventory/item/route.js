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

// PATCH /api/stock/inventory/item — grava a contagem de UM item (autosave).
// Body: { item_id, counted_quantity }  (counted_quantity null/'' limpa a contagem)
export async function PATCH(request) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 })

    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }) }
    const { item_id, counted_quantity } = body
    if (!item_id) return NextResponse.json({ error: 'item_id obrigatório' }, { status: 400 })

    // Normaliza: vazio/null = limpar; senão número >= 0.
    let counted = null
    if (counted_quantity !== null && counted_quantity !== undefined && counted_quantity !== '') {
        const n = Number(counted_quantity)
        if (!Number.isFinite(n) || n < 0) {
            return NextResponse.json({ error: 'Quantidade inválida' }, { status: 400 })
        }
        counted = n
    }

    // Só permite gravar se a sessão do item estiver aberta.
    // Lookup em 2 passos (sem embed) pra não depender da inferência de relação.
    const { data: item } = await supabase
        .from('inventory_items')
        .select('id, inventory_id')
        .eq('id', item_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
    if (!item) return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })

    const { data: inv } = await supabase
        .from('inventories')
        .select('status')
        .eq('id', item.inventory_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
    if (inv?.status !== 'open') {
        return NextResponse.json({ error: 'Inventário já finalizado — não é possível editar.' }, { status: 409 })
    }

    const { error } = await supabase
        .from('inventory_items')
        .update({
            counted_quantity: counted,
            counted_at: counted === null ? null : new Date().toISOString(),
        })
        .eq('id', item_id)
        .eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
}

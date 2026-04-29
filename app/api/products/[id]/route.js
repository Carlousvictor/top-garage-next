import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

async function getTenantId(supabase, user) {
    // Dual-key: user_id is canonical, .id is legacy.
    const { data: p } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle()
    if (p?.tenant_id) return p.tenant_id
    const { data: p2 } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    return p2?.tenant_id ?? null
}

export async function DELETE(request, { params }) {
    const { id } = await params
    const productId = parseInt(id, 10)
    if (!Number.isFinite(productId)) {
        return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não identificada' }, { status: 403 })
    }

    // Verify ownership before any mutation
    const { data: product } = await supabase
        .from('products')
        .select('id, tenant_id')
        .eq('id', productId)
        .maybeSingle()

    if (!product) {
        return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })
    }
    if (product.tenant_id !== tenantId) {
        return NextResponse.json({ error: 'Produto pertence a outra empresa' }, { status: 403 })
    }

    // 1. Orphan service_order_items so the DELETE doesn't violate FK.
    //    Lines preserve denormalized description/quantity/unit_price — old OSes still display correctly.
    const { error: orphanError } = await supabase
        .from('service_order_items')
        .update({ product_id: null })
        .eq('product_id', productId)

    if (orphanError) {
        return NextResponse.json({ error: 'Erro ao desvincular histórico: ' + orphanError.message }, { status: 500 })
    }

    // 2. Actual delete.
    const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('tenant_id', tenantId)

    if (deleteError) {
        return NextResponse.json({ error: 'Erro ao excluir produto: ' + deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}

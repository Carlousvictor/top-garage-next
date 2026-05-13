import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// Busca leve de produtos do tenant para sugerir match em entradas de NF
// (XML ou manual) e para o picker "vincular a produto existente" + escolha
// de equivalências. Server-side por mesmo motivo do resto do módulo:
// cookie httpOnly evita hang de token stale.

async function getTenantId(supabase, user) {
    const { data: p1 } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
    if (p1?.tenant_id) return p1.tenant_id

    const { data: p2 } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
    return p2?.tenant_id ?? null
}

export const dynamic = 'force-dynamic'

export async function GET(request) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada para este usuário.' }, { status: 403 })
    }

    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').trim()
    // Sem q: o cliente quer popular um cache local de produtos (lookup case-insensitive).
    // Permite teto maior pra não cortar tenants médios. Com q: 50 é mais que suficiente.
    const requested = parseInt(url.searchParams.get('limit') || '20', 10)
    const limit = Math.min(Math.max(1, requested), q ? 50 : 1000)

    try {
        let query = supabase
            .from('products')
            .select('id, name, sku, ean, quantity, cost_price, selling_price, supplier_id')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true })
            .limit(limit)

        if (q) {
            // Procura por substring em name OR exato em sku/ean.
            const safe = q.replace(/[%,]/g, ' ')
            query = query.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,ean.ilike.%${safe}%`)
        }

        const { data, error } = await query
        if (error) {
            console.error('[stock/products-search] supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ products: data || [] })
    } catch (err) {
        console.error('[stock/products-search] failure:', err)
        return NextResponse.json({ error: 'Falha ao buscar produtos.' }, { status: 500 })
    }
}

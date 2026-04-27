import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Derive tenant_id server-side — never trust what the client sends
    let tenantId = null
    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

    tenantId = profile?.tenant_id

    if (!tenantId) {
        // Fallback: some setups store profile with id = user.id
        const { data: profileById } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single()
        tenantId = profileById?.tenant_id
    }

    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada para este usuário.' }, { status: 403 })
    }

    const body = await request.json()
    // Strip client-supplied id and tenant_id — we control both
    const { id, tenant_id: _ignored, ...fields } = body

    if (id) {
        const { data: updated, error } = await supabase
            .from('products')
            .update({ ...fields, tenant_id: tenantId })
            .eq('id', id)
            .select()

        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        if (!updated || updated.length === 0) {
            return NextResponse.json({ error: `Produto id=${id} não foi atualizado. Verifique RLS ou se o registro existe.` }, { status: 400 })
        }
    } else {
        // INSERT — always stamp with server-derived tenant_id
        const { error } = await supabase
            .from('products')
            .insert([{ ...fields, tenant_id: tenantId }])

        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { data: rawProducts, error: listError } = await supabase
        .from('products')
        .select('*, suppliers(name)')
        .eq('tenant_id', tenantId)
        .order('name')

    if (listError) return NextResponse.json({ error: listError.message }, { status: 400 })

    const { data: catsData } = await supabase.from('categories').select('id, name')
    const { data: brsData } = await supabase.from('brands').select('id, name')

    const catsMap = Object.fromEntries((catsData || []).map(c => [c.id, { name: c.name }]))
    const brsMap = Object.fromEntries((brsData || []).map(b => [b.id, { name: b.name }]))

    const products = (rawProducts || []).map(p => ({
        ...p,
        categories: p.category_id ? (catsMap[p.category_id] ?? null) : null,
        brands: p.brand_id ? (brsMap[p.brand_id] ?? null) : null,
    }))

    return NextResponse.json({ products })
}

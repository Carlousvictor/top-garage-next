import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantAndUser(supabase) {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { user: null, tenantId: null }

    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).single()
    if (profile?.tenant_id) return { user, tenantId: profile.tenant_id }

    const { data: profileById } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    return { user, tenantId: profileById?.tenant_id ?? null }
}

// GET /api/financial/open-sales
export async function GET(request) {
    const supabase = await createClient()
    const { user, tenantId } = await getTenantAndUser(supabase)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 })

    const { data } = await supabase.from('transactions').select('*')
        .eq('tenant_id', tenantId).eq('type', 'income').eq('status', 'pending')
        .order('date', { ascending: false })

    return NextResponse.json({ sales: data || [] })
}

// PATCH /api/financial/open-sales  — finaliza uma venda em aberto
export async function PATCH(request) {
    const supabase = await createClient()
    const { user, tenantId } = await getTenantAndUser(supabase)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 })

    const { id, payment_method } = await request.json()
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const { error } = await supabase.from('transactions').update({
        status: 'paid',
        date: new Date().toISOString(),
        payment_method
    }).eq('id', id).eq('tenant_id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}

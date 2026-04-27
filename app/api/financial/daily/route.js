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

// GET /api/financial/daily?date=YYYY-MM-DD
export async function GET(request) {
    const supabase = await createClient()
    const { user, tenantId } = await getTenantAndUser(supabase)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    if (!date) return NextResponse.json({ error: 'Parâmetro date obrigatório' }, { status: 400 })

    const [y, m, d] = date.split('-').map(Number)
    const startOfDay = new Date(y, m - 1, d, 0, 0, 0).toISOString()
    const endOfDay = new Date(y, m - 1, d, 23, 59, 59).toISOString()

    const [{ data: transactions }, { data: closure }] = await Promise.all([
        supabase.from('transactions').select('*').eq('tenant_id', tenantId)
            .gte('date', startOfDay).lte('date', endOfDay)
            .order('date', { ascending: false }),
        supabase.from('daily_closures').select('*').eq('tenant_id', tenantId)
            .eq('closure_date', date).maybeSingle()
    ])

    return NextResponse.json({ transactions: transactions || [], closure: closure || null })
}

// POST /api/financial/daily  — adiciona despesa/retirada
export async function POST(request) {
    const supabase = await createClient()
    const { user, tenantId } = await getTenantAndUser(supabase)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 })

    const { description, amount, selectedDate, isToday } = await request.json()
    if (!description || amount == null) return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })

    let expenseDate
    if (isToday) {
        expenseDate = new Date().toISOString()
    } else {
        const [y, m, d] = selectedDate.split('-').map(Number)
        expenseDate = new Date(y, m - 1, d, 12, 0, 0).toISOString()
    }

    const { error } = await supabase.from('transactions').insert([{
        tenant_id: tenantId,
        description,
        type: 'expense',
        category: 'Despesa Diária',
        amount,
        status: 'paid',
        date: expenseDate
    }])

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}

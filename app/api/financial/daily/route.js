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

    // Três queries em paralelo: transações do dia, parciais do dia, e fechamento do dia.
    const [txRes, closureRes, partialsRes] = await Promise.all([
        supabase.from('transactions').select('*, transaction_payments(payment_method, amount)').eq('tenant_id', tenantId)
            .gte('date', startOfDay).lte('date', endOfDay)
            .order('date', { ascending: false }),
        supabase.from('daily_closures').select('*').eq('tenant_id', tenantId)
            .eq('closure_date', date).maybeSingle(),
        supabase.from('transaction_partial_payments').select(`
            id,
            amount,
            payment_method,
            paid_at,
            notes,
            transactions:transaction_id ( id, description, category, type )
        `).eq('tenant_id', tenantId)
            .gte('paid_at', startOfDay).lte('paid_at', endOfDay)
            .order('paid_at', { ascending: false }),
    ])

    // Identificar quais transactions paid no dia tiveram parciais (em qualquer data).
    // Sem isso, o dia em que a parent é quitada via última parcela mostraria a parent
    // (=amount total) E a parcela do dia (=valor da parcela) → double-count.
    const dayTxIds = (txRes.data || []).map(t => t.id)
    let txIdsWithPartials = new Set()
    if (dayTxIds.length > 0) {
        const { data: partialsForTxs } = await supabase
            .from('transaction_partial_payments')
            .select('transaction_id')
            .eq('tenant_id', tenantId)
            .in('transaction_id', dayTxIds)
        txIdsWithPartials = new Set((partialsForTxs || []).map(p => p.transaction_id))
    }

    const transactionsSemParciais = (txRes.data || []).filter(t => !txIdsWithPartials.has(t.id))

    // Mapeia cada parcial do dia em um "evento financeiro" no mesmo formato dos rows
    // de transactions, pra que o front possa renderizar todos juntos sem branching.
    const partialsAsEvents = (partialsRes.data || []).map(p => ({
        id: `partial-${p.id}`,
        description: `Pgto parcial: ${p.transactions?.description || ''}`,
        amount: Number(p.amount),
        type: p.transactions?.type || 'expense',
        category: p.transactions?.category || 'Geral',
        status: 'paid',
        payment_method: p.payment_method,
        date: p.paid_at,
        is_partial: true,
        parent_transaction_id: p.transactions?.id,
    }))

    const transactions = [...transactionsSemParciais, ...partialsAsEvents]
        .sort((a, b) => new Date(b.date) - new Date(a.date))

    return NextResponse.json({ transactions, closure: closureRes.data || null })
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

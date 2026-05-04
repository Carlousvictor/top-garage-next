import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request) {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    let tenantId = null
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).single()
    if (profile?.tenant_id) {
        tenantId = profile.tenant_id
    } else {
        const { data: profileById } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
        tenantId = profileById?.tenant_id ?? null
    }

    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')

    if (!startDate || !endDate) {
        return NextResponse.json({ error: 'Parâmetros start e end obrigatórios' }, { status: 400 })
    }

    const [sy, sm, sd] = startDate.split('-').map(Number)
    const [ey, em, ed] = endDate.split('-').map(Number)
    const startISO = new Date(sy, sm - 1, sd, 0, 0, 0).toISOString()
    const endISO = new Date(ey, em - 1, ed, 23, 59, 59).toISOString()

    const [txRes, closuresRes, partialsRes] = await Promise.all([
        supabase
            .from('transactions')
            .select('id, amount, type, status, payment_method, date')
            .eq('tenant_id', tenantId)
            .eq('status', 'paid')
            .gte('date', startISO)
            .lte('date', endISO),
        supabase
            .from('daily_closures')
            .select('closure_date, status')
            .eq('tenant_id', tenantId)
            .gte('closure_date', startDate)
            .lte('closure_date', endDate),
        supabase
            .from('transaction_partial_payments')
            .select('id, amount, payment_method, paid_at, transactions:transaction_id ( id, type )')
            .eq('tenant_id', tenantId)
            .gte('paid_at', startISO)
            .lte('paid_at', endISO)
    ])

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

    const partialsAsEvents = (partialsRes.data || []).map(p => ({
        id: `partial-${p.id}`,
        amount: Number(p.amount),
        type: p.transactions?.type || 'expense',
        status: 'paid',
        payment_method: p.payment_method,
        date: p.paid_at,
    }))

    const transactions = [...transactionsSemParciais, ...partialsAsEvents]

    if (txRes.error) console.error('Erro ao buscar transactions no período:', txRes.error)
    if (closuresRes.error) console.error('Erro ao buscar closures no período:', closuresRes.error)

    return NextResponse.json({
        transactions: transactions,
        closures: closuresRes.data || []
    })
}

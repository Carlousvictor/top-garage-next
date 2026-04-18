import { createClient } from '@/utils/supabase/server'
import FinancialReports from '@/components/FinancialReports'

function defaultPeriod() {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const pad = (n) => String(n).padStart(2, '0')
    const from = `${y}-${pad(m + 1)}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const to = `${y}-${pad(m + 1)}-${pad(lastDay)}`
    return { from, to }
}

export default async function ReportsPage({ searchParams }) {
    const sp = (await searchParams) || {}
    const { from: defFrom, to: defTo } = defaultPeriod()
    const from = typeof sp.from === 'string' ? sp.from : defFrom
    const to = typeof sp.to === 'string' ? sp.to : defTo

    const fromISO = `${from}T00:00:00`
    const toISO = `${to}T23:59:59.999`

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return <div className="p-6 text-gray-300">Não autenticado.</div>
    }

    const [txRes, osRes, itemsRes, closuresRes] = await Promise.all([
        supabase
            .from('transactions')
            .select('id, type, status, amount, payment_method, category, description, date')
            .eq('status', 'paid')
            .gte('date', fromISO)
            .lte('date', toISO),
        supabase
            .from('service_orders')
            .select('id, total, created_at, client_id, clients ( id, name )')
            .eq('status', 'Concluido')
            .gte('created_at', fromISO)
            .lte('created_at', toISO),
        supabase
            .from('service_order_items')
            .select(`
                quantity,
                unit_price,
                description,
                type,
                product_id,
                service_id,
                products ( id, name ),
                services ( id, name ),
                service_orders!inner ( id, status, created_at )
            `)
            .eq('service_orders.status', 'Concluido')
            .gte('service_orders.created_at', fromISO)
            .lte('service_orders.created_at', toISO),
        supabase
            .from('daily_closures')
            .select('closure_date, total_income, total_expense, net_balance, status, breakdown_by_method')
            .gte('closure_date', from)
            .lte('closure_date', to)
            .order('closure_date', { ascending: true }),
    ])

    return (
        <FinancialReports
            from={from}
            to={to}
            transactions={txRes.data || []}
            serviceOrders={osRes.data || []}
            items={itemsRes.data || []}
            dailyClosures={closuresRes.data || []}
        />
    )
}

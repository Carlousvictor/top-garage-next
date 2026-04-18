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

function previousPeriod(from, to) {
    // Janela anterior de mesma duração, imediatamente antes de `from`.
    const fromDate = new Date(`${from}T00:00:00`)
    const toDate = new Date(`${to}T00:00:00`)
    const durationMs = toDate - fromDate
    const prevToDate = new Date(fromDate.getTime() - 24 * 3600 * 1000)
    const prevFromDate = new Date(prevToDate.getTime() - durationMs)
    const pad = (n) => String(n).padStart(2, '0')
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    return { from: fmt(prevFromDate), to: fmt(prevToDate) }
}

export default async function ReportsPage({ searchParams }) {
    const sp = (await searchParams) || {}
    const { from: defFrom, to: defTo } = defaultPeriod()
    const from = typeof sp.from === 'string' ? sp.from : defFrom
    const to = typeof sp.to === 'string' ? sp.to : defTo

    const fromISO = `${from}T00:00:00`
    const toISO = `${to}T23:59:59.999`

    const { from: prevFrom, to: prevTo } = previousPeriod(from, to)
    const prevFromISO = `${prevFrom}T00:00:00`
    const prevToISO = `${prevTo}T23:59:59.999`

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return <div className="p-6 text-gray-300">Não autenticado.</div>
    }

    const [txRes, osRes, itemsRes, closuresRes, prevTxRes, prevOsRes, productsRes] = await Promise.all([
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
                products ( id, name, cost_price ),
                services ( id, name, cost ),
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
        supabase
            .from('transactions')
            .select('type, amount')
            .eq('status', 'paid')
            .gte('date', prevFromISO)
            .lte('date', prevToISO),
        supabase
            .from('service_orders')
            .select('id, total')
            .eq('status', 'Concluido')
            .gte('created_at', prevFromISO)
            .lte('created_at', prevToISO),
        supabase
            .from('products')
            .select('id, name, quantity, min_quantity, cost_price, price')
            .order('quantity', { ascending: true }),
    ])

    // Estoque baixo: quantidade <= min_quantity (fallback 5 se não cadastrado).
    const lowStock = (productsRes.data || []).filter(
        (p) => Number(p.quantity || 0) <= Number(p.min_quantity || 5),
    )

    return (
        <FinancialReports
            from={from}
            to={to}
            transactions={txRes.data || []}
            serviceOrders={osRes.data || []}
            items={itemsRes.data || []}
            dailyClosures={closuresRes.data || []}
            prevTransactions={prevTxRes.data || []}
            prevServiceOrders={prevOsRes.data || []}
            lowStock={lowStock}
            prevPeriod={{ from: prevFrom, to: prevTo }}
        />
    )
}

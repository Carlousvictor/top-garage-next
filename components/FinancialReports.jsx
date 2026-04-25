"use client"
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    BarChart3, TrendingUp, TrendingDown, Wallet,
    Wrench, Package, Users, CalendarDays, Download, Printer,
    LineChart as LineChartIcon, AlertTriangle, ArrowUp, ArrowDown, Minus,
} from 'lucide-react'
import {
    LineChart, Line, XAxis, YAxis, Tooltip, Legend,
    ResponsiveContainer, CartesianGrid,
} from 'recharts'

const BRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const INT = (n) => Number(n || 0).toLocaleString('pt-BR')

function downloadCSV(rows, filename) {
    const csv = rows
        .map((row) =>
            row
                .map((cell) => {
                    const s = cell === null || cell === undefined ? '' : String(cell)
                    return `"${s.replace(/"/g, '""')}"`
                })
                .join(','),
        )
        .join('\n')
    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

function Bar({ value, max, color = 'bg-blue-500' }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0
    return (
        <div className="w-full bg-neutral-800 rounded h-2 overflow-hidden">
            <div className={`${color} h-full rounded`} style={{ width: `${pct}%` }} />
        </div>
    )
}

function computeDelta(current, previous) {
    if (!previous) return { pct: null, direction: 'flat' }
    const diff = current - previous
    if (previous === 0) {
        return { pct: current === 0 ? 0 : null, direction: diff === 0 ? 'flat' : 'up' }
    }
    const pct = (diff / Math.abs(previous)) * 100
    const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
    return { pct, direction }
}

function DeltaBadge({ delta, invertColor = false, prevValue, formatter = BRL }) {
    if (delta.pct === null) {
        return <span className="text-xs text-gray-500">vs anterior: —</span>
    }
    const { pct, direction } = delta
    const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus
    const goodUp = !invertColor
    const color =
        direction === 'flat'
            ? 'text-gray-400'
            : (direction === 'up') === goodUp
                ? 'text-green-400'
                : 'text-red-400'
    return (
        <span className={`text-xs ${color} inline-flex items-center gap-1`}>
            <Icon className="w-3 h-3" />
            {Math.abs(pct).toFixed(0)}%
            <span className="text-gray-500 ml-1">({formatter(prevValue)})</span>
        </span>
    )
}

function Card({ title, value, sub, Icon, tint, delta, prevValue, invertDelta }) {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>{title}</span>
                {Icon && <Icon className={`w-4 h-4 ${tint || 'text-gray-500'}`} />}
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
            {delta && (
                <div className="mt-1">
                    <DeltaBadge delta={delta} invertColor={invertDelta} prevValue={prevValue} />
                </div>
            )}
            {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
        </div>
    )
}

const TABS = [
    { id: 'summary', label: 'Resumo', Icon: BarChart3 },
    { id: 'evolution', label: 'Evolução', Icon: LineChartIcon },
    { id: 'services', label: 'Serviços', Icon: Wrench },
    { id: 'products', label: 'Peças', Icon: Package },
    { id: 'clients', label: 'Clientes', Icon: Users },
    { id: 'daily', label: 'Fechamentos', Icon: CalendarDays },
    { id: 'stock', label: 'Estoque', Icon: AlertTriangle },
]

export default function FinancialReports({
    from,
    to,
    transactions,
    serviceOrders,
    items,
    dailyClosures,
    prevTransactions = [],
    prevServiceOrders = [],
    lowStock = [],
    prevPeriod = null,
}) {
    const router = useRouter()
    const [tab, setTab] = useState('summary')
    const [fromInput, setFromInput] = useState(from)
    const [toInput, setToInput] = useState(to)

    const applyPeriod = () => {
        router.push(`/financial/reports?from=${fromInput}&to=${toInput}`)
    }

    const summary = useMemo(() => {
        const income = transactions.filter((t) => t.type === 'income').reduce((a, t) => a + Number(t.amount || 0), 0)
        const expense = transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + Number(t.amount || 0), 0)
        const ordersRevenue = serviceOrders.reduce((a, o) => a + Number(o.total || 0), 0)
        const ordersCount = serviceOrders.length
        const avgTicket = ordersCount ? ordersRevenue / ordersCount : 0

        const byMethod = {}
        transactions
            .filter((t) => t.type === 'income')
            .forEach((t) => {
                const m = t.payment_method || 'Não informado'
                byMethod[m] = (byMethod[m] || 0) + Number(t.amount || 0)
            })

        return { income, expense, balance: income - expense, ordersRevenue, ordersCount, avgTicket, byMethod }
    }, [transactions, serviceOrders])

    const prevSummary = useMemo(() => {
        const income = prevTransactions.filter((t) => t.type === 'income').reduce((a, t) => a + Number(t.amount || 0), 0)
        const expense = prevTransactions.filter((t) => t.type === 'expense').reduce((a, t) => a + Number(t.amount || 0), 0)
        const ordersCount = prevServiceOrders.length
        const ordersRevenue = prevServiceOrders.reduce((a, o) => a + Number(o.total || 0), 0)
        const avgTicket = ordersCount ? ordersRevenue / ordersCount : 0
        return { income, expense, balance: income - expense, ordersCount, avgTicket }
    }, [prevTransactions, prevServiceOrders])

    const deltas = useMemo(
        () => ({
            income: computeDelta(summary.income, prevSummary.income),
            expense: computeDelta(summary.expense, prevSummary.expense),
            balance: computeDelta(summary.balance, prevSummary.balance),
            ordersCount: computeDelta(summary.ordersCount, prevSummary.ordersCount),
        }),
        [summary, prevSummary],
    )

    const topServices = useMemo(() => {
        const map = new Map()
        items.forEach((it) => {
            if (!it.service_id) return
            const name = it.services?.name || it.description || 'Serviço sem nome'
            const qty = Number(it.quantity || 0)
            const revenue = qty * Number(it.unit_price || 0)
            const cur = map.get(name) || { name, qty: 0, revenue: 0 }
            cur.qty += qty
            cur.revenue += revenue
            map.set(name, cur)
        })
        return [...map.values()]
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 20)
    }, [items])

    const topProducts = useMemo(() => {
        const map = new Map()
        items.forEach((it) => {
            if (!it.product_id) return
            const name = it.products?.name || it.description || 'Peça sem nome'
            const qty = Number(it.quantity || 0)
            const revenue = qty * Number(it.unit_price || 0)
            const cur = map.get(name) || { name, qty: 0, revenue: 0 }
            cur.qty += qty
            cur.revenue += revenue
            map.set(name, cur)
        })
        return [...map.values()]
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 20)
    }, [items])

    const topClients = useMemo(() => {
        const map = new Map()
        serviceOrders.forEach((o) => {
            const id = o.client_id || 'sem-cliente'
            const name = o.clients?.name || 'Cliente não identificado'
            const cur = map.get(id) || { id, name, orders: 0, revenue: 0, last: null }
            cur.orders += 1
            cur.revenue += Number(o.total || 0)
            if (!cur.last || new Date(o.created_at) > new Date(cur.last)) cur.last = o.created_at
            map.set(id, cur)
        })
        return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20)
    }, [serviceOrders])

    const evolutionData = useMemo(() => {
        // Agrupa transactions por dia dentro do período.
        const map = new Map()
        const fromDate = new Date(`${from}T00:00:00`)
        const toDate = new Date(`${to}T00:00:00`)
        for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
            const key = d.toISOString().slice(0, 10)
            map.set(key, { date: key, income: 0, expense: 0 })
        }
        transactions.forEach((t) => {
            const key = (t.date || '').slice(0, 10)
            const bucket = map.get(key)
            if (!bucket) return
            if (t.type === 'income') bucket.income += Number(t.amount || 0)
            else if (t.type === 'expense') bucket.expense += Number(t.amount || 0)
        })
        return [...map.values()].map((d) => ({
            ...d,
            label: d.date.slice(8, 10) + '/' + d.date.slice(5, 7),
            balance: d.income - d.expense,
        }))
    }, [transactions, from, to])

    const maxServiceQty = topServices[0]?.qty || 0
    const maxProductQty = topProducts[0]?.qty || 0
    const maxClientRevenue = topClients[0]?.revenue || 0
    const totalLowStockValue = lowStock.reduce((a, p) => {
        const shortage = Math.max(0, Number(p.min_quantity || 0) - Number(p.quantity || 0))
        return a + shortage * Number(p.cost_price || 0)
    }, 0)

    const periodLabel = `${from} → ${to}`
    const prevLabel = prevPeriod ? `${prevPeriod.from} → ${prevPeriod.to}` : null

    const exportCurrent = () => {
        if (tab === 'summary') {
            downloadCSV(
                [
                    ['Período', periodLabel],
                    ['Período anterior', prevLabel || '-'],
                    [],
                    ['Métrica', 'Atual', 'Anterior', 'Delta %'],
                    ['Receita', summary.income.toFixed(2), prevSummary.income.toFixed(2), deltas.income.pct?.toFixed(1) ?? '-'],
                    ['Despesa', summary.expense.toFixed(2), prevSummary.expense.toFixed(2), deltas.expense.pct?.toFixed(1) ?? '-'],
                    ['Saldo', summary.balance.toFixed(2), prevSummary.balance.toFixed(2), deltas.balance.pct?.toFixed(1) ?? '-'],
                    ['OSs concluídas', summary.ordersCount, prevSummary.ordersCount, deltas.ordersCount.pct?.toFixed(1) ?? '-'],
                    ['Ticket médio', summary.avgTicket.toFixed(2), prevSummary.avgTicket.toFixed(2), '-'],
                    [],
                    ['Receita por método de pagamento'],
                    ...Object.entries(summary.byMethod).map(([m, v]) => [m, Number(v).toFixed(2)]),
                ],
                `resumo_${from}_a_${to}.csv`,
            )
        } else if (tab === 'services') {
            downloadCSV(
                [
                    ['Serviço', 'Qtd', 'Receita (R$)'],
                    ...topServices.map((r) => [
                        r.name,
                        r.qty,
                        r.revenue.toFixed(2),
                    ]),
                ],
                `servicos_${from}_a_${to}.csv`,
            )
        } else if (tab === 'products') {
            downloadCSV(
                [
                    ['Peça', 'Qtd vendida', 'Receita (R$)'],
                    ...topProducts.map((r) => [r.name, r.qty, r.revenue.toFixed(2)]),
                ],
                `pecas_${from}_a_${to}.csv`,
            )
        } else if (tab === 'clients') {
            downloadCSV(
                [
                    ['Cliente', 'Nº de OSs', 'Receita (R$)', 'Última visita'],
                    ...topClients.map((r) => [r.name, r.orders, r.revenue.toFixed(2), r.last?.slice(0, 10) || '']),
                ],
                `clientes_${from}_a_${to}.csv`,
            )
        } else if (tab === 'daily') {
            downloadCSV(
                [
                    ['Data', 'Receita (R$)', 'Despesa (R$)', 'Saldo (R$)', 'Status'],
                    ...dailyClosures.map((c) => [
                        c.closure_date,
                        Number(c.total_income || 0).toFixed(2),
                        Number(c.total_expense || 0).toFixed(2),
                        Number(c.net_balance || 0).toFixed(2),
                        c.status,
                    ]),
                ],
                `fechamentos_${from}_a_${to}.csv`,
            )
        } else if (tab === 'evolution') {
            downloadCSV(
                [
                    ['Data', 'Receita (R$)', 'Despesa (R$)', 'Saldo (R$)'],
                    ...evolutionData.map((d) => [d.date, d.income.toFixed(2), d.expense.toFixed(2), d.balance.toFixed(2)]),
                ],
                `evolucao_${from}_a_${to}.csv`,
            )
        } else if (tab === 'stock') {
            downloadCSV(
                [
                    ['Peça', 'Estoque atual', 'Estoque mínimo', 'Faltam', 'Custo unitário (R$)', 'Valor p/ repor (R$)'],
                    ...lowStock.map((p) => {
                        const shortage = Math.max(0, Number(p.min_quantity || 0) - Number(p.quantity || 0))
                        return [
                            p.name,
                            p.quantity,
                            p.min_quantity || 0,
                            shortage,
                            Number(p.cost_price || 0).toFixed(2),
                            (shortage * Number(p.cost_price || 0)).toFixed(2),
                        ]
                    }),
                ],
                `estoque_baixo_${new Date().toISOString().slice(0, 10)}.csv`,
            )
        }
    }

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800 print:bg-white print:text-black print:border-0 print:shadow-none">
            <style>{`
                @media print {
                    nav, .no-print { display: none !important; }
                    body { background: white !important; }
                }
            `}</style>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white print:text-black">Relatórios Financeiros</h2>
                    <p className="text-sm text-gray-400 print:text-gray-700">
                        Período: {periodLabel}
                        {prevLabel && <span className="ml-2 text-gray-500">(comparado a {prevLabel})</span>}
                    </p>
                </div>
                <div className="flex flex-wrap items-end gap-2 no-print">
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">De</label>
                        <input
                            type="date"
                            value={fromInput}
                            onChange={(e) => setFromInput(e.target.value)}
                            className="bg-black border border-neutral-700 text-white text-sm rounded p-2"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Até</label>
                        <input
                            type="date"
                            value={toInput}
                            onChange={(e) => setToInput(e.target.value)}
                            className="bg-black border border-neutral-700 text-white text-sm rounded p-2"
                        />
                    </div>
                    <button
                        onClick={applyPeriod}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium"
                    >
                        Aplicar
                    </button>
                    <button
                        onClick={exportCurrent}
                        className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded text-sm flex items-center gap-2 border border-neutral-700"
                        title="Exportar relatório atual como CSV"
                    >
                        <Download className="w-4 h-4" /> CSV
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded text-sm flex items-center gap-2 border border-neutral-700"
                        title="Imprimir relatório atual"
                    >
                        <Printer className="w-4 h-4" /> Imprimir
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-6 border-b border-neutral-800 no-print">
                {TABS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 transition-colors ${
                            tab === id
                                ? 'bg-neutral-800 text-white border-t border-x border-neutral-700'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                        {id === 'stock' && lowStock.length > 0 && (
                            <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                                {lowStock.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {tab === 'summary' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card
                            title="Receita"
                            value={BRL(summary.income)}
                            Icon={TrendingUp}
                            tint="text-green-400"
                            delta={deltas.income}
                            prevValue={prevSummary.income}
                        />
                        <Card
                            title="Despesa"
                            value={BRL(summary.expense)}
                            Icon={TrendingDown}
                            tint="text-red-400"
                            delta={deltas.expense}
                            prevValue={prevSummary.expense}
                            invertDelta
                        />
                        <Card
                            title="Saldo líquido"
                            value={BRL(summary.balance)}
                            Icon={Wallet}
                            tint={summary.balance >= 0 ? 'text-green-400' : 'text-red-400'}
                            delta={deltas.balance}
                            prevValue={prevSummary.balance}
                        />
                        <Card
                            title="OSs concluídas"
                            value={INT(summary.ordersCount)}
                            sub={`Ticket médio ${BRL(summary.avgTicket)}`}
                            Icon={Wrench}
                            tint="text-blue-400"
                            delta={deltas.ordersCount}
                            prevValue={prevSummary.ordersCount}
                        />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">Receita por método de pagamento</h3>
                        {Object.keys(summary.byMethod).length === 0 ? (
                            <p className="text-sm text-gray-500">Nenhuma receita no período.</p>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs uppercase text-gray-400">
                                    <tr>
                                        <th className="py-2">Método</th>
                                        <th className="py-2">Valor</th>
                                        <th className="py-2 w-1/2">% do total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(summary.byMethod)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([m, v]) => {
                                            const pct = summary.income ? (v / summary.income) * 100 : 0
                                            return (
                                                <tr key={m} className="border-b border-neutral-800 text-gray-200">
                                                    <td className="py-2">{m}</td>
                                                    <td className="py-2">{BRL(v)}</td>
                                                    <td className="py-2">
                                                        <div className="flex items-center gap-2">
                                                            <Bar value={v} max={summary.income} color="bg-green-500" />
                                                            <span className="text-xs text-gray-400 w-10">{pct.toFixed(0)}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {tab === 'evolution' && (
                <div className="space-y-4">
                    <div className="bg-black/30 border border-neutral-800 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">Receita vs Despesa no período</h3>
                        <div style={{ width: '100%', height: 360 }}>
                            <ResponsiveContainer>
                                <LineChart data={evolutionData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                    <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
                                    <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => `R$ ${Math.round(v)}`} />
                                    <Tooltip
                                        contentStyle={{ background: '#0a0a0a', border: '1px solid #27272a', borderRadius: 8 }}
                                        formatter={(v) => BRL(v)}
                                        labelStyle={{ color: '#f3f4f6' }}
                                    />
                                    <Legend wrapperStyle={{ color: '#f3f4f6', fontSize: 12 }} />
                                    <Line type="monotone" dataKey="income" name="Receita" stroke="#22c55e" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="expense" name="Despesa" stroke="#ef4444" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="balance" name="Saldo" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="text-xs text-gray-500">
                        Cada ponto é o fechamento do dia. Saldo = receita − despesa. Dias sem movimento aparecem em zero.
                    </div>
                </div>
            )}

            {tab === 'services' && (
                <RankingTable
                    rows={topServices}
                    columns={[
                        { label: 'Serviço', key: 'name' },
                        { label: 'Qtd', key: 'qty', format: INT, align: 'right' },
                        { label: 'Receita', key: 'revenue', format: BRL, align: 'right' },
                    ]}
                    barKey="qty"
                    barMax={maxServiceQty}
                    barColor="bg-blue-500"
                    emptyMsg="Nenhum serviço realizado no período."
                />
            )}

            {tab === 'products' && (
                <RankingTable
                    rows={topProducts}
                    columns={[
                        { label: 'Peça', key: 'name' },
                        { label: 'Qtd', key: 'qty', format: INT, align: 'right' },
                        { label: 'Receita', key: 'revenue', format: BRL, align: 'right' },
                    ]}
                    barKey="qty"
                    barMax={maxProductQty}
                    barColor="bg-amber-500"
                    emptyMsg="Nenhuma peça vendida no período."
                />
            )}

            {tab === 'clients' && (
                <RankingTable
                    rows={topClients}
                    columns={[
                        { label: 'Cliente', key: 'name' },
                        { label: 'OSs', key: 'orders', format: INT, align: 'right' },
                        { label: 'Receita', key: 'revenue', format: BRL, align: 'right' },
                        {
                            label: 'Última visita',
                            key: 'last',
                            format: (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '-'),
                            align: 'right',
                        },
                    ]}
                    barKey="revenue"
                    barMax={maxClientRevenue}
                    barColor="bg-purple-500"
                    emptyMsg="Nenhuma OS concluída no período."
                />
            )}

            {tab === 'daily' && (
                <div>
                    {dailyClosures.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum fechamento no período.</p>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase text-gray-400 border-b border-neutral-800">
                                <tr>
                                    <th className="py-2">Data</th>
                                    <th className="py-2 text-right">Receita</th>
                                    <th className="py-2 text-right">Despesa</th>
                                    <th className="py-2 text-right">Saldo</th>
                                    <th className="py-2 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailyClosures.map((c) => (
                                    <tr key={c.closure_date} className="border-b border-neutral-800 text-gray-200">
                                        <td className="py-2">{new Date(c.closure_date).toLocaleDateString('pt-BR')}</td>
                                        <td className="py-2 text-right text-green-400">{BRL(c.total_income)}</td>
                                        <td className="py-2 text-right text-red-400">{BRL(c.total_expense)}</td>
                                        <td className="py-2 text-right font-semibold">{BRL(c.net_balance)}</td>
                                        <td className="py-2 text-center">
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded-full ${
                                                    c.status === 'closed'
                                                        ? 'bg-green-900/40 text-green-300 border border-green-800'
                                                        : 'bg-yellow-900/40 text-yellow-300 border border-yellow-800'
                                                }`}
                                            >
                                                {c.status === 'closed' ? 'Fechado' : 'Aberto'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                <tr className="text-gray-100 font-semibold">
                                    <td className="py-3">Totais</td>
                                    <td className="py-3 text-right text-green-300">
                                        {BRL(dailyClosures.reduce((a, c) => a + Number(c.total_income || 0), 0))}
                                    </td>
                                    <td className="py-3 text-right text-red-300">
                                        {BRL(dailyClosures.reduce((a, c) => a + Number(c.total_expense || 0), 0))}
                                    </td>
                                    <td className="py-3 text-right">
                                        {BRL(dailyClosures.reduce((a, c) => a + Number(c.net_balance || 0), 0))}
                                    </td>
                                    <td />
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {tab === 'stock' && (
                <div className="space-y-4">
                    {lowStock.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-green-400 text-sm">✓ Nenhuma peça abaixo do estoque mínimo.</p>
                            <p className="text-gray-500 text-xs mt-1">Tudo em dia.</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-sm font-semibold text-red-300">
                                        {lowStock.length} {lowStock.length === 1 ? 'peça' : 'peças'} abaixo do estoque mínimo
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        Valor estimado para repor até o mínimo: {BRL(totalLowStockValue)}
                                    </div>
                                </div>
                            </div>
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs uppercase text-gray-400 border-b border-neutral-800">
                                    <tr>
                                        <th className="py-2">Peça</th>
                                        <th className="py-2 text-right">Atual</th>
                                        <th className="py-2 text-right">Mínimo</th>
                                        <th className="py-2 text-right">Faltam</th>
                                        <th className="py-2 text-right">Custo un.</th>
                                        <th className="py-2 text-right">Valor p/ repor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lowStock.map((p) => {
                                        const shortage = Math.max(0, Number(p.min_quantity || 0) - Number(p.quantity || 0))
                                        const repo = shortage * Number(p.cost_price || 0)
                                        return (
                                            <tr key={p.id} className="border-b border-neutral-800 text-gray-200">
                                                <td className="py-2 font-medium text-white">{p.name}</td>
                                                <td className="py-2 text-right text-red-400 font-bold">{INT(p.quantity || 0)}</td>
                                                <td className="py-2 text-right text-gray-400">{INT(p.min_quantity || 0)}</td>
                                                <td className="py-2 text-right text-yellow-400">{INT(shortage)}</td>
                                                <td className="py-2 text-right text-gray-400">{BRL(p.cost_price || 0)}</td>
                                                <td className="py-2 text-right font-semibold">{BRL(repo)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

function RankingTable({ rows, columns, barKey, barMax, barColor, emptyMsg, footnote }) {
    if (!rows.length) return <p className="text-sm text-gray-500">{emptyMsg}</p>
    return (
        <div>
            <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase text-gray-400 border-b border-neutral-800">
                    <tr>
                        <th className="py-2">#</th>
                        {columns.map((c) => (
                            <th key={c.key} className={`py-2 ${c.align === 'right' ? 'text-right' : ''}`}>
                                {c.label}
                            </th>
                        ))}
                        <th className="py-2 w-[15%]" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} className="border-b border-neutral-800 text-gray-200">
                            <td className="py-2 text-gray-500">{i + 1}</td>
                            {columns.map((c) => (
                                <td key={c.key} className={`py-2 ${c.align === 'right' ? 'text-right' : ''}`}>
                                    {c.format ? c.format(r[c.key]) : r[c.key]}
                                </td>
                            ))}
                            <td className="py-2">
                                <Bar value={r[barKey]} max={barMax} color={barColor} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {footnote && <div className="mt-2 text-xs text-gray-500 italic">{footnote}</div>}
        </div>
    )
}

"use client"
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    PieChart, Pie, Cell, Legend
} from 'recharts'
import {
    CalendarDays, TrendingUp, TrendingDown, PiggyBank, Lock, Unlock, Filter
} from 'lucide-react'

// Componente de "histórico + período" do movimento diário.
// Mostra:
//   - Filtros: intervalo de datas + status (todos/fechado/aberto)
//   - KPIs do período (entradas, saídas, saldo, dias com movimento)
//   - Gráfico de barras: entradas vs saídas por dia
//   - Gráfico de pizza: distribuição por forma de pagamento
//   - Lista de dias com link pro fechamento individual

export default function MovementPeriodReport({ onSelectDay }) {
    const supabase = createClient()
    const { companyId } = useAuth()

    // Default: mês corrente. Faz sentido pra balcão — eles pensam em "mês"
    // pra contas de oficina (aluguel, contas).
    const todayObj = new Date()
    const monthStart = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1)
    const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const [startDate, setStartDate] = useState(toDateStr(monthStart))
    const [endDate, setEndDate] = useState(toDateStr(todayObj))
    const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'closed' | 'open'

    const [transactions, setTransactions] = useState([])
    const [closures, setClosures] = useState([])
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        if (!companyId || !startDate || !endDate) return
        setLoading(true)

        const [sy, sm, sd] = startDate.split('-').map(Number)
        const [ey, em, ed] = endDate.split('-').map(Number)
        const startISO = new Date(sy, sm - 1, sd, 0, 0, 0).toISOString()
        const endISO = new Date(ey, em - 1, ed, 23, 59, 59).toISOString()

        const [{ data: txs }, { data: cls }] = await Promise.all([
            supabase
                .from('transactions')
                .select('amount, type, status, payment_method, date')
                .eq('tenant_id', companyId)
                .eq('status', 'paid')
                .gte('date', startISO)
                .lte('date', endISO),
            supabase
                .from('daily_closures')
                .select('closure_date, status')
                .eq('tenant_id', companyId)
                .gte('closure_date', startDate)
                .lte('closure_date', endDate)
        ])

        setTransactions(txs || [])
        setClosures(cls || [])
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [companyId, startDate, endDate])

    // ──────────────────────────────────────────────────────────────────────
    // Agregação por dia. Para cada dia no intervalo, calcula entradas/saídas
    // e marca se o movimento foi fechado (snapshot oficial).
    // ──────────────────────────────────────────────────────────────────────
    const closedSet = useMemo(
        () => new Set(closures.filter(c => c.status === 'closed').map(c => c.closure_date)),
        [closures]
    )

    const byDay = useMemo(() => {
        const map = {}
        for (const t of transactions) {
            const d = new Date(t.date)
            const key = toDateStr(d)
            if (!map[key]) map[key] = { day: key, income: 0, expense: 0 }
            if (t.type === 'income') map[key].income += Number(t.amount)
            else if (t.type === 'expense') map[key].expense += Number(t.amount)
        }
        return Object.values(map)
            .map(d => ({ ...d, net: d.income - d.expense, closed: closedSet.has(d.day) }))
            .sort((a, b) => a.day.localeCompare(b.day))
    }, [transactions, closedSet])

    const filteredDays = useMemo(() => {
        if (statusFilter === 'all') return byDay
        if (statusFilter === 'closed') return byDay.filter(d => d.closed)
        return byDay.filter(d => !d.closed)
    }, [byDay, statusFilter])

    // KPIs do período (sempre sobre o filtro aplicado)
    const totals = useMemo(() => {
        const income = filteredDays.reduce((acc, d) => acc + d.income, 0)
        const expense = filteredDays.reduce((acc, d) => acc + d.expense, 0)
        return { income, expense, net: income - expense, days: filteredDays.length }
    }, [filteredDays])

    // Distribuição por forma de pagamento (só receitas)
    const byMethod = useMemo(() => {
        const map = {}
        const filteredDaySet = new Set(filteredDays.map(d => d.day))
        for (const t of transactions) {
            if (t.type !== 'income') continue
            const dayKey = toDateStr(new Date(t.date))
            if (!filteredDaySet.has(dayKey)) continue
            const m = t.payment_method || 'Não informado'
            map[m] = (map[m] || 0) + Number(t.amount)
        }
        return Object.entries(map).map(([name, value]) => ({ name, value }))
    }, [transactions, filteredDays])

    const formatBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const formatDayPt = (d) => {
        const [y, m, dd] = d.split('-')
        return `${dd}/${m}/${y}`
    }

    const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#ef4444']

    return (
        <div className="space-y-6">
            {/* Filtros */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-end gap-4">
                <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" /> De
                    </label>
                    <input
                        type="date"
                        value={startDate}
                        max={endDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-white"
                    />
                </div>
                <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" /> Até
                    </label>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        max={toDateStr(todayObj)}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-white"
                    />
                </div>
                <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <Filter className="w-3 h-3" /> Status
                    </label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-white"
                    >
                        <option value="all">Todos</option>
                        <option value="closed">Fechados</option>
                        <option value="open">Abertos</option>
                    </select>
                </div>

                {/* Atalhos de período */}
                <div className="flex gap-2 ml-auto">
                    <button
                        type="button"
                        onClick={() => {
                            const d = new Date()
                            d.setDate(d.getDate() - 6)
                            setStartDate(toDateStr(d))
                            setEndDate(toDateStr(new Date()))
                        }}
                        className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-gray-200 rounded-lg text-sm border border-neutral-700"
                    >
                        7 dias
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const now = new Date()
                            setStartDate(toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)))
                            setEndDate(toDateStr(now))
                        }}
                        className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-gray-200 rounded-lg text-sm border border-neutral-700"
                    >
                        Mês atual
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const now = new Date()
                            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                            const end = new Date(now.getFullYear(), now.getMonth(), 0)
                            setStartDate(toDateStr(start))
                            setEndDate(toDateStr(end))
                        }}
                        className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-gray-200 rounded-lg text-sm border border-neutral-700"
                    >
                        Mês passado
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-gray-400 text-xs uppercase font-semibold tracking-wide">
                        <TrendingUp className="w-4 h-4 text-green-400" /> Entradas
                    </div>
                    <p className="text-2xl font-black text-green-400 mt-2">{formatBRL(totals.income)}</p>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-gray-400 text-xs uppercase font-semibold tracking-wide">
                        <TrendingDown className="w-4 h-4 text-red-400" /> Saídas
                    </div>
                    <p className="text-2xl font-black text-red-400 mt-2">{formatBRL(totals.expense)}</p>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-gray-400 text-xs uppercase font-semibold tracking-wide">
                        <PiggyBank className="w-4 h-4 text-blue-400" /> Saldo
                    </div>
                    <p className={`text-2xl font-black mt-2 ${totals.net >= 0 ? 'text-white' : 'text-red-400'}`}>{formatBRL(totals.net)}</p>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-gray-400 text-xs uppercase font-semibold tracking-wide">
                        <CalendarDays className="w-4 h-4 text-amber-400" /> Dias c/ movimento
                    </div>
                    <p className="text-2xl font-black text-white mt-2">{totals.days}</p>
                </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-4">Entradas vs Saídas por dia</h3>
                    {filteredDays.length === 0 ? (
                        <div className="h-72 flex items-center justify-center text-gray-500 text-sm">Sem dados no período.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={filteredDays}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                                <XAxis dataKey="day" stroke="#9ca3af" tickFormatter={(d) => d.slice(5)} />
                                <YAxis stroke="#9ca3af" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                                <Tooltip
                                    contentStyle={{ background: '#171717', border: '1px solid #404040', borderRadius: 8 }}
                                    labelFormatter={(d) => formatDayPt(d)}
                                    formatter={(v) => formatBRL(v)}
                                />
                                <Bar dataKey="income" fill="#22c55e" name="Entradas" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="expense" fill="#ef4444" name="Saídas" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-4">Forma de pagamento</h3>
                    {byMethod.length === 0 ? (
                        <div className="h-72 flex items-center justify-center text-gray-500 text-sm">Sem entradas.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie
                                    data={byMethod}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={90}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {byMethod.map((_, i) => (
                                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ background: '#171717', border: '1px solid #404040', borderRadius: 8 }}
                                    formatter={(v) => formatBRL(v)}
                                />
                                <Legend wrapperStyle={{ color: '#d1d5db', fontSize: 12 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Lista de dias */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Dias do período</h3>
                    <span className="text-xs text-gray-500">{filteredDays.length} dia{filteredDays.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-gray-500 animate-pulse">Carregando...</div>
                ) : filteredDays.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">Nenhum dia encontrado para o filtro selecionado.</div>
                ) : (
                    <div className="divide-y divide-neutral-800">
                        {[...filteredDays].reverse().map(d => (
                            <button
                                type="button"
                                key={d.day}
                                onClick={() => onSelectDay && onSelectDay(d.day)}
                                className="w-full text-left p-4 grid grid-cols-2 md:grid-cols-5 gap-3 hover:bg-neutral-800/50 transition"
                            >
                                <div className="flex items-center gap-2">
                                    <CalendarDays className="w-4 h-4 text-gray-500" />
                                    <span className="text-white font-medium">{formatDayPt(d.day)}</span>
                                </div>
                                <div className="text-green-400 font-semibold text-sm">{formatBRL(d.income)}</div>
                                <div className="text-red-400 font-semibold text-sm">{formatBRL(d.expense)}</div>
                                <div className={`font-bold text-sm ${d.net >= 0 ? 'text-white' : 'text-red-400'}`}>{formatBRL(d.net)}</div>
                                <div>
                                    {d.closed ? (
                                        <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-emerald-500/30">
                                            <Lock className="w-3 h-3" /> Fechado
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-500/30">
                                            <Unlock className="w-3 h-3" /> Aberto
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

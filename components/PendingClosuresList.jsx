"use client"
import { useEffect, useState } from 'react'
import { createClient } from '../utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import { AlertTriangle, Lock, ArrowLeft, CheckCircle2, CalendarDays } from 'lucide-react'

export default function PendingClosuresList() {
    const supabase = createClient()
    const router = useRouter()
    const { companyId } = useAuth()

    const [loading, setLoading] = useState(true)
    const [pendingDays, setPendingDays] = useState([])
    const [closedDays, setClosedDays] = useState([])

    const formatBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const formatDatePt = (dateStr) => {
        const [y, m, d] = dateStr.split('-')
        return `${d}/${m}/${y}`
    }

    const fetchData = async () => {
        if (!companyId) return
        setLoading(true)

        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const lookback = new Date(today)
        lookback.setDate(lookback.getDate() - 90)

        const lookbackISO = lookback.toISOString()
        const todayISO = today.toISOString()

        // Get all transactions in window (only past days, not today)
        const { data: txs } = await supabase
            .from('transactions')
            .select('date, amount, type, status')
            .eq('tenant_id', companyId)
            .gte('date', lookbackISO)
            .lt('date', todayISO)

        const { data: closures } = await supabase
            .from('daily_closures')
            .select('closure_date, status, total_income, net_balance')
            .eq('tenant_id', companyId)
            .gte('closure_date', lookback.toISOString().substring(0, 10))

        const closedMap = new Map(
            (closures || []).filter(c => c.status === 'closed').map(c => [c.closure_date, c])
        )

        // Aggregate by day (local)
        const byDay = new Map()
        for (const t of (txs || [])) {
            if (t.status !== 'paid') continue
            const d = new Date(t.date)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            if (!byDay.has(key)) byDay.set(key, { income: 0, expense: 0 })
            const cur = byDay.get(key)
            if (t.type === 'income') cur.income += Number(t.amount)
            else if (t.type === 'expense') cur.expense += Number(t.amount)
        }

        const pending = []
        const closed = []
        for (const [day, totals] of byDay.entries()) {
            const entry = {
                date: day,
                totalIncome: totals.income,
                totalExpense: totals.expense,
                net: totals.income - totals.expense
            }
            if (closedMap.has(day)) {
                const c = closedMap.get(day)
                closed.push({ ...entry, closure: c })
            } else {
                pending.push(entry)
            }
        }

        pending.sort((a, b) => b.date.localeCompare(a.date))
        closed.sort((a, b) => b.date.localeCompare(a.date))

        setPendingDays(pending)
        setClosedDays(closed)
        setLoading(false)
    }

    useEffect(() => {
        if (companyId) fetchData()
    }, [companyId])

    if (loading) {
        return <div className="p-8 text-center text-gray-400 animate-pulse">Carregando pendências...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between">
                <div>
                    <button
                        onClick={() => router.push('/financial/daily')}
                        className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mb-2 transition"
                    >
                        <ArrowLeft className="w-4 h-4" /> Voltar ao movimento de hoje
                    </button>
                    <h1 className="text-3xl font-black text-white tracking-tight">Pendências de Fechamento</h1>
                    <p className="text-gray-400 mt-1">Últimos 90 dias com movimento não fechado.</p>
                </div>
            </div>

            {/* Pending */}
            <div className="bg-black rounded-2xl border border-amber-900/40 p-6">
                <h2 className="text-lg font-bold text-amber-300 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Dias Pendentes ({pendingDays.length})
                </h2>

                {pendingDays.length === 0 ? (
                    <p className="text-gray-500 text-sm py-6 text-center">
                        Nenhum dia pendente. Tudo em dia.
                    </p>
                ) : (
                    <div className="divide-y divide-neutral-900">
                        {pendingDays.map(day => (
                            <div key={day.date} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                    <CalendarDays className="w-5 h-5 text-amber-400" />
                                    <div>
                                        <p className="text-white font-bold">{formatDatePt(day.date)}</p>
                                        <p className="text-xs text-gray-500">
                                            Entradas: <span className="text-green-400 font-semibold">{formatBRL(day.totalIncome)}</span> ·
                                            Saídas: <span className="text-red-400 font-semibold ml-1">{formatBRL(day.totalExpense)}</span> ·
                                            Saldo: <span className={`font-semibold ml-1 ${day.net >= 0 ? 'text-white' : 'text-red-400'}`}>{formatBRL(day.net)}</span>
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => router.push(`/financial/daily?date=${day.date}`)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg font-bold shadow-md flex items-center gap-2 transition"
                                >
                                    <Lock className="w-4 h-4" /> Fechar dia
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Closed */}
            <div className="bg-black rounded-2xl border border-emerald-900/30 p-6">
                <h2 className="text-lg font-bold text-emerald-300 mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Últimos Fechamentos
                </h2>

                {closedDays.length === 0 ? (
                    <p className="text-gray-500 text-sm py-6 text-center">
                        Nenhum fechamento registrado ainda.
                    </p>
                ) : (
                    <div className="divide-y divide-neutral-900">
                        {closedDays.slice(0, 15).map(day => (
                            <div key={day.date} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                    <div>
                                        <p className="text-white font-bold">{formatDatePt(day.date)}</p>
                                        <p className="text-xs text-gray-500">
                                            Entradas (snapshot): <span className="text-green-400 font-semibold">{formatBRL(day.closure.total_income)}</span> ·
                                            Saldo: <span className={`font-semibold ml-1 ${Number(day.closure.net_balance) >= 0 ? 'text-white' : 'text-red-400'}`}>
                                                {formatBRL(day.closure.net_balance)}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => router.push(`/financial/daily?date=${day.date}`)}
                                    className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-900 transition"
                                >
                                    Ver detalhes
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

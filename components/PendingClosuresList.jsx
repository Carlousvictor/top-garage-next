"use client"
import { useEffect, useState } from 'react'
import { createClient } from '../utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { AlertTriangle, Lock, ArrowLeft, CheckCircle2, CalendarDays } from 'lucide-react'

export default function PendingClosuresList() {
    const supabase = createClient()
    const router = useRouter()
    const { companyId, loading: authLoading } = useAuth()
    const toast = useToast()
    const confirm = useConfirm()

    const [loading, setLoading] = useState(true)
    const [pendingDays, setPendingDays] = useState([])
    const [closedDays, setClosedDays] = useState([])
    const [errorMsg, setErrorMsg] = useState('')
    const [closingDate, setClosingDate] = useState(null)

    const formatBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const formatDatePt = (dateStr) => {
        const [y, m, d] = dateStr.split('-')
        return `${d}/${m}/${y}`
    }

    const fetchData = async () => {
        if (!companyId) return
        setLoading(true)
        setErrorMsg('')

        try {
            const now = new Date()
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            const lookback = new Date(today)
            lookback.setDate(lookback.getDate() - 90)

            const lookbackISO = lookback.toISOString()
            const todayISO = today.toISOString()

            // Get all transactions in window (only past days, not today)
            const { data: txs, error: txErr } = await supabase
                .from('transactions')
                .select('date, amount, type, status, payment_method')
                .eq('tenant_id', companyId)
                .gte('date', lookbackISO)
                .lt('date', todayISO)
            if (txErr) throw txErr

            const { data: closures, error: clErr } = await supabase
                .from('daily_closures')
                .select('closure_date, status, total_income, net_balance')
                .eq('tenant_id', companyId)
                .gte('closure_date', lookback.toISOString().substring(0, 10))
            if (clErr) throw clErr

            const closedMap = new Map(
                (closures || []).filter(c => c.status === 'closed').map(c => [c.closure_date, c])
            )

            // Aggregate by day (local)
            const byDay = new Map()
            for (const t of (txs || [])) {
                if (t.status !== 'paid') continue
                const d = new Date(t.date)
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                if (!byDay.has(key)) byDay.set(key, { income: 0, expense: 0, byMethod: {} })
                const cur = byDay.get(key)
                if (t.type === 'income') {
                    cur.income += Number(t.amount)
                    const method = t.payment_method || 'Não Informado'
                    cur.byMethod[method] = (cur.byMethod[method] || 0) + Number(t.amount)
                }
                else if (t.type === 'expense') cur.expense += Number(t.amount)
            }

            const pending = []
            const closed = []
            for (const [day, totals] of byDay.entries()) {
                const entry = {
                    date: day,
                    totalIncome: totals.income,
                    totalExpense: totals.expense,
                    net: totals.income - totals.expense,
                    breakdownByMethod: totals.byMethod
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
        } catch (err) {
            console.error('Erro ao carregar pendências:', err)
            setErrorMsg(err?.message || 'Falha ao carregar pendências.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        // Aguarda auth resolver antes de decidir. Sem isso, se companyId
        // demorar a hidratar, o loading=true ficava eterno. Quando auth
        // termina sem tenant (caso raro de profile sem tenant_id), libera
        // o loading com mensagem clara em vez de skeleton infinito.
        if (authLoading) return
        if (!companyId) {
            setErrorMsg('Empresa não identificada na sessão. Tente recarregar a página.')
            setLoading(false)
            return
        }
        fetchData()
    }, [companyId, authLoading])

    const handleCloseDay = async (day) => {
        const ok = await confirm({
            title: 'Fechar dia retroativo',
            message: `Confirmar fechamento do dia ${formatDatePt(day.date)}?\n\nEntradas: ${formatBRL(day.totalIncome)}\nSaídas: ${formatBRL(day.totalExpense)}\nSaldo: ${formatBRL(day.net)}`,
            confirmLabel: 'Fechar dia',
        })
        if (!ok) return

        setClosingDate(day.date)
        try {
            const res = await fetch('/api/financial/closure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    closure_date: day.date,
                    total_income: day.totalIncome,
                    total_expense: day.totalExpense,
                    net_balance: day.net,
                    breakdown_by_method: day.breakdownByMethod || {},
                    observation: 'Fechado via Pendências de Fechamento'
                })
            })
            const json = await res.json()
            if (!res.ok) {
                toast.error('Erro ao fechar dia: ' + (json.error || res.statusText))
            } else {
                toast.success(`Dia ${formatDatePt(day.date)} fechado com sucesso.`)
                await fetchData()
            }
        } catch (err) {
            toast.error('Erro ao fechar dia: ' + err.message)
        } finally {
            setClosingDate(null)
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-400 animate-pulse">Carregando pendências...</div>
    }

    if (errorMsg) {
        return (
            <div className="p-8 text-center">
                <p className="text-red-400 mb-3">{errorMsg}</p>
                <button
                    onClick={() => router.push('/financial/daily')}
                    className="text-sm text-gray-300 underline"
                >
                    Voltar ao movimento de hoje
                </button>
            </div>
        )
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
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => router.push(`/financial/daily?date=${day.date}`)}
                                        className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-900 transition"
                                    >
                                        Ver detalhes
                                    </button>
                                    <button
                                        onClick={() => handleCloseDay(day)}
                                        disabled={closingDate === day.date}
                                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg font-bold shadow-md flex items-center gap-2 transition"
                                    >
                                        <Lock className="w-4 h-4" />
                                        {closingDate === day.date ? 'Fechando...' : 'Fechar dia'}
                                    </button>
                                </div>
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

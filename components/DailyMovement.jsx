"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import {
    ArrowRightLeft, TrendingUp, TrendingDown, DollarSign, Wallet,
    CreditCard, Landmark, PiggyBank, PlusCircle, Lock, Unlock,
    CalendarDays, CheckCircle2, AlertTriangle, BarChart3, Activity
} from 'lucide-react'
import MovementPeriodReport from './MovementPeriodReport'

export default function DailyMovement() {
    const supabase = createClient()
    const router = useRouter()
    const searchParams = useSearchParams()
    const { companyId, user } = useAuth()

    // Date selection (defaults to today). Accepts ?date=YYYY-MM-DD to close past days.
    const initialDate = (() => {
        const q = searchParams.get('date')
        if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    const [selectedDate, setSelectedDate] = useState(initialDate)
    // Aba ativa: 'daily' (movimento de um dia) ou 'period' (histórico + gráficos)
    const [activeTab, setActiveTab] = useState('daily')

    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)

    // Closure state for the selected date
    const [closure, setClosure] = useState(null)
    const [closing, setClosing] = useState(false)
    const [closeObservation, setCloseObservation] = useState('')
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false)

    // Expense Form Modal State
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
    const [expenseDesc, setExpenseDesc] = useState('')
    const [expenseAmount, setExpenseAmount] = useState('')
    const [expenseSubmitting, setExpenseSubmitting] = useState(false)

    const todayStr = (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    const isToday = selectedDate === todayStr
    const isClosed = closure?.status === 'closed'

    const formatInputCurrency = (value) => {
        if (!value) return ''
        const numericValue = value.toString().replace(/\D/g, '')
        const floatValue = parseFloat(numericValue) / 100
        return floatValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }

    const parseCurrency = (value) => {
        if (!value) return 0
        if (typeof value === 'number') return value
        const numericValue = value.toString().replace(/\D/g, '')
        return parseFloat(numericValue) / 100
    }

    const fetchMovement = async () => {
        if (!companyId || !selectedDate) return
        setLoading(true)

        const [y, m, d] = selectedDate.split('-').map(Number)
        const startOfDay = new Date(y, m - 1, d, 0, 0, 0).toISOString()
        const endOfDay = new Date(y, m - 1, d, 23, 59, 59).toISOString()

        const { data: txs } = await supabase
            .from('transactions')
            .select('*')
            .eq('tenant_id', companyId)
            .gte('date', startOfDay)
            .lte('date', endOfDay)
            .order('date', { ascending: false })

        setTransactions(txs || [])

        const { data: cls } = await supabase
            .from('daily_closures')
            .select('*')
            .eq('tenant_id', companyId)
            .eq('closure_date', selectedDate)
            .maybeSingle()

        setClosure(cls || null)
        setLoading(false)
    }

    useEffect(() => {
        if (companyId) fetchMovement()
    }, [companyId, selectedDate])

    const handleAddExpense = async (e) => {
        e.preventDefault()
        if (!expenseDesc || !expenseAmount) return
        if (isClosed) {
            alert('Movimento já fechado. Não é possível adicionar lançamentos.')
            return
        }

        setExpenseSubmitting(true)
        const amountNum = parseCurrency(expenseAmount)

        // If the user is viewing a past day, anchor the expense to that date (noon, to avoid TZ issues)
        let expenseDate
        if (isToday) {
            expenseDate = new Date().toISOString()
        } else {
            const [y, m, d] = selectedDate.split('-').map(Number)
            expenseDate = new Date(y, m - 1, d, 12, 0, 0).toISOString()
        }

        const { error } = await supabase.from('transactions').insert([{
            tenant_id: companyId,
            description: expenseDesc,
            type: 'expense',
            category: 'Despesa Diária',
            amount: amountNum,
            status: 'paid',
            date: expenseDate
        }])

        if (!error) {
            setIsExpenseModalOpen(false)
            setExpenseDesc('')
            setExpenseAmount('')
            fetchMovement()
        } else {
            alert('Erro ao adicionar despesa: ' + error.message)
        }
        setExpenseSubmitting(false)
    }

    // Calculations
    const incomes = transactions.filter(t => t.type === 'income' && t.status === 'paid')
    const expenses = transactions.filter(t => t.type === 'expense' && t.status === 'paid')

    const totalIncome = incomes.reduce((acc, t) => acc + Number(t.amount), 0)
    const totalExpense = expenses.reduce((acc, t) => acc + Number(t.amount), 0)
    const netBalance = totalIncome - totalExpense

    const incomesByMethod = incomes.reduce((acc, t) => {
        const method = t.payment_method || 'Não Informado'
        if (!acc[method]) acc[method] = 0
        acc[method] += Number(t.amount)
        return acc
    }, {})

    const getMethodIcon = (method) => {
        switch (method?.toLowerCase()) {
            case 'dinheiro': return <DollarSign className="w-5 h-5 text-green-500" />
            case 'pix': return <Landmark className="w-5 h-5 text-teal-400" />
            case 'cartão de crédito': return <CreditCard className="w-5 h-5 text-blue-400" />
            case 'cartão de débito': return <CreditCard className="w-5 h-5 text-indigo-400" />
            default: return <Wallet className="w-5 h-5 text-gray-400" />
        }
    }

    const handleCloseMovement = async () => {
        if (!companyId) return
        setClosing(true)

        const payload = {
            tenant_id: companyId,
            closure_date: selectedDate,
            total_income: totalIncome,
            total_expense: totalExpense,
            net_balance: netBalance,
            breakdown_by_method: incomesByMethod,
            status: 'closed',
            observation: closeObservation || null,
            closed_at: new Date().toISOString(),
            closed_by: user?.id || null
        }

        const { error } = await supabase
            .from('daily_closures')
            .upsert(payload, { onConflict: 'tenant_id,closure_date' })

        if (error) {
            alert('Erro ao fechar movimento: ' + error.message)
        } else {
            setIsCloseModalOpen(false)
            setCloseObservation('')
            await fetchMovement()
        }
        setClosing(false)
    }

    const formatDatePt = (dateStr) => {
        const [y, m, d] = dateStr.split('-')
        return `${d}/${m}/${y}`
    }

    const hasMovement = transactions.length > 0

    // Quando o usuário clica num dia da lista do relatório, troca pra aba Diário focando aquele dia.
    const handleSelectDayFromPeriod = (day) => {
        setSelectedDate(day)
        setActiveTab('daily')
    }

    return (
        <div className="space-y-6">
            {/* Abas */}
            <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 w-fit">
                <button
                    type="button"
                    onClick={() => setActiveTab('daily')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'daily'
                        ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    <Activity className="w-4 h-4" /> Diário
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('period')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'period'
                        ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    <BarChart3 className="w-4 h-4" /> Histórico & Período
                </button>
            </div>

            {activeTab === 'period' ? (
                <MovementPeriodReport onSelectDay={handleSelectDayFromPeriod} />
            ) : loading ? (
                <div className="p-8 text-center text-gray-400 animate-pulse">Carregando movimento do dia...</div>
            ) : (
            <>
            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        Movimento Diário
                        {isClosed && (
                            <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-xs font-bold uppercase px-2 py-1 rounded-full border border-emerald-500/30">
                                <Lock className="w-3 h-3" /> Fechado
                            </span>
                        )}
                        {!isClosed && (
                            <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 text-xs font-bold uppercase px-2 py-1 rounded-full border border-amber-500/30">
                                <Unlock className="w-3 h-3" /> Aberto
                            </span>
                        )}
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Fechamento de caixa do dia <strong className="text-gray-200">{formatDatePt(selectedDate)}</strong>
                        {!isToday && <span className="ml-2 text-amber-400">(dia retroativo)</span>}
                    </p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" /> Data
                        </label>
                        <input
                            type="date"
                            value={selectedDate}
                            max={todayStr}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                        />
                    </div>

                    <button
                        onClick={() => router.push('/financial/daily/pending')}
                        className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded-lg font-medium text-sm border border-neutral-700 flex items-center gap-2 transition"
                    >
                        <AlertTriangle className="w-4 h-4 text-amber-400" /> Pendências
                    </button>

                    <button
                        onClick={() => setIsExpenseModalOpen(true)}
                        disabled={isClosed}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-neutral-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-red-900/20 flex items-center gap-2 transition"
                    >
                        <PlusCircle className="w-5 h-5" /> Retirada / Despesa
                    </button>

                    {!isClosed && (
                        <button
                            onClick={() => setIsCloseModalOpen(true)}
                            disabled={!hasMovement}
                            title={!hasMovement ? 'Não há movimento para fechar neste dia.' : ''}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-emerald-900/20 flex items-center gap-2 transition"
                        >
                            <Lock className="w-5 h-5" /> Fechar Movimento
                        </button>
                    )}
                </div>
            </div>

            {isClosed && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="text-emerald-300 font-bold">Movimento fechado em {new Date(closure.closed_at).toLocaleString('pt-BR')}</p>
                        {closure.observation && (
                            <p className="text-emerald-400/80 mt-1">Obs.: {closure.observation}</p>
                        )}
                        <p className="text-emerald-400/70 text-xs mt-1">
                            Este snapshot será usado nos relatórios mesmo que transações futuras sejam alteradas.
                        </p>
                    </div>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-neutral-900 to-black p-6 rounded-2xl border border-neutral-800 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition duration-500">
                        <TrendingUp className="w-24 h-24 text-green-500" />
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                            <TrendingUp className="w-6 h-6 text-green-500" />
                        </div>
                        <h3 className="text-gray-400 font-medium">Entradas (Receitas)</h3>
                    </div>
                    <p className="text-3xl font-black text-green-400">
                        {totalIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                </div>

                <div className="bg-gradient-to-br from-neutral-900 to-black p-6 rounded-2xl border border-neutral-800 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition duration-500">
                        <TrendingDown className="w-24 h-24 text-red-500" />
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-red-500/10 rounded-lg">
                            <TrendingDown className="w-6 h-6 text-red-500" />
                        </div>
                        <h3 className="text-gray-400 font-medium">Saídas (Despesas)</h3>
                    </div>
                    <p className="text-3xl font-black text-red-400">
                        {totalExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                </div>

                <div className="bg-gradient-to-br from-blue-900/20 to-black p-6 rounded-2xl border border-blue-900/40 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition duration-500">
                        <PiggyBank className="w-24 h-24 text-blue-500" />
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <PiggyBank className="w-6 h-6 text-blue-400" />
                        </div>
                        <h3 className="text-blue-200 font-medium">Saldo do Dia em Caixa</h3>
                    </div>
                    <p className={`text-3xl font-black ${netBalance >= 0 ? 'text-white' : 'text-red-400'}`}>
                        {netBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Entradas por Forma de Pagamento */}
                <div className="lg:col-span-1 bg-black rounded-2xl border border-neutral-800 shadow-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-gray-400" /> Entradas por Forma
                    </h3>

                    <div className="space-y-4">
                        {Object.entries(incomesByMethod).map(([method, amount], idx) => (
                            <div key={idx} className="flex justify-between items-center bg-neutral-900 p-4 rounded-xl border border-neutral-800/50">
                                <div className="flex items-center gap-3">
                                    {getMethodIcon(method)}
                                    <span className="text-gray-300 font-medium">{method}</span>
                                </div>
                                <span className="text-white font-bold">{amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                        ))}

                        {Object.keys(incomesByMethod).length === 0 && (
                            <div className="text-center py-6 text-gray-500 text-sm">
                                Nenhuma entrada registrada.
                            </div>
                        )}
                    </div>
                </div>

                {/* Histórico Completo do Dia */}
                <div className="lg:col-span-2 bg-black rounded-2xl border border-neutral-800 shadow-xl p-6 overflow-hidden flex flex-col h-[500px]">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <ArrowRightLeft className="w-5 h-5 text-gray-400" /> Extrato Completo
                    </h3>

                    <div className="overflow-y-auto flex-1 pr-2 space-y-3">
                        {transactions.map(t => (
                            <div key={t.id} className="flex justify-between items-center bg-neutral-900 p-4 rounded-xl border border-neutral-800 border-l-4 border-l-transparent"
                                style={{ borderLeftColor: t.type === 'income' ? '#22c55e' : '#ef4444' }}>
                                <div>
                                    <p className="text-sm font-bold text-gray-200">{t.description}</p>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                        <span>{new Date(t.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                        {t.payment_method && (
                                            <span className="bg-neutral-800 px-2 py-0.5 rounded-full border border-neutral-700 text-gray-400">
                                                {t.payment_method}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className={`font-black ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                    {t.type === 'income' ? '+' : '-'} {Number(t.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                            </div>
                        ))}

                        {transactions.length === 0 && (
                            <div className="text-center py-10 text-gray-500">
                                Nenhum movimento registrado neste dia.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal for Expense */}
            {isExpenseModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-neutral-800">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <TrendingDown className="w-5 h-5 text-red-500" />
                                Adicionar Despesa / Retirada
                            </h2>
                        </div>
                        <form onSubmit={handleAddExpense} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Descrição</label>
                                <input
                                    type="text"
                                    required
                                    value={expenseDesc}
                                    onChange={(e) => setExpenseDesc(e.target.value)}
                                    className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                    placeholder="Ex: Compra de material, Pagamento de luz..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Valor (R$)</label>
                                <input
                                    type="text"
                                    required
                                    value={expenseAmount}
                                    onChange={(e) => setExpenseAmount(formatInputCurrency(e.target.value))}
                                    className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                    placeholder="R$ 0,00"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsExpenseModalOpen(false)}
                                    className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={expenseSubmitting}
                                    className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-lg shadow-red-900/20 transition disabled:opacity-50"
                                >
                                    {expenseSubmitting ? 'Salvando...' : 'Confirmar Saída'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal for Close Movement */}
            {isCloseModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-neutral-800">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Lock className="w-5 h-5 text-emerald-500" />
                                Fechar Movimento de {formatDatePt(selectedDate)}
                            </h2>
                            <p className="text-gray-400 text-sm mt-1">
                                Ao fechar, os valores abaixo serão gravados como snapshot oficial do dia para relatórios.
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="bg-neutral-950 rounded-lg p-3 border border-neutral-800">
                                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Entradas</p>
                                    <p className="text-green-400 font-bold">
                                        {totalIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                </div>
                                <div className="bg-neutral-950 rounded-lg p-3 border border-neutral-800">
                                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Saídas</p>
                                    <p className="text-red-400 font-bold">
                                        {totalExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                </div>
                                <div className="bg-neutral-950 rounded-lg p-3 border border-blue-900/40">
                                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Saldo</p>
                                    <p className={`font-bold ${netBalance >= 0 ? 'text-white' : 'text-red-400'}`}>
                                        {netBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Observação (opcional)</label>
                                <textarea
                                    rows={3}
                                    value={closeObservation}
                                    onChange={(e) => setCloseObservation(e.target.value)}
                                    className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition resize-none"
                                    placeholder="Ex: Caixa conferido e batido com extrato."
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCloseModalOpen(false)}
                                    className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCloseMovement}
                                    disabled={closing}
                                    className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-lg shadow-emerald-900/20 transition disabled:opacity-50"
                                >
                                    {closing ? 'Fechando...' : 'Confirmar Fechamento'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </>
            )}
        </div>
    )
}

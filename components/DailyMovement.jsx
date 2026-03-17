"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import { ArrowRightLeft, TrendingUp, TrendingDown, DollarSign, Wallet, CreditCard, Landmark, PiggyBank, PlusCircle } from 'lucide-react'

export default function DailyMovement() {
    const supabase = createClient()
    const router = useRouter()
    const { companyId } = useAuth()

    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)

    // Expense Form Modal State
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
    const [expenseDesc, setExpenseDesc] = useState('')
    const [expenseAmount, setExpenseAmount] = useState('')
    const [expenseSubmitting, setExpenseSubmitting] = useState(false)

    // Helper to format input value as user types (money mask)
    const formatInputCurrency = (value) => {
        if (!value) return ''
        const numericValue = value.toString().replace(/\D/g, '')
        const floatValue = parseFloat(numericValue) / 100
        return floatValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }

    // Helper to parse currency string back to float
    const parseCurrency = (value) => {
        if (!value) return 0
        if (typeof value === 'number') return value
        const numericValue = value.toString().replace(/\D/g, '')
        return parseFloat(numericValue) / 100
    }

    const fetchTodayTransactions = async () => {
        if (!companyId) return
        setLoading(true)
        
        // Get today boundaries in local time
        const now = new Date()
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('tenant_id', companyId)
            .gte('date', startOfDay)
            .lte('date', endOfDay)
            .order('date', { ascending: false })

        if (!error && data) {
            setTransactions(data)
        }
        setLoading(false)
    }

    useEffect(() => {
        if (companyId) {
            fetchTodayTransactions()
        }
    }, [companyId])

    const handleAddExpense = async (e) => {
        e.preventDefault()
        if (!expenseDesc || !expenseAmount) return
        
        setExpenseSubmitting(true)
        const amountNum = parseCurrency(expenseAmount)

        const { error } = await supabase.from('transactions').insert([{
            tenant_id: companyId,
            description: expenseDesc,
            type: 'expense',
            category: 'Despesa Diária',
            amount: amountNum,
            status: 'paid',
            date: new Date().toISOString()
        }])

        if (!error) {
            setIsExpenseModalOpen(false)
            setExpenseDesc('')
            setExpenseAmount('')
            fetchTodayTransactions()
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

    // Group incomes by payment method
    const incomesByMethod = incomes.reduce((acc, t) => {
        const method = t.payment_method || 'Não Informado'
        if (!acc[method]) acc[method] = 0
        acc[method] += Number(t.amount)
        return acc
    }, {})

    // Icons for payment methods
    const getMethodIcon = (method) => {
        switch (method?.toLowerCase()) {
            case 'dinheiro': return <DollarSign className="w-5 h-5 text-green-500" />
            case 'pix': return <Landmark className="w-5 h-5 text-teal-400" />
            case 'cartão de crédito': return <CreditCard className="w-5 h-5 text-blue-400" />
            case 'cartão de débito': return <CreditCard className="w-5 h-5 text-indigo-400" />
            default: return <Wallet className="w-5 h-5 text-gray-400" />
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-400 animate-pulse">Carregando movimento do dia...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Movimento Diário</h1>
                    <p className="text-gray-400 mt-1">Fechamento de caixa do dia {new Date().toLocaleDateString('pt-BR')}</p>
                </div>
                <button
                    onClick={() => setIsExpenseModalOpen(true)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-red-900/20 flex items-center gap-2 transition"
                >
                    <PlusCircle className="w-5 h-5" /> Retirada / Despesa
                </button>
            </div>

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
                                Nenhuma entrada registrada hoje.
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
                                Nenhum movimento registrado no dia de hoje.
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
        </div>
    )
}

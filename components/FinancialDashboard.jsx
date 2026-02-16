"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'

export default function FinancialDashboard() {
    const supabase = createClient()

    const [activeTab, setActiveTab] = useState('overview') // 'overview', 'payable', 'receivable'
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0, pendingPayable: 0, pendingReceivable: 0 })
    const [showForm, setShowForm] = useState(false)
    const [newTransaction, setNewTransaction] = useState({
        description: '',
        amount: '',
        type: 'expense',
        category: 'Geral',
        due_date: new Date().toISOString().split('T')[0],
        status: 'pending'
    })

    useEffect(() => {
        fetchTransactions()
    }, [activeTab])

    const fetchTransactions = async () => {
        setLoading(true)
        try {
            let query = supabase
                .from('transactions')
                .select('*')
                .order('due_date', { ascending: true })

            if (activeTab === 'overview') {
                query = query.eq('status', 'paid').order('date', { ascending: false }).limit(50)
            } else if (activeTab === 'payable') {
                query = query.eq('type', 'expense').eq('status', 'pending')
            } else if (activeTab === 'receivable') {
                query = query.eq('type', 'income').eq('status', 'pending')
            }

            const { data, error } = await query

            if (error) throw error

            setTransactions(data || [])
            if (activeTab === 'overview') {
                calculateSummary(data || [])
            } else {
                // For payable/receivable, we might want to calculate total pending
                calculatePendingSummary()
            }
        } catch (error) {
            console.error('Erro ao buscar transações:', error.message)
        } finally {
            setLoading(false)
        }
    }

    // Separate function to calculate global financial status
    const calculatePendingSummary = async () => {
        // This is a bit expensive, maybe optimize later with RPC
        const { data: incomeData } = await supabase.from('transactions').select('amount').eq('type', 'income').eq('status', 'paid')
        const { data: expenseData } = await supabase.from('transactions').select('amount').eq('type', 'expense').eq('status', 'paid')
        const { data: pendingPayData } = await supabase.from('transactions').select('amount').eq('type', 'expense').eq('status', 'pending')
        const { data: pendingRecData } = await supabase.from('transactions').select('amount').eq('type', 'income').eq('status', 'pending')

        const income = incomeData?.reduce((acc, t) => acc + Number(t.amount), 0) || 0
        const expense = expenseData?.reduce((acc, t) => acc + Number(t.amount), 0) || 0
        const pendingPayable = pendingPayData?.reduce((acc, t) => acc + Number(t.amount), 0) || 0
        const pendingReceivable = pendingRecData?.reduce((acc, t) => acc + Number(t.amount), 0) || 0

        setSummary({
            income,
            expense,
            balance: income - expense,
            pendingPayable,
            pendingReceivable
        })
    }

    const calculateSummary = (data) => {
        // For local overview calculation
        const income = data
            .filter(t => t.type === 'income')
            .reduce((acc, t) => acc + Number(t.amount), 0)

        const expense = data
            .filter(t => t.type === 'expense')
            .reduce((acc, t) => acc + Number(t.amount), 0)

        // We still want global pending stats
        calculatePendingSummary()
    }

    const handleCreateTransaction = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            const payload = {
                description: newTransaction.description,
                amount: parseFloat(newTransaction.amount),
                type: activeTab === 'payable' ? 'expense' : 'income',
                category: newTransaction.category,
                due_date: newTransaction.due_date,
                status: 'pending',
                date: new Date().toISOString() // Created date
            }

            const { error } = await supabase.from('transactions').insert([payload])
            if (error) throw error

            setShowForm(false)
            setNewTransaction({
                description: '',
                amount: '',
                type: 'expense',
                category: 'Geral',
                due_date: new Date().toISOString().split('T')[0],
                status: 'pending'
            })
            fetchTransactions()
        } catch (error) {
            alert('Erro ao criar transação: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleMarkAsPaid = async (id, type) => {
        if (!window.confirm('Confirmar recebimento/pagamento?')) return

        try {
            const { error } = await supabase
                .from('transactions')
                .update({ status: 'paid', date: new Date().toISOString() })
                .eq('id', id)

            if (error) throw error
            fetchTransactions()
        } catch (error) {
            alert('Erro ao atualizar status: ' + error.message)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-2xl font-bold text-white">Painel Financeiro</h2>
                <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'overview' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Visão Geral
                    </button>
                    <button
                        onClick={() => setActiveTab('payable')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'payable' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Contas a Pagar
                    </button>
                    <button
                        onClick={() => setActiveTab('receivable')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'receivable' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Contas a Receber
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-neutral-900 p-6 rounded-lg border border-neutral-800 shadow-lg">
                    <h3 className="text-gray-400 text-sm font-medium uppercase">Saldo Atual</h3>
                    <p className={`text-3xl font-bold mt-2 ${summary.balance >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                        R$ {summary.balance.toFixed(2)}
                    </p>
                </div>
                <div className="bg-neutral-900 p-6 rounded-lg border border-neutral-800 shadow-lg">
                    <h3 className="text-gray-400 text-sm font-medium uppercase">A Pagar (Pendente)</h3>
                    <p className="text-3xl font-bold text-orange-500 mt-2">
                        R$ {summary.pendingPayable.toFixed(2)}
                    </p>
                </div>
                <div className="bg-neutral-900 p-6 rounded-lg border border-neutral-800 shadow-lg">
                    <h3 className="text-gray-400 text-sm font-medium uppercase">A Receber (Pendente)</h3>
                    <p className="text-3xl font-bold text-green-500 mt-2">
                        R$ {summary.pendingReceivable.toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Actions for Payable/Receivable */}
            {(activeTab === 'payable' || activeTab === 'receivable') && !showForm && (
                <div className="flex justify-end">
                    <button
                        onClick={() => setShowForm(true)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        {activeTab === 'payable' ? '+ Nova Conta a Pagar' : '+ Nova Conta a Receber'}
                    </button>
                </div>
            )}

            {/* Form */}
            {showForm && (
                <form onSubmit={handleCreateTransaction} className="bg-neutral-900 p-6 rounded-lg border border-neutral-800 animate-fade-in">
                    <h3 className="text-lg font-bold text-white mb-4">
                        {activeTab === 'payable' ? 'Nova Conta a Pagar' : 'Nova Conta a Receber'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
                            <input
                                type="text"
                                required
                                value={newTransaction.description}
                                onChange={e => setNewTransaction({ ...newTransaction, description: e.target.value })}
                                className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                placeholder="Ex: Fornecedor X, Aluguel, etc."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Valor (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                required
                                value={newTransaction.amount}
                                onChange={e => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                                className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Vencimento</label>
                            <input
                                type="date"
                                required
                                value={newTransaction.due_date}
                                onChange={e => setNewTransaction({ ...newTransaction, due_date: e.target.value })}
                                className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Categoria</label>
                            <select
                                value={newTransaction.category}
                                onChange={e => setNewTransaction({ ...newTransaction, category: e.target.value })}
                                className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            >
                                <option>Geral</option>
                                <option>Fornecedores</option>
                                <option>Operacional</option>
                                <option>Pessoal</option>
                                <option>Outros</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-4 pt-6">
                        <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-medium">
                            Salvar
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="bg-neutral-700 hover:bg-neutral-600 text-gray-200 px-5 py-2.5 rounded-lg font-medium"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {/* List */}
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 shadow-lg overflow-hidden">
                <div className="p-4 border-b border-neutral-800">
                    <h3 className="text-lg font-bold text-white">
                        {activeTab === 'overview' ? 'Transações Recentes (Realizadas)' :
                            activeTab === 'payable' ? 'Contas a Pagar (Pendentes)' : 'Contas a Receber (Pendentes)'}
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-400 uppercase bg-black">
                            <tr>
                                <th className="px-6 py-3">{activeTab === 'overview' ? 'Data' : 'Vencimento'}</th>
                                <th className="px-6 py-3">Descrição</th>
                                <th className="px-6 py-3">Categoria</th>
                                <th className="px-6 py-3 text-right">Valor</th>
                                {activeTab !== 'overview' && <th className="px-6 py-3 text-right">Ações</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-4 text-center">Carregando...</td>
                                </tr>
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-4 text-center">Nenhum registro encontrado.</td>
                                </tr>
                            ) : (
                                transactions.map((t) => (
                                    <tr key={t.id} className="border-b border-neutral-800 hover:bg-neutral-800">
                                        <td className="px-6 py-4">
                                            {activeTab === 'overview'
                                                ? new Date(t.date).toLocaleDateString()
                                                : new Date(t.due_date).toLocaleDateString()
                                            }
                                        </td>
                                        <td className="px-6 py-4 font-medium text-white">{t.description}</td>
                                        <td className="px-6 py-4">
                                            <span className="bg-neutral-700 text-gray-300 py-1 px-2 rounded text-xs">
                                                {t.category || 'Geral'}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold ${t.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                                            {t.type === 'income' ? '+' : '-'} R$ {Number(t.amount).toFixed(2)}
                                        </td>
                                        {activeTab !== 'overview' && (
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleMarkAsPaid(t.id, t.type)}
                                                    className="text-green-500 hover:text-green-400 font-bold border border-green-900 bg-green-900/20 px-3 py-1 rounded"
                                                >
                                                    {t.type === 'expense' ? 'Pagar' : 'Receber'}
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

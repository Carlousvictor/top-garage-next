"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useToast } from '../context/ToastContext'
import { X } from 'lucide-react'

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Cartão de Débito', 'Cartão de Crédito', 'Transferência', 'Cheque']

// Props:
//   transaction: { id, description, amount, paid_amount }
//   onClose:   () => void
//   onSuccess: () => void  -- chamado depois do parcial salvar com sucesso
export default function PartialPaymentModal({ transaction, onClose, onSuccess }) {
    const supabase = createClient()
    const toast = useToast()

    const total = Number(transaction.amount || 0)
    const jaPago = Number(transaction.paid_amount || 0)
    const restante = Math.max(0, total - jaPago)

    const [valor, setValor] = useState(restante.toFixed(2))
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro')
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(false)

    // Carregar histórico de parciais desta transação ao abrir
    useEffect(() => {
        let cancelled = false
        supabase
            .from('transaction_partial_payments')
            .select('id, amount, payment_method, paid_at')
            .eq('transaction_id', transaction.id)
            .order('paid_at', { ascending: false })
            .then(({ data }) => {
                if (!cancelled) setHistory(data || [])
            })
        return () => { cancelled = true }
    }, [transaction.id])

    const handleSubmit = async (e) => {
        e.preventDefault()
        const v = parseFloat(valor)
        if (!Number.isFinite(v) || v <= 0) {
            toast.error('Informe um valor válido.')
            return
        }
        if (v > restante + 0.001) {
            toast.error(`Valor não pode exceder o restante (R$ ${restante.toFixed(2)}).`)
            return
        }
        setLoading(true)
        try {
            const res = await fetch('/api/transactions/partial-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    transaction_id: transaction.id,
                    amount: v,
                    payment_method: paymentMethod,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Erro ao registrar pagamento.')
            toast.success(json.status === 'paid' ? 'Conta totalmente quitada.' : 'Pagamento parcial registrado.')
            onSuccess()
            onClose()
        } catch (err) {
            toast.error(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg w-full max-w-md shadow-xl">
                <div className="flex justify-between items-center p-4 border-b border-neutral-800">
                    <h3 className="text-lg font-bold text-white">Pagar conta</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="text-sm text-gray-300">
                        <div className="font-medium text-white mb-2 truncate">{transaction.description}</div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-black p-2 rounded">
                                <div className="text-[11px] text-gray-500 uppercase">Total</div>
                                <div className="text-white font-bold">R$ {total.toFixed(2)}</div>
                            </div>
                            <div className="bg-black p-2 rounded">
                                <div className="text-[11px] text-gray-500 uppercase">Já pago</div>
                                <div className="text-emerald-400 font-bold">R$ {jaPago.toFixed(2)}</div>
                            </div>
                            <div className="bg-black p-2 rounded">
                                <div className="text-[11px] text-gray-500 uppercase">Restante</div>
                                <div className="text-orange-400 font-bold">R$ {restante.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Quanto pagar agora?</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={restante.toFixed(2)}
                            value={valor}
                            onChange={(e) => setValor(e.target.value)}
                            className="bg-black border border-neutral-700 text-white text-sm rounded-lg w-full p-2.5"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Forma de pagamento</label>
                        <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="bg-black border border-neutral-700 text-white text-sm rounded-lg w-full p-2.5"
                        >
                            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                        </select>
                    </div>

                    {history.length > 0 && (
                        <div className="border-t border-neutral-800 pt-3">
                            <div className="text-xs text-gray-400 uppercase mb-2">Histórico</div>
                            <ul className="space-y-1 text-sm">
                                {history.map(h => (
                                    <li key={h.id} className="flex justify-between text-gray-300">
                                        <span>{new Date(h.paid_at).toLocaleDateString()} — {h.payment_method}</span>
                                        <span className="font-bold">R$ {Number(h.amount).toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-gray-200 px-4 py-2 rounded-lg font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || restante <= 0}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

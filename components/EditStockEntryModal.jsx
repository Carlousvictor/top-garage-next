"use client"
import { useEffect, useState } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { X, Plus, Trash2, FileText, Save, AlertCircle } from 'lucide-react'
import CurrencyInput from './CurrencyInput'

// Edita uma NF já lançada. Carrega entry + items via GET, e ao salvar
// chama PUT que reverte estoque antigo e reaplica o novo. Para escopo
// inicial: permite editar header (fornecedor entre os existentes, número
// da NF, data de emissão, frete, desconto, modo de pagamento) e linhas
// de item (descrição, sku, ean, qtd, custo, margem, desconto por item).

const fmt = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function EditStockEntryModal({ entryId, isOpen, onClose, onSaved }) {
    const supabase = createClient()
    const { tenantId } = useAuth()
    const toast = useToast()

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [loadError, setLoadError] = useState(null)

    const [suppliers, setSuppliers] = useState([])
    const [supplierId, setSupplierId] = useState('')

    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [emissionDate, setEmissionDate] = useState('')
    const [items, setItems] = useState([])

    const [freightAmount, setFreightAmount] = useState(0)
    const [discountMode, setDiscountMode] = useState('total')
    const [discountAmount, setDiscountAmount] = useState(0)

    const [paymentMode, setPaymentMode] = useState('upfront')
    const [upfrontMethod, setUpfrontMethod] = useState('Dinheiro')
    const [installments, setInstallments] = useState([])

    const [xmlKey, setXmlKey] = useState(null)

    useEffect(() => {
        if (!isOpen || !entryId || !tenantId) return
        let cancelled = false
        const load = async () => {
            setLoading(true)
            setLoadError(null)
            try {
                const [entryRes, supRes] = await Promise.all([
                    fetch(`/api/stock/entries/${entryId}`, { credentials: 'include', cache: 'no-store' }),
                    supabase.from('suppliers').select('id, name, cnpj').eq('tenant_id', tenantId).order('name')
                ])
                const entryJson = await entryRes.json().catch(() => ({}))
                if (!entryRes.ok) throw new Error(entryJson.error || `HTTP ${entryRes.status}`)
                if (cancelled) return

                const { entry, items: entryItems, transactions } = entryJson

                setSuppliers(supRes.data || [])
                setSupplierId(entry.supplier_id || '')
                setInvoiceNumber(entry.invoice_number || '')
                setEmissionDate(entry.emission_date || '')
                setFreightAmount(Number(entry.freight_amount) || 0)
                setDiscountAmount(Number(entry.discount_amount) || 0)
                setDiscountMode(entry.discount_mode || 'total')
                setXmlKey(entry.xml_key || null)

                setItems((entryItems || []).map((it, idx) => ({
                    rowKey: it.id || idx,
                    id: it.id,
                    product_id: it.product_id,
                    sku: it.sku || '',
                    ean: it.ean || '',
                    name: it.name || '',
                    quantity: Number(it.quantity) || 0,
                    cost_price: Number(it.cost_price) || 0,
                    selling_price: Number(it.selling_price) || 0,
                    discount_amount: Number(it.discount_amount) || 0,
                    margin: Number(it.cost_price) > 0
                        ? Math.round(((Number(it.selling_price) / Number(it.cost_price)) - 1) * 10000) / 100
                        : 0
                })))

                // Reconstrói o modo de pagamento a partir das transações vinculadas.
                // À vista quando todas estão pagas e há apenas uma; parceladas quando há várias com due_date.
                const txs = transactions || []
                if (txs.length > 1 || (txs.length === 1 && txs[0].status === 'pending' && txs[0].due_date)) {
                    setPaymentMode('installments')
                    setInstallments(txs.map((t, i) => ({
                        rowKey: t.id || i,
                        id: t.id,
                        dueDate: t.due_date || '',
                        amount: Number(t.amount) || 0,
                        paymentMethod: t.payment_method || 'Boleto',
                        status: t.status || 'pending'
                    })))
                } else {
                    setPaymentMode('upfront')
                    setUpfrontMethod(txs[0]?.payment_method || 'Dinheiro')
                    setInstallments([])
                }
            } catch (err) {
                if (!cancelled) setLoadError(err.message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [isOpen, entryId, tenantId])

    const handleItemChange = (rowKey, field, value) => {
        setItems(prev => prev.map(it => {
            if (it.rowKey !== rowKey) return it
            const next = { ...it, [field]: value }
            const qty = parseFloat(next.quantity) || 0
            const cost = parseFloat(next.cost_price) || 0
            const m = parseFloat(next.margin) || 0
            if (field === 'cost_price' || field === 'margin' || field === 'quantity') {
                next.selling_price = +(cost * (1 + m / 100)).toFixed(4)
            }
            return next
        }))
    }

    const handleAddItem = () => {
        setItems(prev => [...prev, {
            rowKey: `new-${Date.now()}-${Math.random()}`,
            id: null,
            product_id: null,
            sku: '',
            ean: '',
            name: '',
            quantity: 1,
            cost_price: 0,
            selling_price: 0,
            discount_amount: 0,
            margin: 30
        }])
    }

    const handleRemoveItem = (rowKey) => {
        setItems(prev => prev.filter(it => it.rowKey !== rowKey))
    }

    const subtotalBruto = items.reduce(
        (acc, it) => acc + (parseFloat(it.cost_price) || 0) * (parseFloat(it.quantity) || 0),
        0
    )
    const totalDiscountApplied = discountMode === 'total'
        ? (parseFloat(discountAmount) || 0)
        : items.reduce((acc, it) => acc + (parseFloat(it.discount_amount) || 0), 0)
    const totalCalc = subtotalBruto + (parseFloat(freightAmount) || 0) - totalDiscountApplied
    const installmentsTotal = installments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0)

    const validate = () => {
        if (!supplierId) return 'Selecione um fornecedor.'
        if (!invoiceNumber.trim()) return 'Informe o número da NF.'
        if (items.length === 0) return 'Adicione ao menos um item.'
        for (const it of items) {
            if (!it.name.trim()) return 'Todos os itens precisam de descrição.'
            const q = parseFloat(it.quantity)
            if (!q || q <= 0) return `Quantidade inválida em "${it.name}".`
            const c = parseFloat(it.cost_price)
            if (!c || c <= 0) return `Preço de custo inválido em "${it.name}".`
        }
        if (totalCalc < 0) return 'Total da NF ficou negativo.'
        if (paymentMode === 'installments') {
            if (installments.length === 0) return 'Adicione ao menos uma parcela.'
            for (const p of installments) {
                if (!p.dueDate) return 'Cada parcela precisa de vencimento.'
                if (!p.amount || p.amount <= 0) return 'Valor de parcela inválido.'
            }
            if (Math.abs(installmentsTotal - totalCalc) > 0.05) {
                return `Soma das parcelas (${fmt(installmentsTotal)}) não bate com total (${fmt(totalCalc)}).`
            }
        }
        return null
    }

    const handleSave = async () => {
        const err = validate()
        if (err) { toast.error(err); return }
        const supplierObj = suppliers.find(s => s.id === supplierId)
        if (!supplierObj) { toast.error('Fornecedor inválido.'); return }

        setSaving(true)
        try {
            const payload = {
                supplier: { isNew: false, id: supplierObj.id, name: supplierObj.name },
                invoiceNumber: invoiceNumber.trim(),
                emissionDate,
                items: items.map(it => ({
                    product_id: it.product_id || null,
                    name: it.name.trim(),
                    sku: it.sku || '',
                    ean: it.ean || '',
                    quantity: parseFloat(it.quantity) || 0,
                    cost_price: parseFloat(it.cost_price) || 0,
                    margin: parseFloat(it.margin) || 0,
                    selling_price: parseFloat(it.selling_price) || 0,
                    discount_amount: discountMode === 'per_item' ? (parseFloat(it.discount_amount) || 0) : 0
                })),
                freightAmount: parseFloat(freightAmount) || 0,
                discountMode,
                discountAmount: discountMode === 'total' ? (parseFloat(discountAmount) || 0) : 0,
                paymentMode,
                upfrontMethod,
                installments: paymentMode === 'installments'
                    ? installments.map(p => ({
                        dueDate: p.dueDate,
                        amount: parseFloat(p.amount) || 0,
                        paymentMethod: p.paymentMethod,
                        status: p.status
                    }))
                    : []
            }
            const res = await fetch(`/api/stock/entries/${entryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
            toast.success('Nota atualizada. Estoque e contas reajustados.')
            if (typeof onSaved === 'function') onSaved()
            onClose()
        } catch (e) {
            toast.error('Falha ao salvar: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-6xl my-6 shadow-2xl">
                <div className="flex items-center justify-between p-4 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-red-500" />
                        <h2 className="text-lg font-bold text-white">Editar Nota Fiscal</h2>
                        {xmlKey && (
                            <span className="text-[10px] uppercase tracking-wider bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 font-bold">
                                Origem XML
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-gray-400">Carregando NF...</div>
                ) : loadError ? (
                    <div className="p-6">
                        <div className="bg-red-900/30 border border-red-800/60 rounded-2xl p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-red-200">Erro ao carregar NF</p>
                                <p className="text-xs text-red-300/80 mt-1">{loadError}</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-6 space-y-6">
                        {xmlKey && (
                            <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-lg p-3 text-xs text-yellow-300/90">
                                Atenção: edição de notas importadas por XML é permitida, mas os ajustes feitos aqui não voltam para o XML original. Estoque e financeiro serão reajustados.
                            </div>
                        )}

                        {/* Header */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Fornecedor *</label>
                                <select
                                    value={supplierId}
                                    onChange={(e) => setSupplierId(e.target.value)}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
                                >
                                    <option value="">Selecione...</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.cnpj})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Nº da NF *</label>
                                <input
                                    type="text"
                                    value={invoiceNumber}
                                    onChange={(e) => setInvoiceNumber(e.target.value)}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Data de Emissão</label>
                                <input
                                    type="date"
                                    value={emissionDate}
                                    onChange={(e) => setEmissionDate(e.target.value)}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Frete</label>
                                    <CurrencyInput
                                        value={freightAmount}
                                        onChange={setFreightAmount}
                                        decimals={3}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Modo Desconto</label>
                                    <select
                                        value={discountMode}
                                        onChange={(e) => setDiscountMode(e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm"
                                    >
                                        <option value="total">Total (rateado)</option>
                                        <option value="per_item">Por item</option>
                                    </select>
                                </div>
                            </div>
                            {discountMode === 'total' && (
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Desconto Total</label>
                                    <CurrencyInput
                                        value={discountAmount}
                                        onChange={setDiscountAmount}
                                        decimals={3}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Items */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm uppercase tracking-wide text-gray-400 font-bold">Itens</h3>
                                <button
                                    onClick={handleAddItem}
                                    className="flex items-center gap-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white px-3 py-1.5 rounded-lg"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Adicionar item
                                </button>
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-neutral-800">
                                <table className="w-full text-sm">
                                    <thead className="text-xs text-gray-200 uppercase bg-black">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Descrição</th>
                                            <th className="px-3 py-2 text-left">SKU</th>
                                            <th className="px-3 py-2 text-left">EAN</th>
                                            <th className="px-3 py-2 text-right">Qtd</th>
                                            <th className="px-3 py-2 text-right">Custo</th>
                                            <th className="px-3 py-2 text-right">Margem %</th>
                                            <th className="px-3 py-2 text-right">Venda</th>
                                            {discountMode === 'per_item' && <th className="px-3 py-2 text-right">Desc</th>}
                                            <th className="px-3 py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.length === 0 ? (
                                            <tr><td colSpan={discountMode === 'per_item' ? 9 : 8} className="text-center py-6 text-gray-500">Nenhum item.</td></tr>
                                        ) : items.map(it => (
                                            <tr key={it.rowKey} className="border-b border-neutral-800">
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="text"
                                                        value={it.name}
                                                        onChange={(e) => handleItemChange(it.rowKey, 'name', e.target.value)}
                                                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-sm"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="text"
                                                        value={it.sku}
                                                        onChange={(e) => handleItemChange(it.rowKey, 'sku', e.target.value)}
                                                        className="w-24 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="text"
                                                        value={it.ean}
                                                        onChange={(e) => handleItemChange(it.rowKey, 'ean', e.target.value.replace(/\D/g, ''))}
                                                        className="w-32 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        value={it.quantity}
                                                        onChange={(e) => handleItemChange(it.rowKey, 'quantity', e.target.value)}
                                                        className="w-20 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <CurrencyInput
                                                        value={it.cost_price}
                                                        onChange={(n) => handleItemChange(it.rowKey, 'cost_price', n)}
                                                        decimals={4}
                                                        className="w-28 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        value={it.margin}
                                                        onChange={(e) => handleItemChange(it.rowKey, 'margin', e.target.value)}
                                                        className="w-20 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <CurrencyInput
                                                        value={it.selling_price}
                                                        onChange={(n) => handleItemChange(it.rowKey, 'selling_price', n)}
                                                        decimals={4}
                                                        className="w-28 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-green-400 font-bold text-right"
                                                    />
                                                </td>
                                                {discountMode === 'per_item' && (
                                                    <td className="px-3 py-2">
                                                        <CurrencyInput
                                                            value={it.discount_amount}
                                                            onChange={(n) => handleItemChange(it.rowKey, 'discount_amount', n)}
                                                            decimals={3}
                                                            className="w-24 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-red-300 text-right"
                                                        />
                                                    </td>
                                                )}
                                                <td className="px-3 py-2">
                                                    <button
                                                        onClick={() => handleRemoveItem(it.rowKey)}
                                                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition"
                                                        title="Remover item"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div className="bg-neutral-800/50 rounded-lg p-3">
                                    <p className="text-[11px] uppercase text-gray-400">Subtotal</p>
                                    <p className="text-white font-bold">{fmt(subtotalBruto)}</p>
                                </div>
                                <div className="bg-neutral-800/50 rounded-lg p-3">
                                    <p className="text-[11px] uppercase text-gray-400">Frete</p>
                                    <p className="text-white font-bold">{fmt(freightAmount)}</p>
                                </div>
                                <div className="bg-neutral-800/50 rounded-lg p-3">
                                    <p className="text-[11px] uppercase text-gray-400">Desconto</p>
                                    <p className="text-red-300 font-bold">- {fmt(totalDiscountApplied)}</p>
                                </div>
                                <div className="bg-green-900/30 border border-green-800/50 rounded-lg p-3">
                                    <p className="text-[11px] uppercase text-green-400">Total NF</p>
                                    <p className="text-green-300 font-bold">{fmt(totalCalc)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Pagamento */}
                        <div>
                            <h3 className="text-sm uppercase tracking-wide text-gray-400 font-bold mb-3">Pagamento</h3>
                            <div className="flex gap-2 mb-3">
                                <button
                                    onClick={() => setPaymentMode('upfront')}
                                    className={`px-3 py-1.5 rounded-lg text-sm border ${paymentMode === 'upfront' ? 'bg-red-600 border-red-600 text-white' : 'bg-neutral-800 border-neutral-700 text-gray-300'}`}
                                >
                                    À vista
                                </button>
                                <button
                                    onClick={() => setPaymentMode('installments')}
                                    className={`px-3 py-1.5 rounded-lg text-sm border ${paymentMode === 'installments' ? 'bg-red-600 border-red-600 text-white' : 'bg-neutral-800 border-neutral-700 text-gray-300'}`}
                                >
                                    Parcelado
                                </button>
                            </div>

                            {paymentMode === 'upfront' ? (
                                <div className="w-full md:w-1/3">
                                    <label className="block text-sm text-gray-300 mb-1">Forma de pagamento</label>
                                    <select
                                        value={upfrontMethod}
                                        onChange={(e) => setUpfrontMethod(e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm"
                                    >
                                        <option>Dinheiro</option>
                                        <option>PIX</option>
                                        <option>Cartão Débito</option>
                                        <option>Cartão Crédito</option>
                                        <option>Boleto</option>
                                    </select>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {installments.map((p, idx) => (
                                        <div key={p.rowKey || idx} className="flex flex-wrap gap-2 items-end bg-neutral-800/50 p-3 rounded-lg">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Vencimento</label>
                                                <input
                                                    type="date"
                                                    value={p.dueDate}
                                                    onChange={(e) => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, dueDate: e.target.value } : x))}
                                                    className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-white text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Valor</label>
                                                <CurrencyInput
                                                    value={p.amount}
                                                    onChange={(n) => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, amount: n } : x))}
                                                    decimals={2}
                                                    className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-white text-sm w-32"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Forma</label>
                                                <select
                                                    value={p.paymentMethod}
                                                    onChange={(e) => setInstallments(prev => prev.map((x, i) => i === idx ? { ...x, paymentMethod: e.target.value } : x))}
                                                    className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-white text-sm"
                                                >
                                                    <option>Boleto</option>
                                                    <option>PIX</option>
                                                    <option>Depósito</option>
                                                    <option>Dinheiro</option>
                                                    <option>Cartão Crédito</option>
                                                    <option>Cartão Débito</option>
                                                </select>
                                            </div>
                                            <button
                                                onClick={() => setInstallments(prev => prev.filter((_, i) => i !== idx))}
                                                className="p-2 text-red-500 hover:bg-red-500/10 rounded"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setInstallments(prev => [...prev, {
                                            rowKey: `new-${Date.now()}-${Math.random()}`,
                                            dueDate: '',
                                            amount: 0,
                                            paymentMethod: 'Boleto',
                                            status: 'pending'
                                        }])}
                                        className="flex items-center gap-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white px-3 py-1.5 rounded-lg"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Adicionar parcela
                                    </button>
                                    {installments.length > 0 && (
                                        <p className="text-xs text-gray-400 mt-2">
                                            Soma das parcelas: <span className="text-orange-300 font-bold">{fmt(installmentsTotal)}</span>
                                            {Math.abs(installmentsTotal - totalCalc) > 0.05 && (
                                                <span className="text-red-400 ml-2">⚠ não bate com total {fmt(totalCalc)}</span>
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="p-4 border-t border-neutral-800 bg-black/30 flex justify-end gap-3 sticky bottom-0 rounded-b-2xl">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-gray-200 rounded-lg text-sm"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading || !!loadError}
                        className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    )
}

"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'
import CreatableSelect from 'react-select/creatable'
import { Plus, Trash2, FileText, CheckCircle2, AlertCircle } from 'lucide-react'

// Estilo dark do react-select alinhado ao resto do app.
const selectStyles = {
    control: (base, state) => ({
        ...base,
        backgroundColor: '#000',
        borderColor: state.isFocused ? '#ef4444' : '#404040',
        borderRadius: 8,
        minHeight: 42,
        boxShadow: 'none',
        '&:hover': { borderColor: '#ef4444' }
    }),
    singleValue: (base) => ({ ...base, color: '#fff' }),
    input: (base) => ({ ...base, color: '#fff' }),
    placeholder: (base) => ({ ...base, color: '#9ca3af' }),
    menu: (base) => ({ ...base, backgroundColor: '#171717', border: '1px solid #404040', zIndex: 30 }),
    option: (base, state) => ({ ...base, backgroundColor: state.isFocused ? '#404040' : 'transparent', color: '#fff' }),
    indicatorSeparator: () => ({ display: 'none' })
}

// Entrada manual de Nota Fiscal — usada quando não há XML disponível.
// Persiste nas mesmas tabelas que o fluxo de XML: suppliers, products, stock_entries, transactions.
// O `xml_key` da stock_entry fica null (chave que distingue manual vs XML em relatórios futuros).
export default function ManualStockEntry() {
    const supabase = createClient()
    const { tenantId } = useAuth()

    const [suppliers, setSuppliers] = useState([])
    const [supplierOption, setSupplierOption] = useState(null) // {value, label, isNew?, cnpj?}
    const [supplierCnpjForNew, setSupplierCnpjForNew] = useState('')

    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [emissionDate, setEmissionDate] = useState(() => new Date().toISOString().split('T')[0])
    const [defaultMargin, setDefaultMargin] = useState(30)

    const [items, setItems] = useState([])

    // Pagamento: 'upfront' (à vista) | 'installments' (a prazo)
    const [paymentMode, setPaymentMode] = useState('upfront')
    const [upfrontMethod, setUpfrontMethod] = useState('Dinheiro')
    const [installments, setInstallments] = useState([])

    const [logs, setLogs] = useState([])
    const [submitting, setSubmitting] = useState(false)

    const addLog = (message, type = 'info') => {
        setLogs(prev => [...prev, { message, type, time: new Date().toLocaleTimeString() }])
    }

    useEffect(() => {
        const fetchSuppliers = async () => {
            const { data } = await supabase.from('suppliers').select('id, name, cnpj').order('name')
            setSuppliers(data || [])
        }
        if (tenantId) fetchSuppliers()
    }, [tenantId])

    const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name, cnpj: s.cnpj }))

    const handleSupplierChange = (opt) => {
        if (opt && opt.__isNew__) {
            setSupplierOption({ value: null, label: opt.label, isNew: true })
            setSupplierCnpjForNew('')
        } else {
            setSupplierOption(opt)
            setSupplierCnpjForNew('')
        }
    }

    const handleAddItem = () => {
        setItems(prev => [...prev, {
            id: Date.now() + Math.random(),
            name: '',
            sku: '',
            ean: '',
            quantity: 1,
            cost_price: 0,
            margin: defaultMargin,
            selling_price: 0
        }])
    }

    const handleUpdateItem = (id, field, value) => {
        setItems(prev => prev.map(it => {
            if (it.id !== id) return it
            const next = { ...it, [field]: value }
            // Recalcula selling_price quando custo ou margem muda
            if (field === 'cost_price' || field === 'margin') {
                const cost = parseFloat(field === 'cost_price' ? value : next.cost_price) || 0
                const m = parseFloat(field === 'margin' ? value : next.margin) || 0
                next.selling_price = +(cost * (1 + m / 100)).toFixed(2)
            }
            return next
        }))
    }

    const handleRemoveItem = (id) => {
        setItems(prev => prev.filter(it => it.id !== id))
    }

    const total = items.reduce((acc, it) => acc + (parseFloat(it.cost_price) || 0) * (parseFloat(it.quantity) || 0), 0)

    const handleAddInstallment = () => {
        setInstallments(prev => [...prev, {
            id: Date.now() + Math.random(),
            dueDate: '',
            amount: 0,
            paymentMethod: 'Boleto'
        }])
    }
    const handleUpdateInstallment = (id, field, value) => {
        setInstallments(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
    }
    const handleRemoveInstallment = (id) => {
        setInstallments(prev => prev.filter(p => p.id !== id))
    }
    const installmentsTotal = installments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0)

    const validate = () => {
        if (!supplierOption) return 'Selecione ou cadastre um fornecedor.'
        if (supplierOption.isNew && !supplierCnpjForNew.trim()) return 'Informe o CNPJ do novo fornecedor.'
        if (!invoiceNumber.trim()) return 'Informe o número da NF.'
        if (items.length === 0) return 'Adicione ao menos um item à nota.'
        for (const it of items) {
            if (!it.name.trim()) return 'Todos os itens precisam de descrição.'
            if (!it.quantity || it.quantity <= 0) return `Quantidade inválida em "${it.name}".`
            if (!it.cost_price || it.cost_price <= 0) return `Preço de custo inválido em "${it.name}".`
        }
        if (paymentMode === 'installments') {
            if (installments.length === 0) return 'Adicione ao menos uma parcela.'
            for (const p of installments) {
                if (!p.dueDate) return 'Cada parcela precisa de data de vencimento.'
                if (!p.amount || p.amount <= 0) return 'Valor de parcela inválido.'
            }
            const diff = Math.abs(installmentsTotal - total)
            if (diff > 0.05) return `Soma das parcelas (R$ ${installmentsTotal.toFixed(2)}) não bate com total da NF (R$ ${total.toFixed(2)}).`
        }
        return null
    }

    const handleSubmit = async () => {
        const err = validate()
        if (err) { addLog(err, 'error'); return }
        if (!tenantId) { addLog('Tenant não identificado.', 'error'); return }

        setSubmitting(true)
        setLogs([])

        try {
            // 1. Resolver fornecedor (existente ou criar)
            let supplierId
            if (supplierOption.isNew) {
                addLog(`Criando fornecedor "${supplierOption.label}"...`)
                const { data, error } = await supabase
                    .from('suppliers')
                    .insert([{ tenant_id: tenantId, name: supplierOption.label, cnpj: supplierCnpjForNew.trim() }])
                    .select()
                    .single()
                if (error) throw new Error(`Erro criar fornecedor: ${error.message}`)
                supplierId = data.id
            } else {
                supplierId = supplierOption.value
            }

            // 2. Upsert produtos por (sku + supplier) — mesma estratégia do XML
            //    Sem EAN porque o usuário pode não ter, e match por nome é arriscado.
            for (const it of items) {
                let existingProd = null
                if (it.sku && it.sku.trim()) {
                    const { data } = await supabase
                        .from('products')
                        .select('id, quantity')
                        .eq('tenant_id', tenantId)
                        .eq('sku', it.sku.trim())
                        .eq('supplier_id', supplierId)
                        .maybeSingle()
                    existingProd = data
                }

                if (existingProd) {
                    await supabase.from('products').update({
                        quantity: Number(existingProd.quantity || 0) + parseFloat(it.quantity),
                        cost_price: parseFloat(it.cost_price),
                        selling_price: parseFloat(it.selling_price),
                        supplier_id: supplierId
                    }).eq('id', existingProd.id)
                } else {
                    await supabase.from('products').insert([{
                        tenant_id: tenantId,
                        sku: it.sku?.trim() || null,
                        ean: it.ean?.trim() || null,
                        name: it.name.trim(),
                        cost_price: parseFloat(it.cost_price),
                        selling_price: parseFloat(it.selling_price),
                        quantity: parseFloat(it.quantity),
                        profit_margin_percent: parseFloat(it.margin) || 0,
                        supplier_id: supplierId
                    }])
                }
            }

            // 3. Stock entry — xml_key NULL marca origem manual
            const { data: entry, error: entryErr } = await supabase
                .from('stock_entries')
                .insert([{
                    tenant_id: tenantId,
                    supplier_id: supplierId,
                    xml_key: null,
                    total_value: total
                }])
                .select()
                .single()
            if (entryErr) throw entryErr

            // 4. Transactions (mesmo padrão do XML)
            const nowIso = new Date().toISOString()
            const supplierLabel = supplierOption.isNew ? supplierOption.label : (suppliers.find(s => s.id === supplierId)?.name || 'Fornecedor')
            let txRows
            if (paymentMode === 'installments') {
                txRows = installments.map((p, idx) => ({
                    tenant_id: tenantId,
                    description: `NF ${invoiceNumber} - ${supplierLabel} (${idx + 1}/${installments.length})`,
                    type: 'expense',
                    category: 'Fornecedores',
                    amount: parseFloat(p.amount),
                    due_date: p.dueDate,
                    status: 'pending',
                    payment_method: p.paymentMethod,
                    related_stock_entry_id: entry.id,
                    date: nowIso
                }))
            } else {
                txRows = [{
                    tenant_id: tenantId,
                    description: `NF ${invoiceNumber} - ${supplierLabel} (à vista)`,
                    type: 'expense',
                    category: 'Fornecedores',
                    amount: total,
                    due_date: null,
                    status: 'paid',
                    payment_method: upfrontMethod,
                    related_stock_entry_id: entry.id,
                    date: nowIso
                }]
            }
            const { error: txErr } = await supabase.from('transactions').insert(txRows)
            if (txErr) throw txErr

            addLog(`NF ${invoiceNumber} lançada com sucesso. ${items.length} item(ns), ${txRows.length} lançamento(s) financeiro(s).`, 'success')

            // Reset form
            setSupplierOption(null)
            setSupplierCnpjForNew('')
            setInvoiceNumber('')
            setItems([])
            setInstallments([])
            setPaymentMode('upfront')
        } catch (e) {
            addLog(`Falha ao gravar: ${e.message}`, 'error')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-red-500" />
                <h2 className="text-xl font-bold text-white">Entrada Manual de Nota Fiscal</h2>
            </div>

            {/* Cabeçalho */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm uppercase tracking-wide text-gray-400 font-bold">Dados da NF</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">Fornecedor *</label>
                        <CreatableSelect
                            instanceId="manual-supplier"
                            isClearable
                            placeholder="Selecione ou digite para criar..."
                            formatCreateLabel={(input) => `Cadastrar fornecedor: "${input}"`}
                            value={supplierOption}
                            options={supplierOptions}
                            onChange={handleSupplierChange}
                            styles={selectStyles}
                        />
                    </div>
                    {supplierOption?.isNew && (
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">CNPJ do novo fornecedor *</label>
                            <input
                                type="text"
                                value={supplierCnpjForNew}
                                onChange={(e) => setSupplierCnpjForNew(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white"
                                placeholder="00.000.000/0000-00"
                            />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">Número da NF *</label>
                        <input
                            type="text"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white"
                            placeholder="123456"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">Data de emissão</label>
                        <input
                            type="date"
                            value={emissionDate}
                            onChange={(e) => setEmissionDate(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">Margem padrão (%)</label>
                        <input
                            type="number"
                            value={defaultMargin}
                            onChange={(e) => setDefaultMargin(parseFloat(e.target.value) || 0)}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white"
                            placeholder="30"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">Aplicada em itens novos para calcular o preço de venda.</p>
                    </div>
                </div>
            </div>

            {/* Itens */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm uppercase tracking-wide text-gray-400 font-bold">Itens da NF</h3>
                    <button
                        type="button"
                        onClick={handleAddItem}
                        className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
                    >
                        <Plus className="w-4 h-4" /> Adicionar item
                    </button>
                </div>

                {items.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                        Nenhum item ainda. Clique em "Adicionar item".
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase text-gray-400 border-b border-neutral-800">
                                <tr>
                                    <th className="px-2 py-2 text-left">Descrição *</th>
                                    <th className="px-2 py-2 text-left w-24">SKU</th>
                                    <th className="px-2 py-2 text-right w-20">Qtd *</th>
                                    <th className="px-2 py-2 text-right w-28">Custo R$ *</th>
                                    <th className="px-2 py-2 text-right w-20">Margem%</th>
                                    <th className="px-2 py-2 text-right w-28">Venda R$</th>
                                    <th className="px-2 py-2 text-right w-28">Subtotal</th>
                                    <th className="w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(it => (
                                    <tr key={it.id} className="border-b border-neutral-800/60">
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={it.name}
                                                onChange={(e) => handleUpdateItem(it.id, 'name', e.target.value)}
                                                className="w-full bg-black border border-neutral-700 rounded p-1.5 text-white"
                                                placeholder="Nome do produto"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={it.sku}
                                                onChange={(e) => handleUpdateItem(it.id, 'sku', e.target.value)}
                                                className="w-full bg-black border border-neutral-700 rounded p-1.5 text-white"
                                                placeholder="—"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={it.quantity}
                                                onChange={(e) => handleUpdateItem(it.id, 'quantity', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-black border border-neutral-700 rounded p-1.5 text-white text-right"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={it.cost_price}
                                                onChange={(e) => handleUpdateItem(it.id, 'cost_price', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-black border border-neutral-700 rounded p-1.5 text-white text-right"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={it.margin}
                                                onChange={(e) => handleUpdateItem(it.id, 'margin', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-black border border-neutral-700 rounded p-1.5 text-white text-right"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={it.selling_price}
                                                onChange={(e) => handleUpdateItem(it.id, 'selling_price', parseFloat(e.target.value) || 0)}
                                                className="w-full bg-black border border-neutral-700 rounded p-1.5 text-white text-right"
                                            />
                                        </td>
                                        <td className="px-2 py-2 text-right text-white font-medium">
                                            {((parseFloat(it.cost_price) || 0) * (parseFloat(it.quantity) || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </td>
                                        <td className="px-2 py-2 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveItem(it.id)}
                                                className="text-red-500 hover:text-red-400"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={6} className="px-2 py-3 text-right text-gray-400 uppercase text-xs font-bold">Total da NF</td>
                                    <td className="px-2 py-3 text-right text-white font-black text-lg">
                                        {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagamento */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm uppercase tracking-wide text-gray-400 font-bold">Pagamento</h3>

                <div className="flex gap-3">
                    <label className={`flex-1 cursor-pointer rounded-lg border p-4 transition ${paymentMode === 'upfront' ? 'border-red-500 bg-red-500/10' : 'border-neutral-700 bg-black'}`}>
                        <input
                            type="radio"
                            name="payment-mode"
                            checked={paymentMode === 'upfront'}
                            onChange={() => setPaymentMode('upfront')}
                            className="sr-only"
                        />
                        <p className="font-bold text-white">À vista</p>
                        <p className="text-xs text-gray-400 mt-1">Lançamento financeiro já como pago.</p>
                    </label>
                    <label className={`flex-1 cursor-pointer rounded-lg border p-4 transition ${paymentMode === 'installments' ? 'border-red-500 bg-red-500/10' : 'border-neutral-700 bg-black'}`}>
                        <input
                            type="radio"
                            name="payment-mode"
                            checked={paymentMode === 'installments'}
                            onChange={() => setPaymentMode('installments')}
                            className="sr-only"
                        />
                        <p className="font-bold text-white">A prazo (parcelado)</p>
                        <p className="text-xs text-gray-400 mt-1">Gera contas a pagar com data de vencimento.</p>
                    </label>
                </div>

                {paymentMode === 'upfront' ? (
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">Forma de pagamento</label>
                        <select
                            value={upfrontMethod}
                            onChange={(e) => setUpfrontMethod(e.target.value)}
                            className="w-full md:w-1/3 bg-black border border-neutral-700 rounded-lg p-2.5 text-white"
                        >
                            <option>Dinheiro</option>
                            <option>PIX</option>
                            <option>Cartão de Crédito</option>
                            <option>Cartão de Débito</option>
                            <option>Boleto</option>
                            <option>Transferência</option>
                        </select>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-400">
                                Soma das parcelas: <span className="text-white font-bold">{installmentsTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                <span className={`ml-2 text-xs ${Math.abs(installmentsTotal - total) > 0.05 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {Math.abs(installmentsTotal - total) > 0.05 ? '⚠ não bate com a NF' : '✓ bate com a NF'}
                                </span>
                            </p>
                            <button
                                type="button"
                                onClick={handleAddInstallment}
                                className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> Parcela
                            </button>
                        </div>

                        {installments.map((p, idx) => (
                            <div key={p.id} className="grid grid-cols-12 gap-2 items-center bg-black border border-neutral-800 rounded-lg p-3">
                                <span className="col-span-1 text-xs text-gray-500">#{idx + 1}</span>
                                <input
                                    type="date"
                                    value={p.dueDate}
                                    onChange={(e) => handleUpdateInstallment(p.id, 'dueDate', e.target.value)}
                                    className="col-span-4 bg-neutral-950 border border-neutral-700 rounded p-1.5 text-white text-sm"
                                />
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Valor"
                                    value={p.amount}
                                    onChange={(e) => handleUpdateInstallment(p.id, 'amount', parseFloat(e.target.value) || 0)}
                                    className="col-span-3 bg-neutral-950 border border-neutral-700 rounded p-1.5 text-white text-sm text-right"
                                />
                                <select
                                    value={p.paymentMethod}
                                    onChange={(e) => handleUpdateInstallment(p.id, 'paymentMethod', e.target.value)}
                                    className="col-span-3 bg-neutral-950 border border-neutral-700 rounded p-1.5 text-white text-sm"
                                >
                                    <option>Boleto</option>
                                    <option>PIX</option>
                                    <option>Transferência</option>
                                    <option>Cartão de Crédito</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveInstallment(p.id)}
                                    className="col-span-1 text-red-500 hover:text-red-400 flex justify-center"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Logs */}
            {logs.length > 0 && (
                <div className="bg-black border border-neutral-800 rounded-2xl p-4 space-y-1 max-h-40 overflow-y-auto">
                    {logs.map((l, i) => (
                        <p key={i} className={`text-xs flex items-start gap-2 ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-400' : 'text-gray-400'}`}>
                            {l.type === 'error' && <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                            {l.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                            <span><span className="text-gray-600">[{l.time}]</span> {l.message}</span>
                        </p>
                    ))}
                </div>
            )}

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-red-900/30 flex items-center gap-2"
                >
                    <CheckCircle2 className="w-5 h-5" />
                    {submitting ? 'Lançando...' : 'Confirmar entrada'}
                </button>
            </div>
        </div>
    )
}

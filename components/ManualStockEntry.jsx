"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'
import CreatableSelect from 'react-select/creatable'
import { Plus, Trash2, FileText, CheckCircle2, AlertCircle, Link2, Layers, Sparkles } from 'lucide-react'
import StockItemLinkModal from './StockItemLinkModal'
import CurrencyInput from './CurrencyInput'

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

const fmt = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Entrada manual de NF. Toda a persistência roda via /api/stock/manual-entry
// pra evitar AbortError de chamadas client-side da supabase quando a sessão
// refresha durante o fluxo. Mesmo padrão do fluxo XML.
export default function ManualStockEntry({ onEntryCreated }) {
    const supabase = createClient()
    const { tenantId } = useAuth()

    const [suppliers, setSuppliers] = useState([])
    const [supplierOption, setSupplierOption] = useState(null)
    const [supplierCnpjForNew, setSupplierCnpjForNew] = useState('')

    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [emissionDate, setEmissionDate] = useState(() => new Date().toISOString().split('T')[0])
    const [defaultMargin, setDefaultMargin] = useState(30)

    const [items, setItems] = useState([])

    // Frete + desconto
    const [freightAmount, setFreightAmount] = useState(0)
    const [discountMode, setDiscountMode] = useState('total') // 'total' | 'per_item'
    const [discountAmount, setDiscountAmount] = useState(0)   // só usado em modo 'total'

    // Pagamento
    const [paymentMode, setPaymentMode] = useState('upfront')
    const [upfrontMethod, setUpfrontMethod] = useState('Dinheiro')
    const [installments, setInstallments] = useState([])

    const [logs, setLogs] = useState([])
    const [submitting, setSubmitting] = useState(false)

    // Cache de produtos pro auto-match enquanto digita.
    // Carregado uma vez por sessão do componente.
    const [productCache, setProductCache] = useState([])
    const [linkingItemId, setLinkingItemId] = useState(null)

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

    // Carrega cache de produtos pro auto-match. Server-side via API pra evitar
    // hang de token stale (mesmo padrão dos outros endpoints do módulo).
    useEffect(() => {
        if (!tenantId) return
        const load = async () => {
            try {
                const res = await fetch('/api/stock/products-search?limit=1000', { credentials: 'include' })
                const json = await res.json().catch(() => ({}))
                if (res.ok) setProductCache(json.products || [])
            } catch {
                /* silencioso — sugestão é opcional */
            }
        }
        load()
    }, [tenantId])

    // Lookup case-insensitive em name/sku/ean. Retorna no máximo 1 produto
    // priorizando match exato, depois startsWith, depois includes.
    const findSuggestion = (q) => {
        if (!q || q.trim().length < 3) return null
        const needle = q.trim().toLowerCase()
        const cache = productCache
        if (!cache.length) return null
        let exact = null
        let starts = null
        let inc = null
        for (const p of cache) {
            const name = (p.name || '').toLowerCase()
            const sku = (p.sku || '').toLowerCase()
            const ean = (p.ean || '').toLowerCase()
            if (name === needle || sku === needle || ean === needle) { exact = p; break }
            if (!starts && (name.startsWith(needle) || sku.startsWith(needle))) starts = p
            if (!inc && name.includes(needle)) inc = p
        }
        return exact || starts || inc
    }

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
            selling_price: 0,
            discount_amount: 0,
            link_product_id: null,
            link_product_name: null,
            linked_product_ids: [],
            suggestion: null  // { id, name, quantity } enquanto o operador não confirma
        }])
    }

    const handleUpdateItem = (id, field, value) => {
        setItems(prev => prev.map(it => {
            if (it.id !== id) return it
            const next = { ...it, [field]: value }
            if (field === 'cost_price' || field === 'margin') {
                const cost = parseFloat(field === 'cost_price' ? value : next.cost_price) || 0
                const m = parseFloat(field === 'margin' ? value : next.margin) || 0
                next.selling_price = +(cost * (1 + m / 100)).toFixed(2)
            }
            // Auto-sugestão: roda em mudança de name/sku/ean enquanto não há
            // vínculo manual (link_product_id). Operador pode ignorar.
            if ((field === 'name' || field === 'sku' || field === 'ean') && !next.link_product_id) {
                const q = field === 'name' ? value : (field === 'sku' ? value : value)
                const suggestion = findSuggestion(q || next.name)
                next.suggestion = suggestion
                    ? { id: suggestion.id, name: suggestion.name, sku: suggestion.sku, quantity: suggestion.quantity }
                    : null
            }
            return next
        }))
    }

    const applySuggestion = (id) => {
        setItems(prev => prev.map(it => {
            if (it.id !== id) return it
            if (!it.suggestion) return it
            return {
                ...it,
                link_product_id: it.suggestion.id,
                link_product_name: it.suggestion.name,
                suggestion: null
            }
        }))
    }

    const dismissSuggestion = (id) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, suggestion: null } : it))
    }

    const unlinkItem = (id) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, link_product_id: null, link_product_name: null } : it))
    }

    const handleRemoveItem = (id) => {
        setItems(prev => prev.filter(it => it.id !== id))
    }

    // Subtotal bruto (sem frete/desconto)
    const subtotalBruto = items.reduce(
        (acc, it) => acc + (parseFloat(it.cost_price) || 0) * (parseFloat(it.quantity) || 0),
        0
    )

    const totalDiscountApplied = discountMode === 'total'
        ? (parseFloat(discountAmount) || 0)
        : items.reduce((acc, it) => acc + (parseFloat(it.discount_amount) || 0), 0)

    const freightApplied = parseFloat(freightAmount) || 0

    const total = subtotalBruto + freightApplied - totalDiscountApplied

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
            if (discountMode === 'per_item') {
                const d = parseFloat(it.discount_amount) || 0
                const sub = (parseFloat(it.cost_price) || 0) * (parseFloat(it.quantity) || 0)
                if (d < 0) return `Desconto negativo em "${it.name}".`
                if (d > sub) return `Desconto maior que subtotal em "${it.name}".`
            }
        }
        if (freightApplied < 0) return 'Frete não pode ser negativo.'
        if (discountMode === 'total') {
            const d = parseFloat(discountAmount) || 0
            if (d < 0) return 'Desconto não pode ser negativo.'
            if (d > subtotalBruto) return 'Desconto total maior que subtotal da NF.'
        }
        if (total < 0) return 'Total da NF ficou negativo.'
        if (paymentMode === 'installments') {
            if (installments.length === 0) return 'Adicione ao menos uma parcela.'
            for (const p of installments) {
                if (!p.dueDate) return 'Cada parcela precisa de data de vencimento.'
                if (!p.amount || p.amount <= 0) return 'Valor de parcela inválido.'
            }
            const diff = Math.abs(installmentsTotal - total)
            if (diff > 0.05) return `Soma das parcelas (${fmt(installmentsTotal)}) não bate com total da NF (${fmt(total)}).`
        }
        return null
    }

    const handleSubmit = async () => {
        const err = validate()
        if (err) { addLog(err, 'error'); return }
        if (!tenantId) { addLog('Tenant não identificado.', 'error'); return }

        setSubmitting(true)
        setLogs([])
        addLog('Enviando NF para o servidor...')

        const payload = {
            supplier: supplierOption.isNew
                ? { isNew: true, name: supplierOption.label, cnpj: supplierCnpjForNew.trim() }
                : { isNew: false, id: supplierOption.value, name: supplierOption.label },
            invoiceNumber: invoiceNumber.trim(),
            emissionDate,
            items: items.map(it => ({
                name: it.name.trim(),
                sku: it.sku || '',
                ean: it.ean || '',
                quantity: parseFloat(it.quantity) || 0,
                cost_price: parseFloat(it.cost_price) || 0,
                margin: parseFloat(it.margin) || 0,
                selling_price: parseFloat(it.selling_price) || 0,
                discount_amount: discountMode === 'per_item' ? (parseFloat(it.discount_amount) || 0) : 0,
                link_product_id: it.link_product_id || null,
                linked_product_ids: Array.isArray(it.linked_product_ids) ? it.linked_product_ids : []
            })),
            freightAmount: freightApplied,
            discountMode,
            discountAmount: discountMode === 'total' ? (parseFloat(discountAmount) || 0) : 0,
            paymentMode,
            upfrontMethod,
            installments: paymentMode === 'installments'
                ? installments.map(p => ({
                    dueDate: p.dueDate,
                    amount: parseFloat(p.amount) || 0,
                    paymentMethod: p.paymentMethod
                }))
                : []
        }

        try {
            const res = await fetch('/api/stock/manual-entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)

            addLog(`NF ${invoiceNumber} lançada. ${data.itemCount} item(ns), ${data.transactionCount} lançamento(s).`, 'success')

            // Reset
            setSupplierOption(null)
            setSupplierCnpjForNew('')
            setInvoiceNumber('')
            setItems([])
            setInstallments([])
            setPaymentMode('upfront')
            setFreightAmount(0)
            setDiscountAmount(0)
            setDiscountMode('total')

            if (typeof onEntryCreated === 'function') onEntryCreated()
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

            {/* Frete e Desconto */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm uppercase tracking-wide text-gray-400 font-bold">Frete e Desconto</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">Frete</label>
                        <CurrencyInput
                            value={freightAmount}
                            onChange={(n) => setFreightAmount(n)}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">Rateado proporcionalmente nos custos dos itens.</p>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-300 mb-1">Modo de desconto</label>
                        <select
                            value={discountMode}
                            onChange={(e) => setDiscountMode(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white"
                        >
                            <option value="total">Desconto total (rateado)</option>
                            <option value="per_item">Desconto por item</option>
                        </select>
                        <p className="text-[11px] text-gray-500 mt-1">
                            {discountMode === 'total'
                                ? 'Aplicado sobre o total e rateado proporcionalmente.'
                                : 'Informe valor por linha na tabela abaixo.'}
                        </p>
                    </div>

                    {discountMode === 'total' && (
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Desconto total</label>
                            <CurrencyInput
                                value={discountAmount}
                                onChange={(n) => setDiscountAmount(n)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white"
                            />
                        </div>
                    )}
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
                        Nenhum item ainda. Clique em &quot;Adicionar item&quot;.
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
                                    {discountMode === 'per_item' && (
                                        <th className="px-2 py-2 text-right w-28">Desc. R$</th>
                                    )}
                                    <th className="px-2 py-2 text-right w-28">Subtotal</th>
                                    <th className="w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(it => {
                                    const sub = (parseFloat(it.cost_price) || 0) * (parseFloat(it.quantity) || 0)
                                    const lineNet = discountMode === 'per_item'
                                        ? sub - (parseFloat(it.discount_amount) || 0)
                                        : sub
                                    const equivCount = (it.linked_product_ids || []).length
                                    return (
                                        <tr key={it.id} className="border-b border-neutral-800/60">
                                            <td className="px-2 py-2">
                                                <input
                                                    type="text"
                                                    value={it.name}
                                                    onChange={(e) => handleUpdateItem(it.id, 'name', e.target.value)}
                                                    className="w-full bg-black border border-neutral-700 rounded p-1.5 text-white"
                                                    placeholder="Nome do produto"
                                                />
                                                {it.link_product_id ? (
                                                    <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-300">
                                                        <Link2 className="w-3 h-3" />
                                                        <span className="truncate">Vinculado: {it.link_product_name || it.link_product_id}</span>
                                                        <button type="button" onClick={() => unlinkItem(it.id)} className="underline text-emerald-400 hover:text-white">desfazer</button>
                                                    </div>
                                                ) : it.suggestion ? (
                                                    <div className="mt-1 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1 text-[11px] text-amber-200">
                                                        <Sparkles className="w-3 h-3 shrink-0" />
                                                        <span className="truncate">
                                                            Parece já cadastrado: <strong>{it.suggestion.name}</strong>
                                                            {Number.isFinite(Number(it.suggestion.quantity)) ? ` (${it.suggestion.quantity} em estoque)` : ''}
                                                        </span>
                                                        <button type="button" onClick={() => applySuggestion(it.id)} className="bg-amber-500/20 hover:bg-amber-500/40 text-amber-100 rounded px-1.5 font-medium">vincular</button>
                                                        <button type="button" onClick={() => dismissSuggestion(it.id)} className="text-amber-300/70 hover:text-white">×</button>
                                                    </div>
                                                ) : null}
                                                {equivCount > 0 && (
                                                    <div className="mt-1 flex items-center gap-1 text-[11px] text-purple-300">
                                                        <Layers className="w-3 h-3" />
                                                        {equivCount} equivalência(s)
                                                    </div>
                                                )}
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
                                                <CurrencyInput
                                                    value={it.cost_price}
                                                    onChange={(n) => handleUpdateItem(it.id, 'cost_price', n)}
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
                                                <CurrencyInput
                                                    value={it.selling_price}
                                                    onChange={(n) => handleUpdateItem(it.id, 'selling_price', n)}
                                                    className="w-full bg-black border border-neutral-700 rounded p-1.5 text-white text-right"
                                                />
                                            </td>
                                            {discountMode === 'per_item' && (
                                                <td className="px-2 py-2">
                                                    <CurrencyInput
                                                        value={it.discount_amount || 0}
                                                        onChange={(n) => handleUpdateItem(it.id, 'discount_amount', n)}
                                                        className="w-full bg-black border border-neutral-700 rounded p-1.5 text-white text-right"
                                                    />
                                                </td>
                                            )}
                                            <td className="px-2 py-2 text-right text-white font-medium">
                                                {fmt(lineNet)}
                                            </td>
                                            <td className="px-2 py-2 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setLinkingItemId(it.id)}
                                                        className={`p-1 rounded transition ${it.link_product_id || equivCount > 0 ? 'text-emerald-400 hover:text-emerald-300' : 'text-gray-400 hover:text-white'}`}
                                                        title="Vincular item existente / definir equivalências"
                                                    >
                                                        <Link2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveItem(it.id)}
                                                        className="text-red-500 hover:text-red-400 p-1"
                                                        title="Remover linha"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot className="text-sm">
                                <tr>
                                    <td colSpan={discountMode === 'per_item' ? 7 : 6} className="px-2 py-1.5 text-right text-gray-400 uppercase text-xs">Subtotal</td>
                                    <td className="px-2 py-1.5 text-right text-white">{fmt(subtotalBruto)}</td>
                                    <td></td>
                                </tr>
                                <tr>
                                    <td colSpan={discountMode === 'per_item' ? 7 : 6} className="px-2 py-1.5 text-right text-gray-400 uppercase text-xs">Frete</td>
                                    <td className="px-2 py-1.5 text-right text-white">{fmt(freightApplied)}</td>
                                    <td></td>
                                </tr>
                                <tr>
                                    <td colSpan={discountMode === 'per_item' ? 7 : 6} className="px-2 py-1.5 text-right text-gray-400 uppercase text-xs">
                                        Desconto {discountMode === 'per_item' ? '(por item)' : '(total)'}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-red-400">- {fmt(totalDiscountApplied)}</td>
                                    <td></td>
                                </tr>
                                <tr className="border-t border-neutral-800">
                                    <td colSpan={discountMode === 'per_item' ? 7 : 6} className="px-2 py-3 text-right text-gray-400 uppercase text-xs font-bold">Total da NF</td>
                                    <td className="px-2 py-3 text-right text-white font-black text-lg">
                                        {fmt(total)}
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
                                Soma das parcelas: <span className="text-white font-bold">{fmt(installmentsTotal)}</span>
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
                                <CurrencyInput
                                    value={p.amount}
                                    onChange={(n) => handleUpdateInstallment(p.id, 'amount', n)}
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

            {linkingItemId !== null && (() => {
                const it = items.find(x => x.id === linkingItemId)
                if (!it) return null
                return (
                    <StockItemLinkModal
                        isOpen={true}
                        onClose={() => setLinkingItemId(null)}
                        itemLabel={it.name || '(item sem nome)'}
                        initialLinkProductId={it.link_product_id}
                        initialLinkProductName={it.link_product_name}
                        initialEquivIds={it.linked_product_ids || []}
                        onApply={({ link_product_id, link_product_name, linked_product_ids }) => {
                            setItems(prev => prev.map(x => x.id === linkingItemId ? {
                                ...x,
                                link_product_id: link_product_id || null,
                                link_product_name: link_product_id ? link_product_name : null,
                                linked_product_ids: linked_product_ids || [],
                                suggestion: null
                            } : x))
                        }}
                    />
                )
            })()}
        </div>
    )
}

"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'
import CreatableSelect from 'react-select/creatable'
import { Package, X } from 'lucide-react'

// Tema escuro do react-select alinhado com o resto do app
const selectStyles = {
    control: (base, state) => ({
        ...base,
        backgroundColor: '#000000',
        borderColor: state.isFocused ? '#ef4444' : '#404040',
        color: '#ffffff',
        minHeight: '42px',
        boxShadow: 'none',
        '&:hover': { borderColor: '#ef4444' }
    }),
    menu: (base) => ({ ...base, backgroundColor: '#171717', border: '1px solid #404040', zIndex: 70 }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused ? '#262626' : 'transparent',
        color: '#ffffff',
        cursor: 'pointer'
    }),
    singleValue: (base) => ({ ...base, color: '#ffffff' }),
    input: (base) => ({ ...base, color: '#ffffff' }),
    placeholder: (base) => ({ ...base, color: '#9ca3af' })
}

// Cadastro rápido de produto a partir da OS. Salva em products (com tenant_id)
// e devolve o registro pro pai via onCreated. Mantém o form enxuto: nome + venda
// são obrigatórios; custo, margem e SKU são opcionais. Categoria/marca/fornecedor
// ficam pra edição completa em /stock — aqui é só atalho.
export default function QuickProductModal({ isOpen, onClose, onCreated, initialName = '' }) {
    const supabase = createClient()
    const { tenantId } = useAuth()

    const [name, setName] = useState(initialName)
    const [sku, setSku] = useState('')
    const [costPrice, setCostPrice] = useState('')
    const [margin, setMargin] = useState('')
    const [sellingPrice, setSellingPrice] = useState('')
    const [quantity, setQuantity] = useState('0')
    const [minQuantity, setMinQuantity] = useState('0')
    const [categoryId, setCategoryId] = useState('')
    const [brandId, setBrandId] = useState('')

    const [categories, setCategories] = useState([])
    const [brands, setBrands] = useState([])
    const [catalogLoaded, setCatalogLoaded] = useState(false)

    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    // Sempre que o modal abrir com um initialName novo, sincroniza o campo name.
    useEffect(() => {
        if (isOpen) {
            setName(initialName)
            setErrorMsg('')
        }
    }, [isOpen, initialName])

    // Lazy load: só busca categorias/marcas quando o modal abre pela 1ª vez na sessão.
    useEffect(() => {
        if (!isOpen || catalogLoaded || !tenantId) return
        const load = async () => {
            const [{ data: cats }, { data: brs }] = await Promise.all([
                supabase.from('categories').select('*').order('name'),
                supabase.from('brands').select('*').order('name')
            ])
            setCategories(cats || [])
            setBrands(brs || [])
            setCatalogLoaded(true)
        }
        load()
    }, [isOpen, catalogLoaded, tenantId])

    // Cria categoria sob demanda — mesmo padrão de ProductList.handleCreateCategory.
    const handleCreateCategory = async (input) => {
        const newName = input.trim()
        if (!newName || !tenantId) return
        const { data, error } = await supabase
            .from('categories')
            .insert([{ tenant_id: tenantId, name: newName }])
            .select()
            .single()
        if (error) {
            setErrorMsg('Erro ao criar categoria: ' + error.message)
            return
        }
        setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
        setCategoryId(data.id)
    }

    const handleCreateBrand = async (input) => {
        const newName = input.trim()
        if (!newName || !tenantId) return
        const { data, error } = await supabase
            .from('brands')
            .insert([{ tenant_id: tenantId, name: newName }])
            .select()
            .single()
        if (error) {
            setErrorMsg('Erro ao criar marca: ' + error.message)
            return
        }
        setBrands(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
        setBrandId(data.id)
    }

    // Máscara de moeda BR — mesmo padrão usado em ProductList/DailyMovement.
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

    // Auto-calc do preço de venda quando o operador digita custo + margem.
    const calcSelling = (cost, marginPct) => {
        const c = parseCurrency(cost)
        const m = parseFloat(marginPct)
        if (!c || isNaN(m)) return ''
        return formatInputCurrency(String(Math.round(c * (1 + m / 100) * 100)))
    }

    const handleCostChange = (val) => {
        const newCost = formatInputCurrency(val)
        setCostPrice(newCost)
        const newSelling = calcSelling(newCost, margin)
        if (newSelling) setSellingPrice(newSelling)
    }

    const handleMarginChange = (val) => {
        setMargin(val)
        const newSelling = calcSelling(costPrice, val)
        if (newSelling) setSellingPrice(newSelling)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')

        if (!name.trim()) {
            setErrorMsg('Informe o nome do produto.')
            return
        }
        const sellingNum = parseCurrency(sellingPrice)
        if (sellingNum <= 0) {
            setErrorMsg('Informe um preço de venda válido.')
            return
        }
        if (!tenantId) {
            setErrorMsg('Tenant não identificado. Faça login novamente.')
            return
        }

        setSaving(true)
        const { data, error } = await supabase
            .from('products')
            .insert([{
                tenant_id: tenantId,
                name: name.trim(),
                sku: sku.trim() || null,
                cost_price: parseCurrency(costPrice) || 0,
                selling_price: sellingNum,
                profit_margin_percent: parseFloat(margin) || 0,
                quantity: parseInt(quantity) || 0,
                min_quantity: parseInt(minQuantity) || 0,
                category_id: categoryId || null,
                brand_id: brandId || null
            }])
            .select()
            .single()

        setSaving(false)

        if (error) {
            setErrorMsg('Erro ao salvar produto: ' + error.message)
            return
        }

        onCreated(data)
        // Reset pra próximo uso
        setName('')
        setSku('')
        setCostPrice('')
        setMargin('')
        setSellingPrice('')
        setQuantity('0')
        setMinQuantity('0')
        setCategoryId('')
        setBrandId('')
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-neutral-900 border border-neutral-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden my-8">
                <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Package className="w-5 h-5 text-red-500" />
                        Cadastro rápido de produto
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition" aria-label="Fechar">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">
                            Nome <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                            placeholder="Ex: Pastilha de freio dianteira"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">SKU / Código</label>
                            <input
                                type="text"
                                value={sku}
                                onChange={(e) => setSku(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="Opcional"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Custo (R$)</label>
                            <input
                                type="text"
                                value={costPrice}
                                onChange={(e) => handleCostChange(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="R$ 0,00"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Margem (%)</label>
                            <input
                                type="number"
                                step="0.1"
                                value={margin}
                                onChange={(e) => handleMarginChange(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="Ex: 50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">
                                Venda (R$) <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={sellingPrice}
                                onChange={(e) => setSellingPrice(formatInputCurrency(e.target.value))}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="R$ 0,00"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Estoque inicial</label>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Quantidade que entra agora.</p>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Estoque mínimo</label>
                            <input
                                type="number"
                                value={minQuantity}
                                onChange={(e) => setMinQuantity(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="Ex: 2"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Alerta quando cair abaixo.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Categoria</label>
                            <CreatableSelect
                                instanceId="quick-product-category"
                                isClearable
                                placeholder="Selecione ou digite para criar..."
                                formatCreateLabel={(input) => `Cadastrar categoria: "${input}"`}
                                noOptionsMessage={() => 'Digite para cadastrar uma nova categoria'}
                                options={categories.map(c => ({ value: c.id, label: c.name }))}
                                value={
                                    categoryId
                                        ? (() => {
                                            const c = categories.find(c => c.id === categoryId)
                                            return c ? { value: c.id, label: c.name } : null
                                        })()
                                        : null
                                }
                                onChange={(opt) => setCategoryId(opt ? opt.value : '')}
                                onCreateOption={handleCreateCategory}
                                styles={selectStyles}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Marca</label>
                            <CreatableSelect
                                instanceId="quick-product-brand"
                                isClearable
                                placeholder="Selecione ou digite para criar..."
                                formatCreateLabel={(input) => `Cadastrar marca: "${input}"`}
                                noOptionsMessage={() => 'Digite para cadastrar uma nova marca'}
                                options={brands.map(b => ({ value: b.id, label: b.name }))}
                                value={
                                    brandId
                                        ? (() => {
                                            const b = brands.find(b => b.id === brandId)
                                            return b ? { value: b.id, label: b.name } : null
                                        })()
                                        : null
                                }
                                onChange={(opt) => setBrandId(opt ? opt.value : '')}
                                onCreateOption={handleCreateBrand}
                                styles={selectStyles}
                            />
                        </div>
                    </div>

                    <p className="text-[11px] text-gray-500">
                        Fornecedor pode ser configurado depois em <strong>Estoque</strong>.
                    </p>

                    {errorMsg && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
                            {errorMsg}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-lg shadow-red-900/20 transition"
                        >
                            {saving ? 'Salvando...' : 'Cadastrar e adicionar à OS'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

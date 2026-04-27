"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'
import Select from 'react-select'
import CreatableSelect from 'react-select/creatable'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FileText, AlertCircle, X as XIcon } from 'lucide-react'

export default function ProductList({ initialProducts, initialSuppliers, initialCategories, initialBrands }) {
    const supabase = createClient()
    const { tenantId, loading: authLoading } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()

    const [products, setProducts] = useState(initialProducts || [])
    const [suppliers, setSuppliers] = useState(initialSuppliers || [])
    const [categories, setCategories] = useState(initialCategories || [])
    const [brands, setBrands] = useState(initialBrands || [])
    // Produto selecionado na busca. Quando preenchido, a tabela mostra esse produto
    // mais todos os equivalentes (linked_products). Quando null, mostra tudo.
    const [searchProduct, setSearchProduct] = useState(null)
    // Filtro "estoque baixo": ativado via toggle ou via ?filter=low-stock (vindo do dashboard).
    // Mesmo critério usado em app/page.js: quantity <= (min_quantity || 0).
    const [lowStockOnly, setLowStockOnly] = useState(searchParams.get('filter') === 'low-stock')
    const [isEditing, setIsEditing] = useState(false)
    const [loading, setLoading] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [categoryInput, setCategoryInput] = useState('')
    const [brandInput, setBrandInput] = useState('')
    const [currentProduct, setCurrentProduct] = useState({
        name: '',
        sku: '',
        ean: '',
        description: '',
        cost_price: '',
        selling_price: '',
        profit_margin_percent: '',
        quantity: '',
        min_quantity: '',
        supplier_id: '',
        category_id: '',
        brand_id: '',
        linked_products: []
    })

    const handleEdit = (product) => {
        // Prepare linked_products for react-select format [{value, label}]
        let formattedLinks = []
        if (product.linked_products && Array.isArray(product.linked_products)) {
            formattedLinks = product.linked_products.map(id => {
                const linkedProd = products.find(p => p.id === id)
                return linkedProd ? { value: id, label: linkedProd.name } : null
            }).filter(Boolean)
        }

        setCurrentProduct({
            ...product,
            cost_price: formatCurrency(product.cost_price),
            selling_price: formatCurrency(product.selling_price),
            linked_products: formattedLinks
        })
        setIsEditing(true)
    }

    const handleNew = () => {
        setCurrentProduct({
            name: '',
            sku: '',
            ean: '',
            description: '',
            cost_price: '',
            selling_price: '',
            profit_margin_percent: '',
            quantity: 0,
            min_quantity: 0,
            supplier_id: '',
            category_id: '',
            brand_id: '',
            linked_products: []
        })
        setIsEditing(true)
    }



    // Helper to format currency (e.g., 1250.50 -> R$ 1.250,50)
    const formatCurrency = (value) => {
        if (value === '' || value === null || value === undefined) return ''
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    }

    // Helper to format input value as user types (money mask)
    const formatInputCurrency = (value) => {
        if (!value) return ''
        // Remove everything that is not a digit
        const numericValue = value.toString().replace(/\D/g, '')
        // Convert to float (cents)
        const floatValue = parseFloat(numericValue) / 100
        return floatValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }

    // Helper to parse currency string back to float (e.g., R$ 1.250,50 -> 1250.50)
    const parseCurrency = (value) => {
        if (!value) return 0
        if (typeof value === 'number') return value
        // Remove all non-digits
        const numericValue = value.toString().replace(/\D/g, '')
        return parseFloat(numericValue) / 100
    }

    // Auto-calculate selling price when cost or margin changes
    const calculateSellingPrice = (cost, margin) => {
        if (!cost || !margin) return ''
        const costVal = parseCurrency(cost)
        const marginVal = parseFloat(margin)
        if (isNaN(costVal) || isNaN(marginVal)) return ''

        const selling = costVal * (1 + marginVal / 100)
        return formatCurrency(selling)
    }

    const handleCostChange = (val) => {
        const newCost = formatInputCurrency(val)
        const newSelling = calculateSellingPrice(newCost, currentProduct.profit_margin_percent)
        setCurrentProduct(prev => ({
            ...prev,
            cost_price: newCost,
            selling_price: newSelling || prev.selling_price
        }))
    }

    const handleMarginChange = (val) => {
        const newMargin = val
        const newSelling = calculateSellingPrice(currentProduct.cost_price, newMargin)
        setCurrentProduct(prev => ({
            ...prev,
            profit_margin_percent: newMargin,
            selling_price: newSelling || prev.selling_price
        }))
    }

    // Cria categoria sob demanda quando o usuário digita um nome novo no select.
    // A categoria nasce ligada ao tenant atual e fica imediatamente disponível
    // para os outros produtos da mesma oficina.
    const handleCreateCategory = async (inputValue) => {
        const name = inputValue.trim()
        if (!name) return
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name })
        })
        const json = await res.json()
        if (!res.ok) {
            setCategoryInput(inputValue)
            setSaveError('Erro ao criar categoria: ' + (json.error || res.statusText))
            return
        }
        setCategoryInput('')
        setCategories(json.categories || [...categories, json.category].sort((a, b) => a.name.localeCompare(b.name)))
        setCurrentProduct(prev => ({ ...prev, category_id: json.category.id }))
    }

    const handleCreateBrand = async (inputValue) => {
        const name = inputValue.trim()
        if (!name) return
        const res = await fetch('/api/brands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name })
        })
        const json = await res.json()
        if (!res.ok) {
            setBrandInput(inputValue)
            setSaveError('Erro ao criar marca: ' + (json.error || res.statusText))
            return
        }
        setBrandInput('')
        setBrands(json.brands || [...brands, json.brand].sort((a, b) => a.name.localeCompare(b.name)))
        setCurrentProduct(prev => ({ ...prev, brand_id: json.brand.id }))
    }

    const handleSave = async (e) => {
        e.preventDefault()
        setSaveError('')
        setLoading(true)

        try {
            const payload = {
                id: currentProduct.id || undefined,
                name: currentProduct.name,
                sku: currentProduct.sku || null,
                ean: currentProduct.ean ? String(currentProduct.ean).trim() || null : null,
                description: currentProduct.description || null,
                cost_price: parseCurrency(currentProduct.cost_price),
                selling_price: parseCurrency(currentProduct.selling_price),
                profit_margin_percent: parseFloat(currentProduct.profit_margin_percent || 0),
                quantity: parseInt(currentProduct.quantity || 0),
                min_quantity: parseInt(currentProduct.min_quantity || 0),
                supplier_id: currentProduct.supplier_id || null,
                category_id: currentProduct.category_id || null,
                brand_id: currentProduct.brand_id || null,
                linked_products: currentProduct.linked_products ? currentProduct.linked_products.map(opt => opt.value) : []
            }

            const res = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Erro ao salvar produto.')

            if (json.products) setProducts(json.products)

            // Re-busca categorias e marcas para que opções criadas em outras abas apareçam.
            const [catsRes, brsRes] = await Promise.all([
                fetch('/api/categories', { credentials: 'include' }),
                fetch('/api/brands', { credentials: 'include' }),
            ])
            const [catsJson, brsJson] = await Promise.all([catsRes.json(), brsRes.json()])
            if (catsJson.categories) setCategories(catsJson.categories)
            if (brsJson.brands) setBrands(brsJson.brands)

            setIsEditing(false)
            setBrandInput('')
            setCategoryInput('')
        } catch (error) {
            setSaveError('Erro ao salvar produto: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir este produto?')) return
        await supabase.from('products').delete().eq('id', id)
        router.refresh()
        window.location.reload()
    }

    // Predicado de "estoque baixo" — mesmo critério que o dashboard usa.
    const isLowStock = (p) => Number(p.quantity || 0) <= Number(p.min_quantity || 0)

    // Quando o operador seleciona um produto na busca, a tabela mostra:
    //   1. O produto selecionado
    //   2. Equivalentes diretos (produtos listados em searchProduct.linked_products)
    //   3. Equivalentes inversos (produtos cujo linked_products contém o searchProduct.id)
    // Sem seleção, mostra a lista completa.
    // O filtro "estoque baixo" é aplicado por cima dessa lista (composto, não exclusivo).
    const filteredProducts = (() => {
        let base = products
        if (searchProduct) {
            const baseId = searchProduct.value
            const baseProduct = products.find(p => p.id === baseId)
            if (!baseProduct) return []
            const equivIds = new Set(Array.isArray(baseProduct.linked_products) ? baseProduct.linked_products : [])
            for (const p of products) {
                if (Array.isArray(p.linked_products) && p.linked_products.includes(baseId)) {
                    equivIds.add(p.id)
                }
            }
            base = products.filter(p => p.id === baseId || equivIds.has(p.id))
        }
        if (lowStockOnly) base = base.filter(isLowStock)
        return base
    })()

    // Contagem de itens com estoque baixo (sempre baseada na lista completa, sem filtros).
    // Usada pra mostrar o badge no toggle.
    const lowStockCount = products.filter(isLowStock).length

    // Set com IDs equivalentes — usado pra marcar visualmente as linhas na tabela
    const equivalentIds = (() => {
        if (!searchProduct) return new Set()
        const baseId = searchProduct.value
        const base = products.find(p => p.id === baseId)
        if (!base) return new Set()
        const ids = new Set(Array.isArray(base.linked_products) ? base.linked_products : [])
        for (const p of products) {
            if (Array.isArray(p.linked_products) && p.linked_products.includes(baseId)) {
                ids.add(p.id)
            }
        }
        return ids
    })()

    // Opções da busca: inclui name, sku e ean para o react-select filtrar.
    // O label mostra nome + SKU; o sublabel ajuda a operador escolher rápido.
    const searchOptions = products.map(p => ({
        value: p.id,
        label: p.sku ? `${p.name} — ${p.sku}` : p.name,
        name: p.name,
        sku: p.sku || '',
        ean: p.ean || '',
        quantity: p.quantity || 0,
        hasEquivalents: Array.isArray(p.linked_products) && p.linked_products.length > 0
    }))

    // Filtro custom: matches em name, sku OU ean (default do react-select só olharia label)
    const filterSearchOption = (option, input) => {
        if (!input) return true
        const q = input.toLowerCase()
        return (
            option.data.name?.toLowerCase().includes(q) ||
            option.data.sku?.toLowerCase().includes(q) ||
            option.data.ean?.toLowerCase().includes(q)
        )
    }

    // Options for linked products (excluding the current product being edited)
    const productOptions = products
        .filter(p => p.id !== currentProduct.id)
        .map(p => ({ value: p.id, label: p.name }))

    // Custom dark theme styles for react-select
    const customStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: '#262626', // bg-neutral-800
            borderColor: state.isFocused ? '#ef4444' : '#404040',
            color: '#ffffff',
            minHeight: '42px',
            boxShadow: 'none',
            '&:hover': {
                borderColor: '#ef4444'
            }
        }),
        menu: (base) => ({
            ...base,
            backgroundColor: '#171717',
            border: '1px solid #404040',
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused ? '#262626' : 'transparent',
            color: '#ffffff',
            cursor: 'pointer',
            '&:active': {
                backgroundColor: '#ef4444'
            }
        }),
        singleValue: (base) => ({
            ...base,
            color: '#ffffff',
        }),
        multiValue: (base) => ({
            ...base,
            backgroundColor: '#404040',
        }),
        multiValueLabel: (base) => ({
            ...base,
            color: '#ffffff',
        }),
        multiValueRemove: (base) => ({
            ...base,
            color: '#ffffff',
            ':hover': {
                backgroundColor: '#ef4444',
                color: '#ffffff',
            },
        }),
        input: (base) => ({
            ...base,
            color: '#ffffff',
        }),
        placeholder: (base) => ({
            ...base,
            color: '#9ca3af',
        }),
    }

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-bold text-white">Gestão de Estoque</h2>
                <div className="flex gap-2 w-full md:w-auto items-center">
                    <div className="w-full md:w-96">
                        <Select
                            instanceId="stock-search"
                            isClearable
                            placeholder="Buscar por nome, SKU ou EAN..."
                            value={searchProduct}
                            onChange={(opt) => setSearchProduct(opt)}
                            options={searchOptions}
                            filterOption={filterSearchOption}
                            formatOptionLabel={(opt) => (
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex flex-col">
                                        <span className="text-white text-sm">{opt.name}</span>
                                        <span className="text-[11px] text-gray-400">
                                            {opt.sku && <>SKU: {opt.sku}</>}
                                            {opt.sku && opt.ean && <> · </>}
                                            {opt.ean && <>EAN: {opt.ean}</>}
                                        </span>
                                    </div>
                                    {opt.hasEquivalents && (
                                        <span className="text-[10px] uppercase bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 font-bold whitespace-nowrap">
                                            tem equiv.
                                        </span>
                                    )}
                                </div>
                            )}
                            noOptionsMessage={() => 'Nenhum produto encontrado'}
                            styles={customStyles}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setLowStockOnly(prev => !prev)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap border flex items-center gap-2 ${lowStockOnly
                            ? 'bg-red-500/15 hover:bg-red-500/25 border-red-500/40 text-red-300'
                            : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-white'
                            }`}
                        title="Mostrar apenas produtos com estoque <= mínimo"
                    >
                        <AlertCircle className="w-4 h-4" />
                        Estoque baixo
                        {lowStockCount > 0 && (
                            <span className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${lowStockOnly ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-300'}`}>
                                {lowStockCount}
                            </span>
                        )}
                    </button>
                    <Link
                        href="/import"
                        className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap border border-neutral-700 flex items-center gap-2"
                        title="Lançar nota fiscal — XML ou manual"
                    >
                        <FileText className="w-4 h-4" /> Entrada de Nota Fiscal
                    </Link>
                    <button
                        onClick={handleNew}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                    >
                        Novo Produto
                    </button>
                </div>
            </div>

            {/* List */}
            {!isEditing ? (
                <div className="overflow-x-auto">
                    {lowStockOnly && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm">
                                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                                <span className="text-red-300">
                                    Mostrando apenas itens com <strong>estoque ≤ mínimo</strong> ({lowStockCount} encontrado{lowStockCount === 1 ? '' : 's'})
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setLowStockOnly(false)}
                                className="flex items-center gap-1 text-xs text-red-300 hover:text-red-200 transition"
                            >
                                <XIcon className="w-3 h-3" /> Limpar filtro
                            </button>
                        </div>
                    )}
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-200 uppercase bg-black">
                            <tr>
                                <th className="px-6 py-3">Cód/SKU</th>
                                <th className="px-6 py-3">Produto</th>
                                <th className="px-6 py-3">Categoria</th>
                                <th className="px-6 py-3 text-center">Qtd</th>
                                <th className="px-6 py-3">Custo (R$)</th>
                                <th className="px-6 py-3">Venda (R$)</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.length === 0 ? (
                                <tr><td colSpan="7" className="text-center py-4">
                                    {lowStockOnly
                                        ? 'Nenhum produto com estoque baixo.'
                                        : 'Nenhum produto encontrado.'}
                                </td></tr>
                            ) : (
                                filteredProducts.map((product) => (
                                    <tr key={product.id} className={`border-b border-neutral-800 hover:bg-neutral-800 ${equivalentIds.has(product.id) ? 'bg-blue-500/5' : ''}`}>
                                        <td className="px-6 py-4 font-mono text-xs">{product.sku || '-'}</td>
                                        <td className="px-6 py-4 font-medium text-white">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span>{product.name}</span>
                                                {equivalentIds.has(product.id) && (
                                                    <span className="text-[10px] uppercase bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 font-bold">
                                                        Equivalente
                                                    </span>
                                                )}
                                            </div>
                                            {product.suppliers && (
                                                <div className="text-xs text-gray-500">{product.suppliers.name}</div>
                                            )}
                                            {product.brands && (
                                                <div className="text-[10px] uppercase tracking-wide text-gray-600">{product.brands.name}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {product.categories ? (
                                                <span className="inline-block bg-neutral-800 border border-neutral-700 text-gray-300 text-xs rounded-full px-2.5 py-1">
                                                    {product.categories.name}
                                                </span>
                                            ) : (
                                                <span className="text-gray-600 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className={`px-6 py-4 text-center font-bold ${product.quantity <= 5 ? 'text-red-500' : 'text-green-500'}`}>
                                            {product.quantity}
                                        </td>
                                        <td className="px-6 py-4">{formatCurrency(product.cost_price)}</td>
                                        <td className="px-6 py-4 text-green-400 font-bold">{formatCurrency(product.selling_price)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleEdit(product)} className="text-blue-400 hover:text-blue-300 mr-4">Editar</button>
                                            <button onClick={() => handleDelete(product.id)} className="text-red-500 hover:text-red-400">Excluir</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* Form */
                <form onSubmit={handleSave} className="bg-black p-6 rounded-lg border border-neutral-800">
                    <h3 className="text-lg font-bold text-white mb-4">{currentProduct.id ? 'Editar Produto' : 'Novo Produto'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Produto</label>
                            <input
                                type="text"
                                required
                                value={currentProduct.name}
                                onChange={e => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Código / SKU</label>
                            <input
                                type="text"
                                value={currentProduct.sku || ''}
                                onChange={e => setCurrentProduct({ ...currentProduct, sku: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">EAN / Código de Barras</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="13 dígitos — opcional"
                                value={currentProduct.ean || ''}
                                onChange={e => setCurrentProduct({ ...currentProduct, ean: e.target.value.replace(/\D/g, '') })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5 font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-1">Preenche automático quando o produto vier por XML.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Qtd Atual em Estoque</label>
                            <input
                                type="number"
                                required
                                value={currentProduct.quantity}
                                onChange={e => setCurrentProduct({ ...currentProduct, quantity: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Quantidade Mínima</label>
                            <input
                                type="number"
                                required
                                value={currentProduct.min_quantity}
                                onChange={e => setCurrentProduct({ ...currentProduct, min_quantity: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Preço de Custo (R$)</label>
                            <input
                                type="text"
                                required
                                value={currentProduct.cost_price}
                                onChange={e => handleCostChange(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Margem de Lucro (%)</label>
                            <input
                                type="number"
                                step="0.1"
                                placeholder="Ex: 50"
                                value={currentProduct.profit_margin_percent}
                                onChange={e => handleMarginChange(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Preço de Venda (R$)</label>
                            <input
                                type="text"
                                required
                                value={currentProduct.selling_price}
                                onChange={e => setCurrentProduct({ ...currentProduct, selling_price: formatInputCurrency(e.target.value) })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Categoria</label>
                            <CreatableSelect
                                instanceId="product-category"
                                isClearable
                                placeholder="Selecione ou digite para cadastrar..."
                                formatCreateLabel={(input) => `Cadastrar categoria: "${input}"`}
                                noOptionsMessage={() => 'Digite para cadastrar uma nova categoria'}
                                options={categories.map(c => ({ value: c.id, label: c.name }))}
                                inputValue={categoryInput}
                                onInputChange={(val, { action }) => { if (action === 'input-change') setCategoryInput(val) }}
                                value={
                                    currentProduct.category_id
                                        ? (() => {
                                            const c = categories.find(c => c.id === currentProduct.category_id)
                                            return c ? { value: c.id, label: c.name } : null
                                        })()
                                        : null
                                }
                                onChange={(opt) => setCurrentProduct(prev => ({ ...prev, category_id: opt ? opt.value : '' }))}
                                onCreateOption={handleCreateCategory}
                                styles={customStyles}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Marca</label>
                            <CreatableSelect
                                instanceId="product-brand"
                                isClearable
                                placeholder="Selecione ou digite para cadastrar..."
                                formatCreateLabel={(input) => `Cadastrar marca: "${input}"`}
                                noOptionsMessage={() => 'Digite para cadastrar uma nova marca'}
                                options={brands.map(b => ({ value: b.id, label: b.name }))}
                                inputValue={brandInput}
                                onInputChange={(val, { action }) => { if (action === 'input-change') setBrandInput(val) }}
                                value={
                                    currentProduct.brand_id
                                        ? (() => {
                                            const b = brands.find(b => b.id === currentProduct.brand_id)
                                            return b ? { value: b.id, label: b.name } : null
                                        })()
                                        : null
                                }
                                onChange={(opt) => setCurrentProduct(prev => ({ ...prev, brand_id: opt ? opt.value : '' }))}
                                onCreateOption={handleCreateBrand}
                                styles={customStyles}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Fornecedor</label>
                            <select
                                value={currentProduct.supplier_id || ''}
                                onChange={e => setCurrentProduct({ ...currentProduct, supplier_id: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            >
                                <option value="">Selecione um fornecedor (opcional)</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.cnpj})</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
                            <textarea
                                value={currentProduct.description || ''}
                                onChange={e => setCurrentProduct({ ...currentProduct, description: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                rows="3"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Vínculos (Produtos Equivalentes)</label>
                            <Select
                                isMulti
                                options={productOptions}
                                value={currentProduct.linked_products || []}
                                onChange={selected => setCurrentProduct({ ...currentProduct, linked_products: selected })}
                                placeholder="Buscar e vincular produtos (ex: Kit Troca de Óleo)"
                                styles={customStyles}
                                noOptionsMessage={() => "Nenhum produto encontrado"}
                            />
                        </div>
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono bg-neutral-900 rounded p-2">
                        DEBUG — category_id: {String(currentProduct.category_id ?? 'null')} | brand_id: {String(currentProduct.brand_id ?? 'null')} | categorias carregadas: {categories.length}
                    </div>

                    {saveError && (
                        <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
                            {saveError}
                        </div>
                    )}
                    <div className="flex gap-4 pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium"
                        >
                            {loading ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsEditing(false); setSaveError('') }}
                            className="bg-neutral-700 hover:bg-neutral-600 text-gray-200 px-5 py-2.5 rounded-lg font-medium"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}
        </div>
    )
}

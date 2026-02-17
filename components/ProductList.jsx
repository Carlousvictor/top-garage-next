"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'

export default function ProductList() {
    const supabase = createClient()
    const { companyId } = useAuth()

    const [products, setProducts] = useState([])
    const [suppliers, setSuppliers] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [isEditing, setIsEditing] = useState(false)
    const [currentProduct, setCurrentProduct] = useState({
        name: '',
        sku: '',
        description: '',
        cost_price: '',
        selling_price: '',
        profit_margin: '',
        quantity: '',
        supplier_id: ''
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data: prodData } = await supabase
            .from('products')
            .select(`
                *,
                suppliers (name)
            `)
            .order('name')

        const { data: suppData } = await supabase.from('suppliers').select('*').order('name')

        setProducts(prodData || [])
        setSuppliers(suppData || [])
        setLoading(false)
    }

    const handleEdit = (product) => {
        setCurrentProduct({
            ...product,
            cost_price: formatCurrency(product.cost_price),
            selling_price: formatCurrency(product.selling_price)
        })
        setIsEditing(true)
    }

    const handleNew = () => {
        setCurrentProduct({
            name: '',
            sku: '',
            description: '',
            cost_price: '',
            selling_price: '',
            profit_margin: '',
            quantity: 0,
            supplier_id: ''
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
        const newSelling = calculateSellingPrice(newCost, currentProduct.profit_margin)
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
            profit_margin: newMargin,
            selling_price: newSelling || prev.selling_price
        }))
    }

    const handleSave = async (e) => {
        e.preventDefault()
        setLoading(true)

        if (!companyId) {
            alert('Erro: Empresa não identificada.')
            setLoading(false)
            return
        }

        try {
            const payload = {
                company_id: companyId,
                name: currentProduct.name,
                sku: currentProduct.sku,
                description: currentProduct.description,
                cost_price: parseCurrency(currentProduct.cost_price),
                selling_price: parseCurrency(currentProduct.selling_price),
                quantity: parseInt(currentProduct.quantity || 0),
                supplier_id: currentProduct.supplier_id || null
            }

            if (currentProduct.id) {
                // Remove company_id from update payload to rely on RLS/avoid overwrite if not needed
                // But for safety and consistency with Insert, we can keep it or remove it. 
                // Usually better to not change owner.
                const { company_id, ...updatePayload } = payload
                await supabase.from('products').update(updatePayload).eq('id', currentProduct.id)
            } else {
                await supabase.from('products').insert([payload])
            }

            setIsEditing(false)
            fetchData()
        } catch (error) {
            alert('Erro ao salvar produto: ' + error.message)
        } finally {
            setLoading(false)
        }
    }


    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir este produto?')) return
        await supabase.from('products').delete().eq('id', id)
        fetchData()
    }

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-bold text-white">Gestão de Estoque</h2>
                <div className="flex gap-2 w-full md:w-auto">
                    <input
                        type="text"
                        placeholder="Buscar por nome ou código..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                    />
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
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-200 uppercase bg-black">
                            <tr>
                                <th className="px-6 py-3">Cód/SKU</th>
                                <th className="px-6 py-3">Produto</th>
                                <th className="px-6 py-3 text-center">Qtd</th>
                                <th className="px-6 py-3">Custo (R$)</th>
                                <th className="px-6 py-3">Venda (R$)</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" className="text-center py-4">Carregando...</td></tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr><td colSpan="6" className="text-center py-4">Nenhum produto encontrado.</td></tr>
                            ) : (
                                filteredProducts.map((product) => (
                                    <tr key={product.id} className="border-b border-neutral-800 hover:bg-neutral-800">
                                        <td className="px-6 py-4 font-mono text-xs">{product.sku || '-'}</td>
                                        <td className="px-6 py-4 font-medium text-white">
                                            {product.name}
                                            {product.suppliers && (
                                                <div className="text-xs text-gray-500">{product.suppliers.name}</div>
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
                            <label className="block text-sm font-medium text-gray-300 mb-1">Quantidade em Estoque</label>
                            <input
                                type="number"
                                required
                                value={currentProduct.quantity}
                                onChange={e => setCurrentProduct({ ...currentProduct, quantity: e.target.value })}
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
                                value={currentProduct.profit_margin}
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
                    </div>
                    <div className="flex gap-4 pt-6">
                        <button
                            type="submit"
                            className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-medium"
                        >
                            Salvar
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
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

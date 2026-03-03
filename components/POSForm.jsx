"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'

export default function POSForm() {
    const supabase = createClient()
    const router = useRouter()
    const { tenantId } = useAuth()

    const [products, setProducts] = useState([])
    const [cart, setCart] = useState([])
    const [selectedProduct, setSelectedProduct] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const fetchProducts = async () => {
            const { data } = await supabase.from('products').select('*').order('name')
            setProducts(data || [])
        }
        fetchProducts()
    }, [])

    const handleAddToCart = () => {
        if (!selectedProduct) return
        const product = products.find(p => p.id === parseInt(selectedProduct))
        if (!product) return

        // Check if already in cart
        const existing = cart.find(item => item.product_id === product.id)
        if (existing) {
            setCart(cart.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
        } else {
            setCart([...cart, {
                product_id: product.id,
                name: product.name,
                unit_price: product.selling_price || 0,
                quantity: 1,
                max_quantity: product.quantity // For validation
            }])
        }
        setSelectedProduct('')
    }

    const handleRemoveFromCart = (index) => {
        const newCart = [...cart]
        newCart.splice(index, 1)
        setCart(newCart)
    }

    const updateQuantity = (index, qty) => {
        const newCart = [...cart]
        newCart[index].quantity = qty
        setCart(newCart)
    }

    const calculateTotal = () => {
        return cart.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0)
    }

    const handleCheckout = async () => {
        if (cart.length === 0) return
        if (!window.confirm(`Confirmar venda no valor de R$ ${calculateTotal().toFixed(2)}?`)) return

        setLoading(true)

        if (!tenantId) {
            alert('Erro: Empresa não identificada.')
            setLoading(false)
            return
        }

        try {
            const total = calculateTotal()

            // 1. Deduct Stock
            for (const item of cart) {
                const { data: prod } = await supabase
                    .from('products')
                    .select('quantity')
                    .eq('id', item.product_id)
                    .single()

                if (prod) {
                    await supabase
                        .from('products')
                        .update({ quantity: prod.quantity - item.quantity })
                        .eq('id', item.product_id)
                }
            }

            // 2. Register Transaction (Income)
            const { error: txError } = await supabase.from('transactions').insert([{
                tenant_id: tenantId,
                description: `Venda Balcão (PDV) - ${paymentMethod}`,
                type: 'income',
                category: 'Venda de Peças',
                amount: total,
                status: 'paid', // Instant pay
                date: new Date().toISOString()
            }])

            if (txError) throw txError

            alert('Venda realizada com sucesso!')
            setCart([])
            // Refresh products explicitly or via page reload to get updated stock
            window.location.reload()
        } catch (error) {
            console.error(error)
            alert('Erro ao finalizar venda: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800 flex flex-col md:flex-row gap-6">
            {/* Products Selection */}
            <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-4">Ponto de Venda (PDV)</h2>

                <div className="flex gap-2 mb-6">
                    <select
                        className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-3"
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                    >
                        <option value="">Selecione um produto para venda...</option>
                        {products.map(p => (
                            <option key={p.id} value={p.id} disabled={p.quantity <= 0}>
                                {p.name} - R$ {p.selling_price} (Estoque: {p.quantity})
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={handleAddToCart}
                        className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-lg font-bold whitespace-nowrap"
                    >
                        Adicionar
                    </button>
                </div>

                {/* Cart Table */}
                <div className="bg-black rounded-lg border border-neutral-800 overflow-hidden h-[400px] overflow-y-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-200 uppercase bg-neutral-900 sticky top-0">
                            <tr>
                                <th className="px-4 py-3">Produto</th>
                                <th className="px-4 py-3 w-24 text-center">Qtd</th>
                                <th className="px-4 py-3 w-24 text-right">R$ Un</th>
                                <th className="px-4 py-3 w-24 text-right">Total</th>
                                <th className="px-4 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {cart.map((item, idx) => (
                                <tr key={idx} className="border-b border-neutral-800">
                                    <td className="px-4 py-3 text-white">{item.name}</td>
                                    <td className="px-4 py-3 text-center">
                                        <input
                                            type="number"
                                            min="1"
                                            max={item.max_quantity}
                                            value={item.quantity}
                                            onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 1)}
                                            className="w-16 bg-neutral-800 border border-neutral-700 rounded p-1 text-center text-white"
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <input
                                            type="number"
                                            value={item.unit_price}
                                            onChange={(e) => {
                                                const newCart = [...cart]
                                                newCart[idx].unit_price = parseFloat(e.target.value) || 0
                                                setCart(newCart)
                                            }}
                                            className="w-20 bg-neutral-800 border border-neutral-700 rounded p-1 text-right text-white"
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-right text-white font-bold">
                                        {(item.quantity * item.unit_price).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => handleRemoveFromCart(idx)} className="text-red-500 font-bold hover:text-red-400">X</button>
                                    </td>
                                </tr>
                            ))}
                            {cart.length === 0 && (
                                <tr><td colSpan="5" className="text-center py-10 text-gray-500">Carrinho vazio</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Checkout Panel */}
            <div className="w-full md:w-80 bg-black p-6 rounded-lg border border-neutral-800 flex flex-col justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-300 border-b border-neutral-800 pb-2 mb-4">Resumo da Venda</h3>

                    <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-400">Itens:</span>
                        <span className="text-white font-bold">{cart.length}</span>
                    </div>

                    <div className="mt-8 mb-4">
                        <label className="block text-sm text-gray-400 mb-2">Forma de Pagamento:</label>
                        <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-white rounded block w-full p-2"
                        >
                            <option>Dinheiro</option>
                            <option>PIX</option>
                            <option>Cartão de Crédito</option>
                            <option>Cartão de Débito</option>
                        </select>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-end border-t border-neutral-800 pt-4 mb-6">
                        <span className="text-gray-400 text-lg">Total a Pagar:</span>
                        <span className="text-4xl font-black text-green-500">
                            R$ {calculateTotal().toFixed(2)}
                        </span>
                    </div>

                    <button
                        onClick={handleCheckout}
                        disabled={loading || cart.length === 0}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-4 rounded-xl font-black text-xl shadow-lg shadow-green-900/40 transition-all"
                    >
                        {loading ? 'Processando...' : 'FINALIZAR VENDA'}
                    </button>
                </div>
            </div>
        </div>
    )
}

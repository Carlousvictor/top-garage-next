"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import CreatableSelect from 'react-select/creatable'

export default function POSForm() {
    const supabase = createClient()
    const router = useRouter()
    const { tenantId } = useAuth()

    const [products, setProducts] = useState([])
    const [clients, setClients] = useState([])
    const [cart, setCart] = useState([])
    const [selectedProduct, setSelectedProduct] = useState('')
    const [selectedClient, setSelectedClient] = useState(null)
    // Texto que o operador digitou no select de cliente — capturado em paralelo ao
    // selectedClient pra que o nome digitado seja aproveitado mesmo sem Enter/click.
    const [clientInputText, setClientInputText] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro')
    const [loading, setLoading] = useState(false)

    // Resolve o nome do cliente pra gravar na descrição da transação.
    // Hierarquia: cliente selecionado > nome digitado > "Consumidor" (padrão).
    const resolveClientLabel = () => {
        if (selectedClient?.label) return selectedClient.label
        const typed = clientInputText.trim()
        if (typed) return typed
        return 'Consumidor'
    }

    useEffect(() => {
        const fetchData = async () => {
            const [{ data: prods }, { data: cli }] = await Promise.all([
                supabase.from('products').select('*').order('name'),
                supabase.from('clients').select('id, name').order('name')
            ])
            setProducts(prods || [])
            setClients(cli || [])
        }
        fetchData()
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

    // status: 'paid' = venda finalizada; 'pending' = venda em aberto.
    // Em ambos os casos o estoque é deduzido — o cliente saiu com o produto.
    // A diferença está só no transactions.status. Vendas em aberto aparecem
    // na aba "Em Aberto" do Movimento Diário pra serem finalizadas depois.
    const handleCheckout = async (status = 'paid') => {
        if (cart.length === 0) return

        const total = calculateTotal()
        const isPending = status === 'pending'
        const clientLabel = resolveClientLabel()
        const hasIdentifiedClient = !!selectedClient || !!clientInputText.trim()

        // Pra venda em aberto exigimos cliente identificado (selecionado OU digitado).
        // "Consumidor" anônimo não é aceitável aqui — não dá pra cobrar depois.
        if (isPending && !hasIdentifiedClient) {
            alert('Para deixar a venda em aberto, informe o cliente — selecione um cadastrado ou digite o nome.')
            return
        }

        const confirmMsg = isPending
            ? `Deixar venda EM ABERTO no valor de R$ ${total.toFixed(2)} para ${clientLabel}?\nO estoque será baixado e a venda ficará pendente até ser finalizada.`
            : `Confirmar venda no valor de R$ ${total.toFixed(2)}?`
        if (!window.confirm(confirmMsg)) return

        setLoading(true)

        if (!tenantId) {
            alert('Erro: Empresa não identificada.')
            setLoading(false)
            return
        }

        try {
            // 1. Deduct Stock (acontece em ambos os casos)
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
            // clientLabel já resolvido acima — sempre tem valor (cadastrado, digitado ou "Consumidor").
            const description = isPending
                ? `Venda Balcão (PDV) - Em Aberto - ${clientLabel}`
                : `Venda Balcão (PDV) - ${paymentMethod} - ${clientLabel}`

            const { error: txError } = await supabase.from('transactions').insert([{
                tenant_id: tenantId,
                description,
                type: 'income',
                category: 'Venda de Peças',
                amount: total,
                status,
                date: new Date().toISOString(),
                payment_method: isPending ? null : paymentMethod
            }])

            if (txError) throw txError

            alert(isPending ? 'Venda registrada em aberto.' : 'Venda finalizada com sucesso!')
            setCart([])
            setSelectedClient(null)
            setClientInputText('')
            window.location.reload()
        } catch (error) {
            console.error(error)
            alert('Erro ao finalizar venda: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    // Tema escuro do react-select alinhado com o resto do app
    const selectStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: '#262626',
            borderColor: state.isFocused ? '#ef4444' : '#404040',
            color: '#ffffff',
            minHeight: '38px',
            boxShadow: 'none',
            '&:hover': { borderColor: '#ef4444' }
        }),
        menu: (base) => ({ ...base, backgroundColor: '#171717', border: '1px solid #404040' }),
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

                    <div className="mt-6 mb-4">
                        <label className="block text-sm text-gray-400 mb-2">Cliente:</label>
                        <CreatableSelect
                            instanceId="pdv-client"
                            isClearable
                            placeholder='Buscar, digitar ou deixar como "Consumidor"...'
                            formatCreateLabel={(input) => `Usar: "${input}"`}
                            noOptionsMessage={() => 'Nenhum cadastro encontrado — pode digitar o nome livremente.'}
                            options={clients.map(c => ({ value: c.id, label: c.name }))}
                            value={selectedClient}
                            onChange={(opt) => {
                                setSelectedClient(opt)
                                // Limpa o input quando o operador escolhe da lista — evita
                                // confusão entre "selecionado" e "digitado".
                                if (opt) setClientInputText('')
                            }}
                            onInputChange={(input, action) => {
                                if (action.action === 'input-change') setClientInputText(input)
                            }}
                            styles={selectStyles}
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                            Se ninguém for selecionado/digitado, a venda fica como <strong>Consumidor</strong>.
                        </p>
                    </div>

                    <div className="mt-4 mb-4">
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
                        <p className="text-[11px] text-gray-500 mt-1">
                            Ignorado se a venda for deixada em aberto.
                        </p>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-end border-t border-neutral-800 pt-4 mb-4">
                        <span className="text-gray-400 text-lg">Total:</span>
                        <span className="text-4xl font-black text-green-500">
                            R$ {calculateTotal().toFixed(2)}
                        </span>
                    </div>

                    <button
                        onClick={() => handleCheckout('paid')}
                        disabled={loading || cart.length === 0}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-4 rounded-xl font-black text-xl shadow-lg shadow-green-900/40 transition-all mb-3"
                    >
                        {loading ? 'Processando...' : 'FINALIZADA'}
                    </button>

                    <button
                        onClick={() => handleCheckout('pending')}
                        disabled={loading || cart.length === 0}
                        className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-base shadow-lg shadow-amber-900/40 transition-all"
                        title="Estoque é baixado e a venda fica pendente. Pode ser finalizada depois na aba Em Aberto."
                    >
                        DEIXAR EM ABERTO
                    </button>
                </div>
            </div>
        </div>
    )
}

"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import CreatableSelect from 'react-select/creatable'
import Select from 'react-select'
import QuickProductModal from './QuickProductModal'

export default function POSForm({ initialClients = [] }) {
    const supabase = createClient()
    const router = useRouter()
    const { tenantId } = useAuth()
    const toast = useToast()
    const confirm = useConfirm()

    const [products, setProducts] = useState([])
    // Lista de clientes vem via SSR do app/pdv/page.js — elimina a race condition
    // que dava "às vezes aparece, às vezes não" quando o useEffect disparava
    // antes da sessão Supabase estar hidratada no cliente.
    const [clients, setClients] = useState(initialClients)
    const [cart, setCart] = useState([])
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [quickProductOpen, setQuickProductOpen] = useState(false)
    const [quickProductInitialName, setQuickProductInitialName] = useState('')
    const [selectedClient, setSelectedClient] = useState(null)
    // Texto que o operador digitou no select de cliente — capturado em paralelo ao
    // selectedClient pra que o nome digitado seja aproveitado mesmo sem Enter/click.
    const [clientInputText, setClientInputText] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro')
    // Pagamento dividido (até 2 formas). Quando off, usa paymentMethod único como hoje.
    const [splitPayment, setSplitPayment] = useState(false)
    const [payment1Method, setPayment1Method] = useState('Dinheiro')
    const [payment1Amount, setPayment1Amount] = useState('')
    const [payment2Method, setPayment2Method] = useState('Cartão de Débito')
    const [payment2Amount, setPayment2Amount] = useState('')
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
            const { data: prods } = await supabase.from('products').select('*').order('name')
            setProducts(prods || [])
        }
        fetchData()
    }, [])

    const addProductToCart = (product) => {
        const existing = cart.find(item => item.product_id === product.id)
        if (existing) {
            setCart(cart.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
        } else {
            setCart([...cart, {
                product_id: product.id,
                name: product.name,
                unit_price: product.selling_price || 0,
                quantity: 1,
                max_quantity: product.quantity
            }])
        }
        setSelectedProduct(null)
    }

    const handleAddToCart = () => {
        if (!selectedProduct) return
        const product = products.find(p => p.id === selectedProduct.value)
        if (!product) return
        addProductToCart(product)
    }

    const handleQuickProductCreated = (newProduct) => {
        setProducts(prev => [...prev, newProduct].sort((a, b) => a.name.localeCompare(b.name)))
        addProductToCart(newProduct)
        setQuickProductOpen(false)
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

    // Quando ativa o split, sugere split 50/50 baseado no total atual.
    const handleToggleSplit = (checked) => {
        setSplitPayment(checked)
        if (checked) {
            const total = calculateTotal()
            const half = (total / 2).toFixed(2)
            setPayment1Amount(half)
            setPayment2Amount((total - parseFloat(half)).toFixed(2))
        } else {
            setPayment1Amount('')
            setPayment2Amount('')
        }
    }

    // Auto-balanço: ao editar a linha 1, linha 2 vira (total - linha1).
    const handlePayment1AmountChange = (val) => {
        setPayment1Amount(val)
        const v1 = parseFloat(val) || 0
        const total = calculateTotal()
        setPayment2Amount((total - v1).toFixed(2))
    }

    const handlePayment2AmountChange = (val) => {
        setPayment2Amount(val)
        const v2 = parseFloat(val) || 0
        const total = calculateTotal()
        setPayment1Amount((total - v2).toFixed(2))
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
            toast.warning('Para deixar a venda em aberto, informe o cliente — selecione um cadastrado ou digite o nome.')
            return
        }

        // Validate split payment when active and not pending.
        if (splitPayment && !isPending) {
            const v1 = parseFloat(payment1Amount) || 0
            const v2 = parseFloat(payment2Amount) || 0
            if (v1 <= 0 || v2 <= 0) {
                toast.error('Ambas as formas de pagamento precisam ter valor maior que zero.')
                return
            }
            if (Math.abs((v1 + v2) - total) > 0.01) {
                toast.error(`Soma das duas formas (R$ ${(v1 + v2).toFixed(2)}) não confere com o total (R$ ${total.toFixed(2)}).`)
                return
            }
            if (payment1Method === payment2Method) {
                toast.error('As duas formas de pagamento devem ser diferentes.')
                return
            }
        }

        const ok = await confirm({
            title: isPending ? 'Deixar venda em aberto' : 'Confirmar venda',
            message: isPending
                ? `Valor: R$ ${total.toFixed(2)}\nCliente: ${clientLabel}\n\nO estoque será baixado e a venda ficará pendente até ser finalizada.`
                : `Valor total: R$ ${total.toFixed(2)}\n\nDeseja confirmar a venda?`,
            confirmLabel: isPending ? 'Deixar em aberto' : 'Confirmar venda',
        })
        if (!ok) return

        setLoading(true)

        if (!tenantId) {
            toast.error('Empresa não identificada.')
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

            // 2. Determine payment_method written to the transactions row
            const isSplit = splitPayment && !isPending
            const txPaymentMethod = isPending
                ? null
                : (isSplit ? 'Múltiplo' : paymentMethod)

            const description = isPending
                ? `Venda Balcão (PDV) - Em Aberto - ${clientLabel}`
                : `Venda Balcão (PDV) - ${isSplit ? 'Múltiplo' : paymentMethod} - ${clientLabel}`

            // 3. Insert transaction (capture id for split)
            const { data: txRows, error: txError } = await supabase
                .from('transactions')
                .insert([{
                    tenant_id: tenantId,
                    description,
                    type: 'income',
                    category: 'Venda de Peças',
                    amount: total,
                    status,
                    date: new Date().toISOString(),
                    payment_method: txPaymentMethod,
                }])
                .select('id')

            if (txError) throw txError

            // 4. If split, insert two payment rows linked to the transaction
            if (isSplit && txRows && txRows[0]) {
                const transactionId = txRows[0].id
                const v1 = parseFloat(payment1Amount)
                const v2 = parseFloat(payment2Amount)
                const { error: payError } = await supabase
                    .from('transaction_payments')
                    .insert([
                        { transaction_id: transactionId, payment_method: payment1Method, amount: v1 },
                        { transaction_id: transactionId, payment_method: payment2Method, amount: v2 },
                    ])
                if (payError) throw payError
            }

            toast.success(isPending ? 'Venda registrada em aberto.' : 'Venda finalizada com sucesso!')
            setCart([])
            setSelectedClient(null)
            setClientInputText('')
            setSplitPayment(false)
            setPayment1Amount('')
            setPayment2Amount('')
            window.location.reload()
        } catch (error) {
            console.error(error)
            toast.error('Erro ao finalizar venda: ' + error.message)
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
        <>
        <div className="bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800 flex flex-col md:flex-row gap-6">
            {/* Products Selection */}
            <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-4">Ponto de Venda (PDV)</h2>

                <div className="flex gap-2 mb-6">
                    <div className="flex-1">
                        <Select
                            instanceId="pdv-product"
                            placeholder="Buscar por nome, SKU ou EAN..."
                            noOptionsMessage={() => 'Nenhum produto encontrado'}
                            options={products.map(p => ({
                                value: p.id,
                                label: p.name,
                                name: p.name,
                                sku: p.sku || '',
                                ean: p.ean || '',
                                qty: p.quantity
                            }))}
                            filterOption={(option, input) => {
                                if (!input) return true
                                const q = input.toLowerCase()
                                return (
                                    option.data.name?.toLowerCase().includes(q) ||
                                    option.data.sku?.toLowerCase().includes(q) ||
                                    option.data.ean?.toLowerCase().includes(q)
                                )
                            }}
                            formatOptionLabel={(opt, { context }) => {
                                if (context === 'value') return <span>{opt.name}</span>
                                return (
                                    <div className="flex items-center justify-between gap-2">
                                        <span>{opt.name}</span>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {opt.sku && <span className="text-[11px] text-gray-400 font-mono">{opt.sku}</span>}
                                            <span className={`text-[11px] font-bold ${opt.qty <= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                Estq: {opt.qty}
                                            </span>
                                        </div>
                                    </div>
                                )
                            }}
                            value={selectedProduct}
                            onChange={(opt) => setSelectedProduct(opt)}
                            styles={selectStyles}
                        />
                    </div>
                    <button
                        onClick={handleAddToCart}
                        disabled={!selectedProduct}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white px-5 py-3 rounded-lg font-bold whitespace-nowrap"
                    >
                        Adicionar
                    </button>
                    <button
                        onClick={() => { setQuickProductInitialName(''); setQuickProductOpen(true) }}
                        className="bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-3 rounded-lg font-bold whitespace-nowrap text-sm"
                        title="Cadastrar novo produto"
                    >
                        + Novo
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
                            onBlur={() => {
                                // Quando o operador digita e sai do campo sem clicar em "Usar"
                                // ou apertar Enter, o react-select limpa o input visual.
                                // Aqui auto-commitamos o texto como opção criada — assim o
                                // nome digitado vira um "chip" visível no campo.
                                const typed = clientInputText.trim()
                                if (typed && !selectedClient) {
                                    setSelectedClient({ value: typed, label: typed, __isNew__: true })
                                    setClientInputText('')
                                }
                            }}
                            styles={selectStyles}
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                            Se ninguém for selecionado/digitado, a venda fica como <strong>Consumidor</strong>.
                        </p>
                    </div>

                    <div className="mt-4 mb-4">
                        <label className="block text-sm text-gray-400 mb-2">Forma de Pagamento:</label>

                        {!splitPayment ? (
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
                        ) : (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <select
                                        value={payment1Method}
                                        onChange={(e) => setPayment1Method(e.target.value)}
                                        className="bg-neutral-800 border border-neutral-700 text-white rounded block flex-1 p-2 text-sm"
                                    >
                                        <option>Dinheiro</option>
                                        <option>PIX</option>
                                        <option>Cartão de Crédito</option>
                                        <option>Cartão de Débito</option>
                                    </select>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Valor"
                                        value={payment1Amount}
                                        onChange={(e) => handlePayment1AmountChange(e.target.value)}
                                        className="bg-neutral-800 border border-neutral-700 text-white rounded block w-28 p-2 text-sm text-right"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        value={payment2Method}
                                        onChange={(e) => setPayment2Method(e.target.value)}
                                        className="bg-neutral-800 border border-neutral-700 text-white rounded block flex-1 p-2 text-sm"
                                    >
                                        <option>Dinheiro</option>
                                        <option>PIX</option>
                                        <option>Cartão de Crédito</option>
                                        <option>Cartão de Débito</option>
                                    </select>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Valor"
                                        value={payment2Amount}
                                        onChange={(e) => handlePayment2AmountChange(e.target.value)}
                                        className="bg-neutral-800 border border-neutral-700 text-white rounded block w-28 p-2 text-sm text-right"
                                    />
                                </div>
                            </div>
                        )}

                        <label className="flex items-center gap-2 mt-2 text-xs text-gray-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={splitPayment}
                                onChange={(e) => handleToggleSplit(e.target.checked)}
                                className="w-4 h-4 text-red-600 bg-neutral-800 border-neutral-700 rounded"
                            />
                            Dividir em duas formas de pagamento
                        </label>

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

        <QuickProductModal
            isOpen={quickProductOpen}
            onClose={() => setQuickProductOpen(false)}
            onCreated={handleQuickProductCreated}
            initialName={quickProductInitialName}
        />
        </>
    )
}

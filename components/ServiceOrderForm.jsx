"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import ServiceOrderPrint from './ServiceOrderPrint'

export default function ServiceOrderForm({ order }) {
    const supabase = createClient()
    const router = useRouter()
    const { companyId } = useAuth()

    // Fallback if onCancel not passed -> use router.back() or push to /os
    const onCancel = () => router.push('/os')
    const onSave = () => {
        router.refresh()
        router.push('/os')
    }
    const [loading, setLoading] = useState(false)
    const [clientId, setClientId] = useState(order?.client_id || '')
    const [plate, setPlate] = useState(order?.vehicle_plate || '')
    const [brand, setBrand] = useState(order?.vehicle_brand || '')
    const [model, setModel] = useState(order?.vehicle_model || '')
    const [status, setStatus] = useState(order?.status || 'Aberto')
    const [observation, setObservation] = useState(order?.observation || '')
    const [isEstimate, setIsEstimate] = useState(order?.is_estimate || false)
    const [nextRevisionDate, setNextRevisionDate] = useState(order?.next_revision_date ? order.next_revision_date.split('T')[0] : '')
    const [items, setItems] = useState([]) // Will fetch later if edit

    const [clients, setClients] = useState([])
    const [clientVehicles, setClientVehicles] = useState([])
    const [products, setProducts] = useState([])
    const [services, setServices] = useState([])

    const [selectedProduct, setSelectedProduct] = useState('')
    const [selectedService, setSelectedService] = useState('')

    useEffect(() => {
        const fetchData = async () => {
            const { data: clientsData } = await supabase.from('clients').select('*').order('name')
            setClients(clientsData || [])

            const { data: productsData } = await supabase.from('products').select('*').order('name')
            setProducts(productsData || [])

            const { data: servicesData } = await supabase.from('services').select('*').order('name')
            setServices(servicesData || [])

            if (order?.id) {
                const { data: itemsData } = await supabase
                    .from('service_order_items')
                    .select('*')
                    .eq('service_order_id', order.id)
                setItems(itemsData || [])
            }
        }
        fetchData()
    }, [order?.id])

    useEffect(() => {
        const fetchVehicles = async () => {
            if (clientId) {
                const { data } = await supabase.from('vehicles').select('*').eq('client_id', clientId).order('created_at')
                setClientVehicles(data || [])
            } else {
                setClientVehicles([])
            }
        }
        fetchVehicles()
    }, [clientId])

    const handleAddItem = (type) => {
        // ... preserving other functions until the render
        if (type === 'product' && selectedProduct) {
            const product = products.find(p => p.id === parseInt(selectedProduct))
            if (product) {
                if (product.quantity <= (product.min_quantity || 0)) {
                    alert(`Atenção: O estoque de ${product.name} está em ${product.quantity}, atingindo ou abaixo do mínimo (${product.min_quantity || 0}).`)
                }
                setItems([...items, {
                    type: 'product',
                    product_id: product.id,
                    description: product.name,
                    quantity: 1,
                    cost_price: product.cost_price,
                    profit_margin: product.profit_margin_percent || 0,
                    unit_price: product.selling_price || 0
                }])
                setSelectedProduct('')
            }
        } else if (type === 'service' && selectedService) {
            const service = services.find(s => s.id === parseInt(selectedService))
            if (service) {
                setItems([...items, {
                    type: 'service',
                    service_id: service.id,
                    description: service.name,
                    quantity: 1,
                    unit_price: service.price || 0
                }])
                setSelectedService('')
            }
        }
    }

    const handleRemoveItem = (index) => {
        const newItems = [...items]
        newItems.splice(index, 1)
        setItems(newItems)
    }

    const calculateTotal = () => {
        return items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)

        if (!companyId) {
            alert('Erro: Empresa não identificada. Faça login novamente.')
            setLoading(false)
            return
        }

        try {
            const total = calculateTotal()

            // 1. Upsert Order
            const orderData = {
                tenant_id: companyId,
                client_id: clientId || null,
                vehicle_plate: plate,
                vehicle_brand: brand,
                vehicle_model: model,
                status,
                observation,
                is_estimate: isEstimate,
                next_revision_date: nextRevisionDate || null,
                total
            }

            let orderId = order?.id

            if (orderId) {
                await supabase.from('service_orders').update(orderData).eq('id', orderId)
            } else {
                const { data, error } = await supabase.from('service_orders').insert([orderData]).select().single()
                if (error) throw error
                orderId = data.id
            }

            if (orderId) {
                if (order?.id) {
                    await supabase.from('service_order_items').delete().eq('service_order_id', orderId)
                }

                if (items.length > 0) {
                    const itemsToInsert = items.map(item => ({
                        tenant_id: companyId,
                        service_order_id: orderId,
                        product_id: item.product_id || null,
                        service_id: item.service_id || null,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        type: item.type
                    }))

                    const { error: itemsError } = await supabase.from('service_order_items').insert(itemsToInsert)
                    if (itemsError) throw itemsError
                }
            }

            onSave()
        } catch (error) {
            console.error('Error saving order:', error)
            alert('Erro ao salvar OS: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleFinish = async () => {
        if (!window.confirm('Deseja realmente finalizar a OS? Isso irá baixar o estoque e lançar a receita.')) return
        setLoading(true)

        if (!companyId) {
            alert('Erro: Empresa não identificada.')
            setLoading(false)
            return
        }

        try {
            const total = calculateTotal()

            const { error: osError } = await supabase
                .from('service_orders')
                .update({ status: 'Concluido', total })
                .eq('id', order.id)

            if (osError) throw osError

            for (const item of items) {
                if (item.type === 'product' && item.product_id) {
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
            }

            await supabase.from('transactions').insert([{
                tenant_id: companyId,
                description: `Receita OS #${order.id} - Placa ${plate}`,
                type: 'income',
                category: 'Service',
                amount: total,
                related_os_id: order.id
            }])

            alert('OS Finalizada com sucesso!')
            onSave()
        } catch (error) {
            console.error('Erro ao finalizar:', error)
            alert('Erro ao finalizar OS: ' + error.message)
        } finally {
            setLoading(false)
        }
    }


    const handlePrint = () => {
        window.print()
    }


    return (
        <>
            <div className="bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800 print:hidden">

                <h2 className="text-xl font-bold text-white mb-6">
                    {order ? `Editar OS #${order.id}` : 'Nova Ordem de Serviço'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Vehicle & Client Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Cliente</label>
                            <select
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            >
                                <option value="">Selecione um cliente (ou deixe vazio)</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        {clientVehicles.length > 0 && (
                            <div className="md:col-span-2 bg-neutral-950 p-3 rounded border border-blue-900/30">
                                <label className="block text-xs font-medium text-blue-400 mb-2">Autopreenchimento: Selecione um veículo do cliente</label>
                                <div className="flex flex-wrap gap-2">
                                    {clientVehicles.map(v => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => {
                                                setPlate(v.plate)
                                                setBrand(v.brand || '')
                                                setModel(v.model || '')
                                            }}
                                            className="bg-neutral-800 hover:bg-neutral-700 text-gray-200 px-3 py-1.5 rounded text-sm border border-neutral-700 transition"
                                        >
                                            {v.plate} - {v.brand} {v.model}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Placa *</label>
                            <input
                                type="text"
                                required
                                value={plate}
                                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                placeholder="ABC-1234"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Modelo</label>
                            <input
                                type="text"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                placeholder="Ex: Corolla"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            >
                                <option value="Aberto">Aberto</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Concluido">Concluído</option>
                                <option value="Cancelado">Cancelado</option>
                            </select>
                        </div>
                    </div>

                    {status === 'Concluido' && (
                        <div className="bg-neutral-950 p-4 border border-blue-900/40 rounded-lg shadow-sm">
                            <h3 className="text-sm font-bold text-blue-400 mb-2">Pós-Venda / CRM</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Data da Próxima Revisão (Para acionamento no WhatsApp)</label>
                                <input
                                    type="date"
                                    value={nextRevisionDate}
                                    onChange={(e) => setNextRevisionDate(e.target.value)}
                                    className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full md:w-1/2 p-2.5"
                                />
                                <p className="text-xs text-gray-500 mt-1">Ao definir uma data aqui, ela será usada como a data oficial para o alerta do CRM em vez do cálculo automático de tempo.</p>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="isEstimate"
                            checked={isEstimate}
                            onChange={(e) => setIsEstimate(e.target.checked)}
                            className="w-4 h-4 text-red-600 bg-neutral-800 border-neutral-700 rounded focus:ring-red-500"
                        />
                        <label htmlFor="isEstimate" className="text-sm font-medium text-gray-300">
                            Isso é apenas um orçamento (Não dá baixa em estoque / Não gera financeiro)
                        </label>
                    </div>

                    <hr className="border-neutral-800" />

                    {/* Items Selection */}
                    <div>
                        <h3 className="text-lg font-medium text-gray-200 mb-3">Itens da OS</h3>

                        <div className="flex gap-2 mb-4">
                            <div className="flex-1">
                                <select
                                    value={selectedProduct}
                                    onChange={(e) => setSelectedProduct(e.target.value)}
                                    className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                >
                                    <option value="">Adicionar Produto...</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} - R$ {p.selling_price}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleAddItem('product')}
                                className="bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-2 rounded-lg"
                            >
                                + Prod
                            </button>
                        </div>

                        <div className="flex gap-2 mb-4">
                            <div className="flex-1">
                                <select
                                    value={selectedService}
                                    onChange={(e) => setSelectedService(e.target.value)}
                                    className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                >
                                    <option value="">Adicionar Serviço...</option>
                                    {services.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} - R$ {s.price}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleAddItem('service')}
                                className="bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-2 rounded-lg"
                            >
                                + Serv
                            </button>
                        </div>

                        {/* Items List Table */}
                        <div className="bg-black rounded-lg border border-neutral-800 overflow-hidden">
                            <table className="w-full text-sm text-left text-gray-400">
                                <thead className="text-xs text-gray-200 uppercase bg-neutral-900">
                                    <tr>
                                        <th className="px-4 py-2">Descrição</th>
                                        <th className="px-4 py-2 w-20">Qtd</th>
                                        <th className="px-4 py-2 w-24">Valor Un.</th>
                                        <th className="px-4 py-2 w-24">Total</th>
                                        <th className="px-4 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={idx} className="border-b border-neutral-800">
                                            <td className="px-4 py-2">{item.description}</td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => {
                                                        const newItems = [...items]
                                                        newItems[idx].quantity = parseFloat(e.target.value) || 0
                                                        setItems(newItems)
                                                    }}
                                                    className="w-16 bg-neutral-800 border border-neutral-700 rounded p-1 text-center text-white"
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                {item.type === 'product' && item.cost_price !== undefined && (
                                                    <div className="flex flex-col gap-1 w-24">
                                                        <span className="text-xs text-gray-500">M: {item.profit_margin}%</span>
                                                        <input
                                                            type="number"
                                                            value={item.profit_margin}
                                                            onChange={(e) => {
                                                                const newItems = [...items]
                                                                const newMargin = parseFloat(e.target.value) || 0
                                                                newItems[idx].profit_margin = newMargin
                                                                newItems[idx].unit_price = (item.cost_price * (1 + newMargin / 100)).toFixed(2)
                                                                setItems(newItems)
                                                            }}
                                                            className="w-full bg-neutral-800 border border-neutral-700 rounded p-1 text-white text-xs"
                                                            placeholder="Margem %"
                                                        />
                                                    </div>
                                                )}
                                                <input
                                                    type="number"
                                                    value={item.unit_price}
                                                    onChange={(e) => {
                                                        const newItems = [...items]
                                                        newItems[idx].unit_price = parseFloat(e.target.value) || 0
                                                        setItems(newItems)
                                                    }}
                                                    className="w-24 mt-1 bg-neutral-800 border border-neutral-700 rounded p-1 text-white"
                                                    placeholder="Valor"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-white font-medium">
                                                R$ {(item.quantity * item.unit_price).toFixed(2)}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveItem(idx)}
                                                    className="text-red-500 hover:text-red-400 font-bold"
                                                >
                                                    X
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {items.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="px-4 py-4 text-center text-gray-600">
                                                Nenhum item adicionado
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot className="bg-neutral-900 font-bold text-white">
                                    <tr>
                                        <td colSpan="3" className="px-4 py-3 text-right">Total Final:</td>
                                        <td colSpan="2" className="px-4 py-3 text-lg text-green-400">R$ {calculateTotal().toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        {isEstimate && (
                            <button
                                type="button"
                                onClick={() => setIsEstimate(false)}
                                className="mr-auto px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-900/20 transition-colors"
                            >
                                Converter em OS
                            </button>
                        )}
                        {order && order.status !== 'Concluido' && !isEstimate && (
                            <button
                                type="button"
                                onClick={handleFinish}
                                disabled={loading}
                                className="mr-auto px-5 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-lg shadow-green-900/20 transition-colors"
                            >
                                Finalizar OS (Receber)
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="px-5 py-2.5 text-sm font-bold text-gray-900 bg-white hover:bg-gray-100 rounded-lg shadow-lg border border-gray-300 transition-colors mr-2"
                        >
                            Imprimir / PDF
                        </button>

                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-5 py-2.5 text-sm font-medium text-gray-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-lg shadow-red-900/20 transition-colors"
                        >
                            {loading ? 'Salvando...' : 'Salvar OS'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Print Component (Hidden on screen, Visible on Print) */}
            <ServiceOrderPrint
                order={order}
                items={items}
                client={clients.find(c => c.id == clientId) || { name: 'Consumidor Final' }}
            />
        </>

    )
}

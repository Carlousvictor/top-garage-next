"use client"
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import ServiceOrderPrint from './ServiceOrderPrint'
import CreatableSelect from 'react-select/creatable'
import QuickClientModal from './QuickClientModal'
import QuickProductModal from './QuickProductModal'
import QuickServiceModal from './QuickServiceModal'
import QuickVehicleModal from './QuickVehicleModal'
import { UserPlus, Car, CarFront, X as XIcon, Plus } from 'lucide-react'

// Dark theme for react-select, alinhado ao resto do app (neutral-800/700 + vermelho).
const selectStyles = {
    control: (base, state) => ({
        ...base,
        backgroundColor: '#262626',
        borderColor: state.isFocused ? '#ef4444' : '#404040',
        borderRadius: 8,
        minHeight: 42,
        boxShadow: 'none',
        '&:hover': { borderColor: '#ef4444' }
    }),
    singleValue: (base) => ({ ...base, color: '#ffffff' }),
    input: (base) => ({ ...base, color: '#ffffff' }),
    placeholder: (base) => ({ ...base, color: '#9ca3af' }),
    menu: (base) => ({
        ...base,
        backgroundColor: '#171717',
        border: '1px solid #404040',
        zIndex: 30
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused ? '#404040' : 'transparent',
        color: '#ffffff',
        cursor: 'pointer'
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base) => ({ ...base, color: '#9ca3af' })
}

export default function ServiceOrderForm({ order, initialClients = [], initialProducts = [], initialServices = [], initialItems = [] }) {
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
    const [currentKm, setCurrentKm] = useState(order?.current_km?.toString() || '')
    const [nextRevisionKm, setNextRevisionKm] = useState(order?.next_revision_km?.toString() || '')
    const [paymentMethod, setPaymentMethod] = useState('Dinheiro') // New state
    const [items, setItems] = useState(initialItems)
    // Data da OS — default = hoje. Permite cadastrar OS retroativa pra
    // importar histórico do sistema antigo. Salva em service_orders.created_at
    // e também é usada como data da transação financeira ao finalizar.
    const todayLocalISO = (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    const [serviceDate, setServiceDate] = useState(() => {
        if (!order?.created_at) return todayLocalISO
        // Converte pra data local (não UTC) — evita off-by-one quando o
        // timestamp foi gravado de madrugada UTC e o BRT está num dia diferente.
        const d = new Date(order.created_at)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })

    const [clients, setClients] = useState(initialClients)
    const [clientVehicles, setClientVehicles] = useState([])
    const [products, setProducts] = useState(initialProducts)
    const [services, setServices] = useState(initialServices)

    const [selectedProduct, setSelectedProduct] = useState('')
    const [selectedService, setSelectedService] = useState('')
    const [isClientModalOpen, setIsClientModalOpen] = useState(false)
    const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false)
    // Cadastro rápido inline: o que o operador digitou no select é usado como
    // initialName do modal pra evitar redigitação.
    const [isProductModalOpen, setIsProductModalOpen] = useState(false)
    const [productModalInitialName, setProductModalInitialName] = useState('')
    const [productSearchInput, setProductSearchInput] = useState('')
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false)
    const [serviceModalInitialName, setServiceModalInitialName] = useState('')
    const [serviceSearchInput, setServiceSearchInput] = useState('')
    const [selectedVehicle, setSelectedVehicle] = useState(null)
    const [vehiclesLoading, setVehiclesLoading] = useState(false)
    // Tracks whether this is the initial mount (edit mode) vs a user-driven client change.
    const vehiclesInitialized = useRef(false)

    useEffect(() => {
        if (!clientId) {
            setClientVehicles([])
            setSelectedVehicle(null)
            vehiclesInitialized.current = false
            return
        }

        const isFirstLoad = !vehiclesInitialized.current
        vehiclesInitialized.current = true

        // When the user CHANGES the client (not first mount), clear previous vehicle data
        // so the new client's vehicle auto-fills cleanly.
        if (!isFirstLoad) {
            setPlate('')
            setBrand('')
            setModel('')
            setSelectedVehicle(null)
        }

        setVehiclesLoading(true)
        fetch(`/api/vehicles/by-client?client_id=${clientId}`, { credentials: 'include' })
            .then(r => r.json())
            .then(json => {
                const vehicles = json.vehicles || []
                setClientVehicles(vehicles)

                if (vehicles.length === 1) {
                    // Always auto-fill when only one vehicle exists
                    const v = vehicles[0]
                    setPlate(v.plate)
                    setBrand(v.brand || '')
                    setModel(v.model || '')
                    setSelectedVehicle(v)
                } else if (isFirstLoad && vehicles.length > 1 && order?.vehicle_plate) {
                    // Edit mode with multiple vehicles: highlight the one already on the order
                    const match = vehicles.find(v =>
                        v.plate?.toUpperCase() === order.vehicle_plate.toUpperCase()
                    )
                    if (match) setSelectedVehicle(match)
                }
            })
            .catch(() => { /* silently ignore network errors */ })
            .finally(() => setVehiclesLoading(false))
    }, [clientId])

    // Adds catalog item (product/service) from a selected react-select option.
    const handleAddItem = (type) => {
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

    // Adds a free-text (custom) item typed directly in the CreatableSelect.
    // Custom items are ephemeral: they exist only inside this OS and don't
    // create a row in products/services.
    const handleAddCustomItem = (type, label) => {
        const description = (label || '').trim()
        if (!description) return
        setItems([...items, {
            type,
            description,
            quantity: 1,
            unit_price: 0,
            custom: true
        }])
    }

    // Pós-cadastro do modal: anexa o produto ao catálogo local e já adiciona como item da OS.
    // Usa a mesma forma que handleAddItem('product') — mantém comportamento consistente.
    const handleProductCreated = (product) => {
        setProducts(prev => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)))
        setItems(prev => [...prev, {
            type: 'product',
            product_id: product.id,
            description: product.name,
            quantity: 1,
            cost_price: product.cost_price,
            profit_margin: product.profit_margin_percent || 0,
            unit_price: product.selling_price || 0
        }])
        setIsProductModalOpen(false)
        setProductSearchInput('')
    }

    const handleServiceCreated = (service) => {
        setServices(prev => [...prev, service].sort((a, b) => a.name.localeCompare(b.name)))
        setItems(prev => [...prev, {
            type: 'service',
            service_id: service.id,
            description: service.name,
            quantity: 1,
            unit_price: service.price || 0
        }])
        setIsServiceModalOpen(false)
        setServiceSearchInput('')
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

        try {
            const total = calculateTotal()
            const serviceDateISO = (() => {
                const [y, m, d] = serviceDate.split('-').map(Number)
                return new Date(y, m - 1, d, 12, 0, 0).toISOString()
            })()

            const res = await fetch('/api/service-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    id: order?.id || undefined,
                    client_id: clientId || null,
                    vehicle_plate: plate,
                    vehicle_brand: brand,
                    vehicle_model: model,
                    status,
                    observation,
                    is_estimate: isEstimate,
                    next_revision_date: nextRevisionDate || null,
                    current_km: currentKm ? parseInt(currentKm.replace(/\D/g, ''), 10) : null,
                    next_revision_km: nextRevisionKm ? parseInt(nextRevisionKm.replace(/\D/g, ''), 10) : null,
                    total,
                    service_date_iso: serviceDateISO,
                    items: items.map(item => ({
                        product_id: item.product_id || null,
                        service_id: item.service_id || null,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        type: item.type,
                    }))
                })
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Erro ao salvar OS.')

            onSave()
        } catch (error) {
            console.error('Error saving order:', error)
            alert('Erro ao salvar OS: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleFinish = async () => {
        const serviceDateISO = (() => {
            const [y, m, d] = serviceDate.split('-').map(Number)
            return new Date(y, m - 1, d, 12, 0, 0).toISOString()
        })()
        const isRetroactive = serviceDate !== todayLocalISO
        const dateDisplay = serviceDate.split('-').reverse().join('/')

        const confirmMsg = isRetroactive
            ? `Finalizar OS RETROATIVA com data ${dateDisplay}?\n\nA receita financeira será lançada nessa data (não em hoje).\n\nO estoque NÃO será baixado — os itens dessa OS são considerados histórico (já saíram do depósito no passado).`
            : 'Deseja realmente finalizar a OS? Isso irá baixar o estoque e lançar a receita.'
        if (!window.confirm(confirmMsg)) return
        setLoading(true)

        try {
            const total = calculateTotal()

            const res = await fetch('/api/service-orders/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    order_id: order.id,
                    plate,
                    total,
                    service_date_iso: serviceDateISO,
                    is_retroactive: isRetroactive,
                    payment_method: paymentMethod,
                    items: items.map(item => ({
                        type: item.type,
                        product_id: item.product_id || null,
                        quantity: item.quantity,
                    }))
                })
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Erro ao finalizar OS.')

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
                            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                                <label className="block text-sm font-medium text-gray-300">
                                    Cliente <span className="text-red-500">*</span>
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsClientModalOpen(true)}
                                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded transition"
                                    >
                                        <UserPlus className="w-3.5 h-3.5" /> Novo cliente
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsVehicleModalOpen(true)}
                                        disabled={!clientId}
                                        title={!clientId ? 'Selecione o cliente primeiro' : 'Cadastrar um novo veículo para este cliente'}
                                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <CarFront className="w-3.5 h-3.5" /> Adicionar veículo
                                    </button>
                                </div>
                            </div>
                            <select
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                required
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            >
                                <option value="">Selecione um cliente</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Vehicle loading indicator */}
                        {vehiclesLoading && clientId && (
                            <div className="md:col-span-2 text-xs text-gray-400 animate-pulse py-1">
                                Buscando veículos do cliente...
                            </div>
                        )}

                        {/* No vehicles registered */}
                        {!vehiclesLoading && clientId && clientVehicles.length === 0 && (
                            <div className="md:col-span-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-2 text-xs text-amber-300 flex items-center gap-2">
                                <CarFront className="w-4 h-4 shrink-0" />
                                Nenhum veículo cadastrado para este cliente. Use <strong>"Adicionar veículo"</strong> para registrar.
                            </div>
                        )}

                        {/* Multiple vehicles picker */}
                        {!vehiclesLoading && clientVehicles.length > 1 && (
                            <div className="md:col-span-2 bg-neutral-950 p-3 rounded-lg border border-blue-900/30">
                                <label className="block text-xs font-medium text-blue-400 mb-2">
                                    Cliente tem {clientVehicles.length} veículos — selecione qual será atendido:
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {clientVehicles.map(v => {
                                        const isActive = selectedVehicle?.id === v.id
                                        return (
                                            <button
                                                key={v.id}
                                                type="button"
                                                onClick={() => {
                                                    setPlate(v.plate)
                                                    setBrand(v.brand || '')
                                                    setModel(v.model || '')
                                                    setSelectedVehicle(v)
                                                }}
                                                className={`px-3 py-2 rounded-lg text-sm border transition font-medium ${
                                                    isActive
                                                        ? 'bg-blue-600 border-blue-500 text-white'
                                                        : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-gray-200'
                                                }`}
                                            >
                                                <span className="font-mono font-bold">{v.plate}</span>
                                                {(v.brand || v.model) && (
                                                    <span className="ml-2 text-xs opacity-75">{[v.brand, v.model].filter(Boolean).join(' ')}</span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {selectedVehicle && (
                            <div className="md:col-span-2 bg-blue-500/5 border border-blue-500/30 rounded-lg p-4 relative">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedVehicle(null)
                                        setPlate('')
                                        setBrand('')
                                        setModel('')
                                    }}
                                    title="Limpar veículo selecionado"
                                    className="absolute top-2 right-2 text-gray-500 hover:text-red-400 transition"
                                >
                                    <XIcon className="w-4 h-4" />
                                </button>
                                <div className="flex items-center gap-2 mb-3">
                                    <Car className="w-4 h-4 text-blue-400" />
                                    <h3 className="text-sm font-bold text-blue-300">Informações do veículo</h3>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    <div>
                                        <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Placa</p>
                                        <p className="text-white font-bold font-mono">{selectedVehicle.plate || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Marca / Modelo</p>
                                        <p className="text-white font-bold">{[selectedVehicle.brand, selectedVehicle.model].filter(Boolean).join(' ') || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Versão</p>
                                        <p className="text-gray-200">{selectedVehicle.submodel || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Ano</p>
                                        <p className="text-gray-200">{selectedVehicle.year || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Cor</p>
                                        <p className="text-gray-200">{selectedVehicle.color || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Combustível</p>
                                        <p className="text-gray-200">{selectedVehicle.fuel_type || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Cilindrada</p>
                                        <p className="text-gray-200">{selectedVehicle.engine_displacement || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Câmbio</p>
                                        <p className="text-gray-200">{selectedVehicle.transmission || '—'}</p>
                                    </div>
                                    {selectedVehicle.chassi && (
                                        <div className="col-span-2 md:col-span-4 border-t border-blue-900/30 pt-2 mt-1">
                                            <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Chassi</p>
                                            <p className="text-gray-300 font-mono text-xs">{selectedVehicle.chassi}</p>
                                        </div>
                                    )}
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
                            <label className="block text-sm font-medium text-gray-300 mb-1">KM atual</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={currentKm}
                                onChange={(e) => setCurrentKm(e.target.value.replace(/\D/g, ''))}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                placeholder="Ex: 45000"
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
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                Data da OS
                            </label>
                            <input
                                type="date"
                                value={serviceDate}
                                max={todayLocalISO}
                                onChange={(e) => setServiceDate(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full md:w-72 p-2.5"
                            />
                            {serviceDate !== todayLocalISO && (
                                <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                                    OS retroativa — será gravada com a data <strong>{serviceDate.split('-').reverse().join('/')}</strong>. Ao finalizar, a transação financeira também usa essa data.
                                </p>
                            )}
                            <p className="text-[11px] text-gray-500 mt-1">
                                Use uma data passada para importar histórico do sistema antigo. Default = hoje.
                            </p>
                        </div>
                    </div>

                    {status === 'Concluido' && (
                        <div className="bg-neutral-950 p-4 border border-blue-900/40 rounded-lg shadow-sm">
                            <h3 className="text-sm font-bold text-blue-400 mb-3">Pós-Venda / CRM</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Data da Próxima Revisão</label>
                                    <input
                                        type="date"
                                        value={nextRevisionDate}
                                        onChange={(e) => setNextRevisionDate(e.target.value)}
                                        className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Usada para o alerta no CRM via WhatsApp.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">KM da Próxima Revisão</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={nextRevisionKm}
                                        onChange={(e) => setNextRevisionKm(e.target.value.replace(/\D/g, ''))}
                                        className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                        placeholder={currentKm ? `Ex: ${parseInt(currentKm) + 10000}` : 'Ex: 55000'}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Ex: KM atual + 10.000 km — o que ocorrer primeiro com a data.</p>
                                </div>
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
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <h3 className="text-lg font-medium text-gray-200">Itens da OS</h3>
                            <p className="text-[11px] text-gray-500">
                                Não achou? Use <strong className="text-gray-300">+ Novo</strong> para cadastrar no catálogo, ou tecle Enter para adicionar como item avulso.
                            </p>
                        </div>

                        <div className="flex gap-2 mb-4">
                            <div className="flex-1">
                                <CreatableSelect
                                    instanceId="os-product-select"
                                    isClearable
                                    placeholder="Buscar ou digitar produto..."
                                    noOptionsMessage={() => 'Nenhum produto. Digite para criar um item avulso.'}
                                    formatCreateLabel={(input) => `Adicionar item avulso: "${input}"`}
                                    value={selectedProduct
                                        ? (() => {
                                            const p = products.find(pp => pp.id === parseInt(selectedProduct))
                                            return p ? { value: p.id, label: `${p.name} - R$ ${p.selling_price}` } : null
                                        })()
                                        : null
                                    }
                                    options={products.map(p => ({
                                        value: p.id,
                                        label: `${p.name} - R$ ${p.selling_price}`
                                    }))}
                                    onChange={(opt) => setSelectedProduct(opt ? String(opt.value) : '')}
                                    onInputChange={(input, action) => {
                                        if (action.action === 'input-change') setProductSearchInput(input)
                                    }}
                                    onCreateOption={(input) => {
                                        handleAddCustomItem('product', input)
                                        setSelectedProduct('')
                                    }}
                                    styles={selectStyles}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => handleAddItem('product')}
                                className="bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-2 rounded-lg"
                            >
                                + Prod
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setProductModalInitialName(productSearchInput)
                                    setIsProductModalOpen(true)
                                }}
                                className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
                                title="Cadastrar novo produto no catálogo e adicionar à OS"
                            >
                                <Plus className="w-4 h-4" /> Novo
                            </button>
                        </div>

                        <div className="flex gap-2 mb-4">
                            <div className="flex-1">
                                <CreatableSelect
                                    instanceId="os-service-select"
                                    isClearable
                                    placeholder="Buscar ou digitar serviço..."
                                    noOptionsMessage={() => 'Nenhum serviço. Digite para criar um item avulso.'}
                                    formatCreateLabel={(input) => `Adicionar serviço avulso: "${input}"`}
                                    value={selectedService
                                        ? (() => {
                                            const s = services.find(ss => ss.id === parseInt(selectedService))
                                            return s ? { value: s.id, label: `${s.name} - R$ ${s.price}` } : null
                                        })()
                                        : null
                                    }
                                    options={services.map(s => ({
                                        value: s.id,
                                        label: `${s.name} - R$ ${s.price}`
                                    }))}
                                    onChange={(opt) => setSelectedService(opt ? String(opt.value) : '')}
                                    onInputChange={(input, action) => {
                                        if (action.action === 'input-change') setServiceSearchInput(input)
                                    }}
                                    onCreateOption={(input) => {
                                        handleAddCustomItem('service', input)
                                        setSelectedService('')
                                    }}
                                    styles={selectStyles}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => handleAddItem('service')}
                                className="bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-2 rounded-lg"
                            >
                                + Serv
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setServiceModalInitialName(serviceSearchInput)
                                    setIsServiceModalOpen(true)
                                }}
                                className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
                                title="Cadastrar novo serviço no catálogo e adicionar à OS"
                            >
                                <Plus className="w-4 h-4" /> Novo
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
                            <div className="flex gap-2 items-center mr-auto">
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block p-2.5 h-full"
                                >
                                    <option value="Dinheiro">Dinheiro</option>
                                    <option value="PIX">PIX</option>
                                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                                    <option value="Cartão de Débito">Cartão de Débito</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={handleFinish}
                                    disabled={loading}
                                    className="px-5 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-lg shadow-green-900/20 transition-colors whitespace-nowrap"
                                >
                                    Finalizar OS (Receber)
                                </button>
                            </div>
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
                vehicle={selectedVehicle}
                paymentMethod={paymentMethod}
            />

            <QuickClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onCreated={(newClient) => {
                    // Adiciona no select e já seleciona ele — sem perder o que estava digitado na OS.
                    setClients(prev => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)))
                    setClientId(String(newClient.id))
                    setIsClientModalOpen(false)
                }}
            />

            <QuickProductModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                onCreated={handleProductCreated}
                initialName={productModalInitialName}
            />

            <QuickServiceModal
                isOpen={isServiceModalOpen}
                onClose={() => setIsServiceModalOpen(false)}
                onCreated={handleServiceCreated}
                initialName={serviceModalInitialName}
            />

            <QuickVehicleModal
                isOpen={isVehicleModalOpen}
                onClose={() => setIsVehicleModalOpen(false)}
                clientId={clientId}
                clientName={clients.find(c => String(c.id) === String(clientId))?.name}
                onCreated={(newVehicle) => {
                    // Adiciona à lista de veículos do cliente e já seleciona como ativo na OS.
                    // Sobrescreve plate/brand/model mesmo que estivessem preenchidos —
                    // o operador clicou no botão pra usar este veículo novo.
                    setClientVehicles(prev => [...prev, newVehicle])
                    setSelectedVehicle(newVehicle)
                    setPlate(newVehicle.plate || '')
                    setBrand(newVehicle.brand || '')
                    setModel(newVehicle.model || '')
                    setIsVehicleModalOpen(false)
                }}
            />
        </>

    )
}

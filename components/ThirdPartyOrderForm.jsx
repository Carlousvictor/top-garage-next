"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import ServiceOrderPrint from './ServiceOrderPrint'

export default function ThirdPartyOrderForm({ order, initialItems = [] }) {
    const router = useRouter()
    const { tenantId } = useAuth()

    const onCancel = () => router.push('/thirds')
    const onSave = () => {
        router.refresh()
        router.push('/thirds')
    }

    const [loading, setLoading] = useState(false)
    const [plate, setPlate] = useState(order?.vehicle_plate || '')
    const [brand, setBrand] = useState(order?.vehicle_brand || '')
    const [model, setModel] = useState(order?.vehicle_model || '')
    const [observation, setObservation] = useState(order?.observation || '')
    const [items, setItems] = useState(initialItems)

    // Manual Entry States
    const [manualDesc, setManualDesc] = useState('')
    const [manualPrice, setManualPrice] = useState('')
    const [manualQtd, setManualQtd] = useState(1)

    const handleAddManualItem = () => {
        if (!manualDesc || !manualPrice) return

        setItems([...items, {
            type: 'manual',
            description: manualDesc,
            quantity: parseFloat(manualQtd) || 1,
            unit_price: parseFloat(manualPrice) || 0
        }])
        setManualDesc('')
        setManualPrice('')
        setManualQtd(1)
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

            const res = await fetch('/api/service-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    id: order?.id || undefined,
                    status: 'Em Terceiros',
                    is_third_party: true,
                    vehicle_plate: plate,
                    vehicle_brand: brand,
                    vehicle_model: model,
                    observation,
                    total,
                    service_date_iso: new Date().toISOString(),
                    items: items.map(item => ({
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        type: 'manual',
                    }))
                })
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Erro ao salvar OS.')

            onSave()
        } catch (error) {
            alert('Erro ao salvar OS: ' + error.message)
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

                <div className="mb-6">
                    <h2 className="text-xl font-bold text-blue-400">
                        {order ? `Editar OS Terceiros #${order.id}` : 'Nova OS de Terceiros'}
                    </h2>
                    <p className="text-gray-400 text-sm">Esta ordem é isolada do estoque principal.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Vehicle & Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Referência / Cliente / Objeto</label>
                            <input
                                type="text"
                                required
                                value={observation}
                                onChange={(e) => setObservation(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                placeholder="Referência Externa"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Placa (Opcional)</label>
                            <input
                                type="text"
                                value={plate}
                                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                placeholder="ABC-1234"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Veículo (Opcional)</label>
                            <input
                                type="text"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                    </div>

                    <hr className="border-neutral-800" />

                    {/* Manual Items Selection */}
                    <div>
                        <h3 className="text-lg font-medium text-gray-200 mb-3">Lançamento de Peças e Serviços</h3>

                        <div className="flex flex-col md:flex-row gap-2 mb-4 p-4 bg-black border border-neutral-800 rounded-lg items-end">
                            <div className="flex-1 w-full">
                                <label className="text-xs text-gray-400">Descrição (Texto Livre)</label>
                                <input
                                    type="text"
                                    value={manualDesc}
                                    onChange={e => setManualDesc(e.target.value)}
                                    placeholder="Ex: Serviço de Torno, Peça Externa..."
                                    className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5 mt-1"
                                />
                            </div>
                            <div className="w-24">
                                <label className="text-xs text-gray-400">Qtd</label>
                                <input
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    value={manualQtd}
                                    onChange={e => setManualQtd(e.target.value)}
                                    className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5 mt-1"
                                />
                            </div>
                            <div className="w-32">
                                <label className="text-xs text-gray-400">Valor Un (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={manualPrice}
                                    onChange={e => setManualPrice(e.target.value)}
                                    className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5 mt-1"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleAddManualItem}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-bold"
                            >
                                Adicionar
                            </button>
                        </div>

                        {/* Items List Table */}
                        <div className="bg-black rounded-lg border border-neutral-800 overflow-hidden">
                            <table className="w-full text-sm text-left text-gray-400">
                                <thead className="text-xs text-gray-200 uppercase bg-neutral-900">
                                    <tr>
                                        <th className="px-4 py-2">Descrição Lançada</th>
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
                                                <input
                                                    type="number"
                                                    value={item.unit_price}
                                                    onChange={(e) => {
                                                        const newItems = [...items]
                                                        newItems[idx].unit_price = parseFloat(e.target.value) || 0
                                                        setItems(newItems)
                                                    }}
                                                    className="w-24 bg-neutral-800 border border-neutral-700 rounded p-1 text-white"
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
                                                Nenhum item lançado
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot className="bg-neutral-900 font-bold text-white">
                                    <tr>
                                        <td colSpan="3" className="px-4 py-3 text-right">Total Final:</td>
                                        <td colSpan="2" className="px-4 py-3 text-lg text-blue-400">R$ {calculateTotal().toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
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
                            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-900/20 transition-colors"
                        >
                            {loading ? 'Salvando...' : 'Salvar OS Terceiros'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Print Component */}
            <ServiceOrderPrint
                order={order}
                items={items}
                client={{ name: observation || 'Terceiro/Avulso' }}
            />
        </>
    )
}

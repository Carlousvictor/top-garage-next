"use client"
import { useState, useEffect } from 'react'

export default function CRMList({ recentOrders }) {
    const [alerts, setAlerts] = useState([])
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        // Logic to generate alerts
        const today = new Date()
        const newAlerts = []

        recentOrders?.forEach(order => {
            if (!order.clients) return // Need a client to alert

            const orderDate = new Date(order.created_at)
            const items = order.service_order_items || []

            let hasOil = false
            let hasTimingBelt = false

            items.forEach(item => {
                const desc = item.description.toLowerCase()
                if (desc.includes('óleo') || desc.includes('oleo')) hasOil = true
                if (desc.includes('correia')) hasTimingBelt = true
            })

            // Default Revision Alert (6 Months)
            const sixMonthsFromOrder = new Date(orderDate)
            sixMonthsFromOrder.setMonth(sixMonthsFromOrder.getMonth() + 6)

            // If they did an oil change, next is usually 6 months.
            if (hasOil) {
                newAlerts.push({
                    client_name: order.clients.name,
                    phone: order.clients.phone,
                    vehicle: `${order.vehicle_brand} ${order.vehicle_model} (${order.vehicle_plate})`,
                    last_service_date: orderDate,
                    next_service_date: sixMonthsFromOrder,
                    type: 'Troca de Óleo / Revisão Geral',
                    days_remaining: Math.ceil((sixMonthsFromOrder - today) / (1000 * 60 * 60 * 24))
                })
            } else {
                newAlerts.push({
                    client_name: order.clients.name,
                    phone: order.clients.phone,
                    vehicle: `${order.vehicle_brand} ${order.vehicle_model} (${order.vehicle_plate})`,
                    last_service_date: orderDate,
                    next_service_date: sixMonthsFromOrder,
                    type: 'Revisão Semestral',
                    days_remaining: Math.ceil((sixMonthsFromOrder - today) / (1000 * 60 * 60 * 24))
                })
            }
        })

        // Sort by closest to today
        newAlerts.sort((a, b) => a.days_remaining - b.days_remaining)
        setAlerts(newAlerts)

    }, [recentOrders])

    const filteredAlerts = alerts.filter(a =>
        a.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.vehicle.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const getStatusBadge = (days) => {
        if (days < 0) return <span className="bg-red-900 text-red-300 font-bold px-2 py-1 rounded text-xs">Vencido ({Math.abs(days)} dias)</span>
        if (days <= 15) return <span className="bg-orange-900 text-orange-300 font-bold px-2 py-1 rounded text-xs">Atenção ({days} dias)</span>
        return <span className="bg-green-900 text-green-300 font-bold px-2 py-1 rounded text-xs">No Prazo ({days} dias)</span>
    }

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">CRM e Pós-Venda</h2>
                    <p className="text-sm text-gray-400">Próximos serviços e alertas de manutenção baseados no histórico.</p>
                </div>
                <div className="w-full md:w-1/3">
                    <input
                        type="text"
                        placeholder="Buscar por cliente ou veículo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-200 uppercase bg-black">
                        <tr>
                            <th className="px-6 py-3 rounded-tl-lg">Cliente</th>
                            <th className="px-6 py-3">Contato</th>
                            <th className="px-6 py-3">Veículo</th>
                            <th className="px-6 py-3">Último Serviço</th>
                            <th className="px-6 py-3">Motivo / Retorno</th>
                            <th className="px-6 py-3 rounded-tr-lg text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAlerts.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="text-center py-6">Nenhum alerta de manutenção encontrado.</td>
                            </tr>
                        ) : (
                            filteredAlerts.map((alert, idx) => (
                                <tr key={idx} className="border-b border-neutral-800 hover:bg-neutral-800 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">{alert.client_name}</td>
                                    <td className="px-6 py-4">{alert.phone || 'Sem número'}</td>
                                    <td className="px-6 py-4">{alert.vehicle}</td>
                                    <td className="px-6 py-4">{alert.last_service_date.toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <span className="text-white bg-neutral-700 px-2 py-1 rounded-md text-xs">{alert.type}</span>
                                        <div className="text-xs mt-1 text-gray-500">
                                            Previsto: {alert.next_service_date.toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {getStatusBadge(alert.days_remaining)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

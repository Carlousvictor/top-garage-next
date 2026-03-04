"use client"
import { useState, useEffect, useMemo } from 'react'
import Select from 'react-select'

export default function CRMList({ recentOrders, error }) {
    const [alerts, setAlerts] = useState([])

    // Filtros avançados
    const [selectedClients, setSelectedClients] = useState([])
    const [selectedVehicles, setSelectedVehicles] = useState([])
    const [selectedStatuses, setSelectedStatuses] = useState([])
    const [selectedDateStart, setSelectedDateStart] = useState('')
    const [selectedDateEnd, setSelectedDateEnd] = useState('')

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
            let hasBrakePad = false

            items.forEach(item => {
                const desc = item.description.toLowerCase()
                if (desc.includes('óleo') || desc.includes('oleo')) hasOil = true
                if (desc.includes('correia')) hasTimingBelt = true
                if (desc.includes('pastilha') || desc.includes('freio')) hasBrakePad = true
            })

            // Default Revision Alert (6 Months)
            const defaultReviewDate = new Date(orderDate)
            defaultReviewDate.setMonth(defaultReviewDate.getMonth() + 6)

            // Specifically for Brake Pads (could be 6 to 12 months depending on use, setting to 6 months for checkup)
            const brakeReviewDate = new Date(orderDate)
            brakeReviewDate.setMonth(brakeReviewDate.getMonth() + 6) // Revisão de freios geralmente a cada 6 meses ou 10k km

            let targetReviewDate = defaultReviewDate;
            let targetType = 'Revisão Semestral';

            if (order.next_revision_date) {
                targetReviewDate = new Date(`${order.next_revision_date}T12:00:00`); // Evita problemas de fuso horário
                targetType = 'Revisão Agendada Manualmente';
            } else if (hasOil) {
                targetReviewDate = defaultReviewDate;
                targetType = 'Troca de Óleo / Revisão Geral';
            } else if (hasBrakePad) {
                targetReviewDate = brakeReviewDate;
                targetType = 'Revisão Sistema de Freios / Pastilhas';
            }

            newAlerts.push({
                client_name: order.clients.name,
                phone: order.clients.phone,
                vehicle: `${order.vehicle_brand} ${order.vehicle_model} (${order.vehicle_plate})`,
                last_service_date: orderDate,
                next_service_date: targetReviewDate,
                type: targetType,
                days_remaining: Math.ceil((targetReviewDate - today) / (1000 * 60 * 60 * 24))
            })
        })

        // Sort by closest to today
        newAlerts.sort((a, b) => a.days_remaining - b.days_remaining)
        setAlerts(newAlerts)

    }, [recentOrders])

    // Extração das opções únicas para os selects (usando useMemo para performance)
    const clientOptions = useMemo(() => {
        const uniqueClients = [...new Set(alerts.map(a => a.client_name))].filter(Boolean)
        return uniqueClients.map(c => ({ value: c, label: c }))
    }, [alerts])

    const vehicleOptions = useMemo(() => {
        const uniqueVehicles = [...new Set(alerts.map(a => a.vehicle.split(' (')[0]))].filter(v => v !== 'null null')
        return uniqueVehicles.map(v => ({ value: v, label: v }))
    }, [alerts])

    const statusOptions = [
        { value: 'vencido', label: 'Vencido' },
        { value: 'atencao', label: 'Atenção' },
        { value: 'noprazo', label: 'No Prazo' }
    ]

    // Estilo customizado (Dark Theme) para o react-select
    const customStyles = {
        control: (base, state) => ({
            ...base,
            backgroundColor: '#000000',
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
            backgroundColor: '#262626',
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

    // Lógica de Filtragem Cruzada
    const filteredAlerts = alerts.filter(a => {
        // Filtro Cliente
        const matchClient = selectedClients.length === 0 || selectedClients.some(c => c.value === a.client_name)

        // Filtro Veículo (Placa / Modelo)
        const matchVehicle = selectedVehicles.length === 0 || selectedVehicles.some(v => a.vehicle.includes(v.value))

        // Filtro Status
        let matchStatus = true;
        if (selectedStatuses.length > 0) {
            matchStatus = selectedStatuses.some(status => {
                if (status.value === 'vencido') return a.days_remaining < 0;
                if (status.value === 'atencao') return a.days_remaining >= 0 && a.days_remaining <= 15;
                if (status.value === 'noprazo') return a.days_remaining > 15;
                return false;
            })
        }

        // Filtro Data (De / Até)
        let matchDate = true;

        if (selectedDateStart || selectedDateEnd) {
            // alert date is at 12:00:00 to avoid timezone issues when checking local date
            const alertDate = new Date(a.next_service_date);
            alertDate.setHours(12, 0, 0, 0);

            if (selectedDateStart) {
                const startObj = new Date(selectedDateStart + 'T00:00:00');
                if (alertDate < startObj) matchDate = false;
            }
            if (selectedDateEnd) {
                const endObj = new Date(selectedDateEnd + 'T23:59:59');
                if (alertDate > endObj) matchDate = false;
            }
        }

        return matchClient && matchVehicle && matchStatus && matchDate
    })

    const getStatusBadge = (days) => {
        if (days < 0) return <span className="bg-red-900 text-red-300 font-bold px-2 py-1 rounded text-xs">Vencido ({Math.abs(days)} dias)</span>
        if (days <= 15) return <span className="bg-orange-900 text-orange-300 font-bold px-2 py-1 rounded text-xs">Atenção ({days} dias)</span>
        return <span className="bg-green-900 text-green-300 font-bold px-2 py-1 rounded text-xs">No Prazo ({days} dias)</span>
    }

    const getWhatsAppLink = (alert) => {
        const phoneOriginal = alert.phone || '';
        const phoneNumbersOnly = phoneOriginal.replace(/[^0-9]/g, '');
        if (!phoneNumbersOnly) return null;
        const phoneClean = '55' + phoneNumbersOnly;

        const clientName = alert.client_name || 'Cliente';
        const vehicleModel = alert.vehicle || 'veículo';

        const messageText = `Olá ${clientName}, tudo bem? Aqui é da Top Garage RJ. Notamos que a revisão preventiva do seu ${vehicleModel} está próxima. Vamos agendar um horário para deixar a máquina em dia?`;

        return `https://wa.me/${phoneClean}?text=${encodeURIComponent(messageText)}`;
    }

    const clearAllFilters = () => {
        setSelectedClients([])
        setSelectedVehicles([])
        setSelectedStatuses([])
        setSelectedDateStart('')
        setSelectedDateEnd('')
    }

    const hasActiveFilters = selectedClients.length > 0 || selectedVehicles.length > 0 || selectedStatuses.length > 0 || selectedDateStart || selectedDateEnd;

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">CRM e Pós-Venda</h2>
                    <p className="text-sm text-gray-400">Próximos serviços e alertas de manutenção baseados no histórico.</p>
                </div>
                {hasActiveFilters && (
                    <button
                        onClick={clearAllFilters}
                        className="bg-red-900 hover:bg-red-800 text-red-100 px-4 py-2 rounded font-semibold text-sm transition-colors border border-red-800 flex items-center gap-2"
                    >
                        Limpar Filtros
                    </button>
                )}
            </div>

            {/* Advanced Filters */}
            <div className="w-full grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-black rounded-lg border border-neutral-800">
                <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Cliente</label>
                    <Select
                        isMulti
                        options={clientOptions}
                        value={selectedClients}
                        onChange={setSelectedClients}
                        placeholder="Todos..."
                        styles={customStyles}
                        noOptionsMessage={() => "Nenhuma opção"}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Veículo/Placa</label>
                    <Select
                        isMulti
                        options={vehicleOptions}
                        value={selectedVehicles}
                        onChange={setSelectedVehicles}
                        placeholder="Todos..."
                        styles={customStyles}
                        noOptionsMessage={() => "Nenhuma opção"}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Status</label>
                    <Select
                        isMulti
                        options={statusOptions}
                        value={selectedStatuses}
                        onChange={setSelectedStatuses}
                        placeholder="Todos..."
                        styles={customStyles}
                        noOptionsMessage={() => "Nenhuma opção"}
                    />
                </div>
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Data Próx. Revisão (De / Até)</label>
                        {(selectedDateStart || selectedDateEnd) && (
                            <button
                                onClick={() => { setSelectedDateStart(''); setSelectedDateEnd(''); }}
                                className="text-[10px] text-red-500 hover:text-red-400 underline"
                            >
                                Limpar
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="date"
                            value={selectedDateStart}
                            onChange={(e) => setSelectedDateStart(e.target.value)}
                            className="bg-black border border-neutral-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-white text-sm rounded-lg block w-full p-2 h-[42px] transition-colors"
                        />
                        <input
                            type="date"
                            value={selectedDateEnd}
                            onChange={(e) => setSelectedDateEnd(e.target.value)}
                            className="bg-black border border-neutral-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-white text-sm rounded-lg block w-full p-2 h-[42px] transition-colors"
                        />
                    </div>
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
                            <th className="px-6 py-3 text-center">Status</th>
                            <th className="px-6 py-3 rounded-tr-lg text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAlerts.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="text-center py-6">Nenhum alerta de manutenção encontrado.</td>
                            </tr>
                        ) : (
                            filteredAlerts.map((alert, idx) => {
                                const whatsappLink = getWhatsAppLink(alert);
                                return (
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
                                        <td className="px-6 py-4 text-center">
                                            {whatsappLink ? (
                                                <a
                                                    href={whatsappLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="bg-[#25D366] hover:bg-[#1DA851] text-white font-bold px-3 py-2 rounded-lg text-xs inline-block shadow-sm transition-colors"
                                                >
                                                    Notificar WhatsApp
                                                </a>
                                            ) : (
                                                <span className="text-xs text-gray-500">Sem telefone</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div >
    )
}

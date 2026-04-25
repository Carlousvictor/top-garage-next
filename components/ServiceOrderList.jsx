"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

export default function ServiceOrderList({ initialOrders }) {
    const supabase = createClient()
    const router = useRouter()
    const [orders, setOrders] = useState(initialOrders || [])
    const [filterStatus, setFilterStatus] = useState('Todos')
    // Busca livre: casa em placa, nome do cliente, número da OS ou modelo do veículo.
    // Útil pra puxar histórico de manutenção de um veículo/cliente específico.
    const [searchText, setSearchText] = useState('')

    const normalize = (v) => String(v ?? '').toLowerCase().trim()

    const filteredOrders = (() => {
        let list = orders
        if (filterStatus !== 'Todos') {
            list = list.filter(o => o.status === filterStatus)
        }
        const q = normalize(searchText)
        if (q) {
            list = list.filter(o =>
                normalize(o.vehicle_plate).includes(q) ||
                normalize(o.clients?.name).includes(q) ||
                normalize(o.id).includes(q) ||
                normalize(o.vehicle_model).includes(q)
            )
        }
        return list
    })()

    const getStatusColor = (status) => {
        switch (status) {
            case 'Aberto': return 'bg-yellow-900 text-yellow-300 border-yellow-700'
            case 'Em Andamento': return 'bg-blue-900 text-blue-300 border-blue-700'
            case 'Concluido': return 'bg-green-900 text-green-300 border-green-700'
            case 'Cancelado': return 'bg-red-900 text-red-300 border-red-700'
            default: return 'bg-neutral-800 text-gray-300 border-neutral-600'
        }
    }

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Ordens de Serviço</h2>
                <Link
                    href="/os/new"
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    Nova OS
                </Link>
            </div>

            <div className="mb-4 relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Buscar por placa, cliente, nº da OS ou modelo..."
                    className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg pl-9 pr-9 py-2.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                />
                {searchText && (
                    <button
                        type="button"
                        onClick={() => setSearchText('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition"
                        title="Limpar busca"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="mb-6 flex gap-2 overflow-x-auto pb-2 items-center">
                {['Todos', 'Aberto', 'Em Andamento', 'Concluido', 'Cancelado'].map(status => (
                    <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${filterStatus === status
                            ? 'bg-red-600 text-white border-red-500'
                            : 'bg-neutral-800 text-gray-400 border-neutral-700 hover:border-gray-500'
                            }`}
                    >
                        {status}
                    </button>
                ))}
                {(searchText || filterStatus !== 'Todos') && (
                    <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">
                        {filteredOrders.length} de {orders.length}
                    </span>
                )}
            </div>

            {orders.length === 0 ? (
                <div className="text-center py-10 text-gray-500 border border-dashed border-neutral-800 rounded-lg">
                    Nenhuma ordem de serviço encontrada.
                </div>
            ) : filteredOrders.length === 0 ? (
                <div className="text-center py-10 text-gray-500 border border-dashed border-neutral-800 rounded-lg">
                    Nenhuma OS para os filtros aplicados.
                    <button
                        type="button"
                        onClick={() => { setSearchText(''); setFilterStatus('Todos') }}
                        className="block mx-auto mt-2 text-xs text-red-400 hover:text-red-300 underline"
                    >
                        Limpar filtros
                    </button>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-200 uppercase bg-black">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">Nº</th>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3">Veículo</th>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Total</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map((order) => (
                                <tr key={order.id} className="border-b border-neutral-800 hover:bg-neutral-800 transition-colors">
                                    <td className="px-4 py-3 font-medium text-white">#{order.id}</td>
                                    <td className="px-4 py-3">{order.clients?.name || 'Consumidor'}</td>
                                    <td className="px-4 py-3">
                                        <div className="text-white">{order.vehicle_plate}</div>
                                        <div className="text-xs text-gray-500">{order.vehicle_model}</div>
                                    </td>
                                    <td className="px-4 py-3">{new Date(order.created_at).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 font-medium text-white">
                                        R$ {order.total ? order.total.toFixed(2) : '0.00'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-md text-xs border ${getStatusColor(order.status)}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={`/os/${order.id}`}
                                            className="text-blue-400 hover:text-blue-300 font-medium"
                                        >
                                            Ver/Editar
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useConfirm } from '../context/ConfirmContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import Pagination, { usePagination } from './Pagination'

export default function ServiceOrderList({ initialOrders }) {
    const supabase = createClient()
    const router = useRouter()
    const confirm = useConfirm()
    const [orders, setOrders] = useState(initialOrders || [])
    const [filterStatus, setFilterStatus] = useState('Todos')
    // Busca livre: casa em placa, nome do cliente, número da OS ou modelo do veículo.
    // Útil pra puxar histórico de manutenção de um veículo/cliente específico.
    const [searchText, setSearchText] = useState('')
    // Filtro de data por created_at (campo "Data da OS"). Range opcional —
    // qualquer um dos lados em branco vira limite aberto.
    const [dateStart, setDateStart] = useState('')
    const [dateEnd, setDateEnd] = useState('')

    const normalize = (v) => String(v ?? '').toLowerCase().trim()

    const filteredOrders = (() => {
        let list = orders
        if (filterStatus === 'Orçamento') {
            // Aba Orçamento: só os marcados como is_estimate.
            list = list.filter(o => o.is_estimate === true)
        } else {
            // Demais abas (incluindo "Todos"): só OS reais (esconde orçamentos).
            list = list.filter(o => o.is_estimate !== true)
            if (filterStatus !== 'Todos') {
                list = list.filter(o => o.status === filterStatus)
            }
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
        // Filtro de data — compara created_at contra os limites do range.
        // Constrói os limites com horários 00:00 / 23:59 pra incluir o dia inteiro
        // nos extremos. Sem isso, uma OS de 14h no dia "Até" ficaria de fora.
        if (dateStart || dateEnd) {
            const startMs = dateStart ? new Date(dateStart + 'T00:00:00').getTime() : -Infinity
            const endMs = dateEnd ? new Date(dateEnd + 'T23:59:59.999').getTime() : Infinity
            list = list.filter(o => {
                if (!o.created_at) return false
                const t = new Date(o.created_at).getTime()
                return t >= startMs && t <= endMs
            })
        }
        return list
    })()

    // Paginação client-side aplicada sobre os filtros de status + busca.
    const pagination = usePagination(filteredOrders, 25)

    const getStatusColor = (status) => {
        switch (status) {
            case 'Aberto': return 'bg-yellow-900 text-yellow-300 border-yellow-700'
            case 'Em Andamento': return 'bg-blue-900 text-blue-300 border-blue-700'
            case 'Concluido': return 'bg-green-900 text-green-300 border-green-700'
            case 'Cancelado': return 'bg-red-900 text-red-300 border-red-700'
            case 'Orçamento': return 'bg-purple-900 text-purple-300 border-purple-700'
            default: return 'bg-neutral-800 text-gray-300 border-neutral-600'
        }
    }

    const handleDelete = async (id) => {
        const ok = await confirm({ title: `Excluir OS #${id}`, message: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true })
        if (!ok) return
        await supabase.from('service_order_items').delete().eq('service_order_id', id)
        await supabase.from('service_orders').delete().eq('id', id)
        setOrders(prev => prev.filter(o => o.id !== id))
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

            <div className="mb-4 flex gap-2 overflow-x-auto pb-2 items-center">
                {['Todos', 'Aberto', 'Em Andamento', 'Concluido', 'Cancelado', 'Orçamento'].map(status => (
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
                {(searchText || filterStatus !== 'Todos' || dateStart || dateEnd) && (
                    <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">
                        {filteredOrders.length} de {orders.length}
                    </span>
                )}
            </div>

            {/* Range de data (De / Até) sobre created_at — compatível com OS retroativas. */}
            <div className="mb-6 flex flex-wrap gap-3 items-end bg-black border border-neutral-800 rounded-lg p-3">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Data da OS — De</label>
                    <input
                        type="date"
                        value={dateStart}
                        max={dateEnd || undefined}
                        onChange={(e) => setDateStart(e.target.value)}
                        className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg p-2 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Até</label>
                    <input
                        type="date"
                        value={dateEnd}
                        min={dateStart || undefined}
                        onChange={(e) => setDateEnd(e.target.value)}
                        className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg p-2 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    />
                </div>
                {(dateStart || dateEnd) && (
                    <button
                        type="button"
                        onClick={() => { setDateStart(''); setDateEnd('') }}
                        className="text-xs text-red-400 hover:text-red-300 underline px-2 py-2 whitespace-nowrap"
                    >
                        Limpar data
                    </button>
                )}
                <p className="text-[11px] text-gray-500 ml-auto whitespace-nowrap self-center">
                    Filtra pela data da OS (created_at). Aceita só "De" ou só "Até".
                </p>
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
                        onClick={() => { setSearchText(''); setFilterStatus('Todos'); setDateStart(''); setDateEnd('') }}
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
                            {pagination.paginatedItems.map((order) => (
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
                                        {order.is_estimate ? (
                                            <span className={`px-2 py-1 rounded-md text-xs border ${getStatusColor('Orçamento')}`}>
                                                Orçamento
                                            </span>
                                        ) : (
                                            <span className={`px-2 py-1 rounded-md text-xs border ${getStatusColor(order.status)}`}>
                                                {order.status}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right flex items-center justify-end gap-3">
                                        <Link
                                            href={`/os/${order.id}`}
                                            className="text-blue-400 hover:text-blue-300 font-medium"
                                        >
                                            Ver/Editar
                                        </Link>
                                        <button
                                            onClick={() => handleDelete(order.id)}
                                            className="text-red-500 hover:text-red-400 font-medium"
                                        >
                                            Excluir
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Pagination
                        page={pagination.page}
                        totalPages={pagination.totalPages}
                        pageSize={pagination.pageSize}
                        total={pagination.total}
                        onPageChange={pagination.setPage}
                        onPageSizeChange={pagination.setPageSize}
                        label="OS"
                    />
                </div>
            )}
        </div>
    )
}

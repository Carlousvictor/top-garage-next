"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useConfirm } from '../context/ConfirmContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Pagination, { usePagination } from './Pagination'

export default function ThirdPartyOrderList({ initialOrders }) {
    const supabase = createClient()
    const router = useRouter()
    const confirm = useConfirm()
    const [orders, setOrders] = useState(initialOrders || [])
    // Filtro de data por created_at — range opcional, mesma semântica da OS normal.
    const [dateStart, setDateStart] = useState('')
    const [dateEnd, setDateEnd] = useState('')

    const filteredOrders = (() => {
        if (!dateStart && !dateEnd) return orders
        const startMs = dateStart ? new Date(dateStart + 'T00:00:00').getTime() : -Infinity
        const endMs = dateEnd ? new Date(dateEnd + 'T23:59:59.999').getTime() : Infinity
        return orders.filter(o => {
            if (!o.created_at) return false
            const t = new Date(o.created_at).getTime()
            return t >= startMs && t <= endMs
        })
    })()

    const pagination = usePagination(filteredOrders, 25)

    const handleDelete = async (id) => {
        const ok = await confirm({ title: 'Excluir OS de Terceiros', message: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true })
        if (!ok) return
        await supabase.from('service_order_items').delete().eq('service_order_id', id)
        await supabase.from('service_orders').delete().eq('id', id)
        setOrders(prev => prev.filter(o => o.id !== id))
    }

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white">OS Terceiros</h2>
                    <p className="text-sm text-gray-400">Ordens de serviço isoladas. Não movimentam o estoque principal.</p>
                </div>
                <Link
                    href="/thirds/new"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    Nova OS Terceiros
                </Link>
            </div>

            {/* Range de data (De / Até) — só aparece se há OS pra filtrar. */}
            {orders.length > 0 && (
                <div className="mb-6 flex flex-wrap gap-3 items-end bg-black border border-neutral-800 rounded-lg p-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Data da OS — De</label>
                        <input
                            type="date"
                            value={dateStart}
                            max={dateEnd || undefined}
                            onChange={(e) => setDateStart(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Até</label>
                        <input
                            type="date"
                            value={dateEnd}
                            min={dateStart || undefined}
                            onChange={(e) => setDateEnd(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
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
                    <p className="text-[11px] text-gray-500 ml-auto self-center">
                        {filteredOrders.length} de {orders.length}
                    </p>
                </div>
            )}

            {orders.length === 0 ? (
                <div className="text-center py-10 text-gray-500 border border-dashed border-neutral-800 rounded-lg">
                    Nenhuma ordem de serviço de terceiros encontrada.
                </div>
            ) : filteredOrders.length === 0 ? (
                <div className="text-center py-10 text-gray-500 border border-dashed border-neutral-800 rounded-lg">
                    Nenhuma OS no período selecionado.
                    <button
                        type="button"
                        onClick={() => { setDateStart(''); setDateEnd('') }}
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
                                <th className="px-4 py-3">Referência/Cliente</th>
                                <th className="px-4 py-3">Veículo</th>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Total</th>
                                <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagination.paginatedItems.map((order) => (
                                <tr key={order.id} className="border-b border-neutral-800 hover:bg-neutral-800 transition-colors">
                                    <td className="px-4 py-3 font-medium text-white">#{order.id}</td>
                                    <td className="px-4 py-3">{order.clients?.name || order.client_label || order.observation || 'Avulso'}</td>
                                    <td className="px-4 py-3">
                                        <div className="text-white">{order.vehicle_plate}</div>
                                        <div className="text-xs text-gray-500">{order.vehicle_model}</div>
                                    </td>
                                    <td className="px-4 py-3">{new Date(order.created_at).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 font-medium text-white">
                                        R$ {order.total ? order.total.toFixed(2) : '0.00'}
                                    </td>
                                    <td className="px-4 py-3 text-right flex items-center justify-end gap-3">
                                        <Link
                                            href={`/thirds/${order.id}`}
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

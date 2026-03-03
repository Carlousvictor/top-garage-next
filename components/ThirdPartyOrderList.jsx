"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function ThirdPartyOrderList({ initialOrders }) {
    const supabase = createClient()
    const router = useRouter()
    const [orders, setOrders] = useState(initialOrders || [])

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

            {orders.length === 0 ? (
                <div className="text-center py-10 text-gray-500 border border-dashed border-neutral-800 rounded-lg">
                    Nenhuma ordem de serviço de terceiros encontrada.
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
                            {orders.map((order) => (
                                <tr key={order.id} className="border-b border-neutral-800 hover:bg-neutral-800 transition-colors">
                                    <td className="px-4 py-3 font-medium text-white">#{order.id}</td>
                                    <td className="px-4 py-3">{order.observation || 'Avulso'}</td>
                                    <td className="px-4 py-3">
                                        <div className="text-white">{order.vehicle_plate}</div>
                                        <div className="text-xs text-gray-500">{order.vehicle_model}</div>
                                    </td>
                                    <td className="px-4 py-3">{new Date(order.created_at).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 font-medium text-white">
                                        R$ {order.total ? order.total.toFixed(2) : '0.00'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={`/thirds/${order.id}`}
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

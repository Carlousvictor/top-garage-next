"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'

export default function ServiceList() {
    const supabase = createClient()
    const { companyId } = useAuth()

    const [services, setServices] = useState([])
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const [currentService, setCurrentService] = useState({ name: '', price: '', description: '' })

    useEffect(() => {
        fetchServices()
    }, [])

    const fetchServices = async () => {
        setLoading(true)
        const { data } = await supabase.from('services').select('*').order('name')
        setServices(data || [])
        setLoading(false)
    }

    const handleEdit = (service) => {
        setCurrentService(service)
        setIsEditing(true)
    }

    const handleNew = () => {
        setCurrentService({ name: '', price: '', description: '' })
        setIsEditing(true)
    }

    const handleSave = async (e) => {
        e.preventDefault()
        setLoading(true)

        if (!companyId) {
            alert('Erro: Empresa não identificada.')
            setLoading(false)
            return
        }

        try {
            const payload = {
                company_id: companyId,
                name: currentService.name,
                price: parseFloat(currentService.price),
                description: currentService.description
            }

            if (currentService.id) {
                const { company_id, ...updatePayload } = payload
                await supabase.from('services').update(updatePayload).eq('id', currentService.id)
            } else {
                await supabase.from('services').insert([payload])
            }

            setIsEditing(false)
            fetchServices()
        } catch (error) {
            alert('Erro ao salvar serviço: ' + error.message)
        } finally {
            setLoading(false)
        }
    }


    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir este serviço?')) return
        await supabase.from('services').delete().eq('id', id)
        fetchServices()
    }

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Catálogo de Serviços</h2>
                <button
                    onClick={handleNew}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    Novo Serviço
                </button>
            </div>

            {/* List */}
            {!isEditing ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-200 uppercase bg-black">
                            <tr>
                                <th className="px-6 py-3">Serviço</th>
                                <th className="px-6 py-3">Descrição</th>
                                <th className="px-6 py-3">Preço Base</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {services.map((service) => (
                                <tr key={service.id} className="border-b border-neutral-800 hover:bg-neutral-800">
                                    <td className="px-6 py-4 font-medium text-white">{service.name}</td>
                                    <td className="px-6 py-4">{service.description || '-'}</td>
                                    <td className="px-6 py-4 text-green-400 font-bold">R$ {service.price?.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleEdit(service)} className="text-blue-400 hover:text-blue-300 mr-4">Editar</button>
                                        <button onClick={() => handleDelete(service.id)} className="text-red-500 hover:text-red-400">Excluir</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* Form */
                <form onSubmit={handleSave} className="bg-black p-6 rounded-lg border border-neutral-800">
                    <h3 className="text-lg font-bold text-white mb-4">{currentService.id ? 'Editar Serviço' : 'Novo Serviço'}</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Serviço</label>
                            <input
                                type="text"
                                required
                                value={currentService.name}
                                onChange={e => setCurrentService({ ...currentService, name: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Preço (R$)</label>
                            <input
                                type="number"
                                required
                                value={currentService.price}
                                onChange={e => setCurrentService({ ...currentService, price: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Descrição (Opcional)</label>
                            <input
                                type="text"
                                value={currentService.description || ''}
                                onChange={e => setCurrentService({ ...currentService, description: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div className="flex gap-4 pt-4">
                            <button
                                type="submit"
                                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-medium"
                            >
                                Salvar
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                className="bg-neutral-700 hover:bg-neutral-600 text-gray-200 px-5 py-2.5 rounded-lg font-medium"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </form>
            )}
        </div>
    )
}

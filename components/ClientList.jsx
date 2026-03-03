"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'

export default function ClientList({ initialClients }) {
    const supabase = createClient()
    const { tenantId } = useAuth()

    const [clients, setClients] = useState(initialClients || [])
    const [isEditing, setIsEditing] = useState(false)
    const [currentClient, setCurrentClient] = useState({ name: '', email: '', phone: '', document: '' })
    const [loading, setLoading] = useState(false)

    const fetchClients = async () => {
        const { data } = await supabase.from('clients').select('*').order('name')
        setClients(data || [])
    }

    const handleEdit = (client) => {
        setCurrentClient(client)
        setIsEditing(true)
    }

    const handleNew = () => {
        setCurrentClient({ name: '', email: '', phone: '', document: '' })
        setIsEditing(true)
    }

    const handleSave = async (e) => {
        e.preventDefault()
        setLoading(true)

        if (!tenantId) {
            alert('Erro: Empresa não identificada.')
            setLoading(false)
            return
        }

        try {
            const payload = {
                tenant_id: tenantId,
                name: currentClient.name,
                email: currentClient.email,
                phone: currentClient.phone,
                document: currentClient.document
            }

            if (currentClient.id) {
                const { tenant_id, ...updatePayload } = payload
                await supabase.from('clients').update(updatePayload).eq('id', currentClient.id)
            } else {
                await supabase.from('clients').insert([payload])
            }

            setIsEditing(false)
            fetchClients()
        } catch (error) {
            alert('Erro ao salvar cliente: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir este cliente?')) return
        await supabase.from('clients').delete().eq('id', id)
        fetchClients()
    }

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Clientes</h2>
                <button
                    onClick={handleNew}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    Novo Cliente
                </button>
            </div>

            {/* List */}
            {!isEditing ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-200 uppercase bg-black">
                            <tr>
                                <th className="px-6 py-3">Nome</th>
                                <th className="px-6 py-3">E-mail</th>
                                <th className="px-6 py-3">Telefone</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clients.map((client) => (
                                <tr key={client.id} className="border-b border-neutral-800 hover:bg-neutral-800">
                                    <td className="px-6 py-4 font-medium text-white">{client.name}</td>
                                    <td className="px-6 py-4">{client.email || '-'}</td>
                                    <td className="px-6 py-4">{client.phone || '-'}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleEdit(client)} className="text-blue-400 hover:text-blue-300 mr-4">Editar</button>
                                        <button onClick={() => handleDelete(client.id)} className="text-red-500 hover:text-red-400">Excluir</button>
                                    </td>
                                </tr>
                            ))}
                            {clients.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-6 py-4 text-center">Nenhum cliente cadastrado.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* Form */
                <form onSubmit={handleSave} className="bg-black p-6 rounded-lg border border-neutral-800">
                    <h3 className="text-lg font-bold text-white mb-4">{currentClient.id ? 'Editar Cliente' : 'Novo Cliente'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Nome Completo</label>
                            <input
                                type="text"
                                required
                                value={currentClient.name}
                                onChange={e => setCurrentClient({ ...currentClient, name: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Telefone / WhatsApp</label>
                            <input
                                type="text"
                                required
                                placeholder="(21) 99999-9999"
                                value={currentClient.phone || ''}
                                onChange={e => setCurrentClient({ ...currentClient, phone: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">E-mail (Opcional)</label>
                            <input
                                type="email"
                                value={currentClient.email || ''}
                                onChange={e => setCurrentClient({ ...currentClient, email: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">CPF/CNPJ (Opcional)</label>
                            <input
                                type="text"
                                value={currentClient.document || ''}
                                onChange={e => setCurrentClient({ ...currentClient, document: e.target.value })}
                                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                            />
                        </div>
                    </div>
                    <div className="flex gap-4 pt-6">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-medium disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="bg-neutral-700 hover:bg-neutral-600 text-gray-200 px-5 py-2.5 rounded-lg font-medium"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}
        </div>
    )
}

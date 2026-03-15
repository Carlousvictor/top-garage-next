"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { fetchVehicleByPlate } from '../services/vehicleApi'
import { useAuth } from '../context/AuthContext'

export default function ClientList({ initialClients }) {
    const supabase = createClient()
    const { tenantId } = useAuth()

    const [clients, setClients] = useState(initialClients || [])
    const [isEditing, setIsEditing] = useState(false)
    const [currentClient, setCurrentClient] = useState({ name: '', email: '', phone: '', document: '' })
    const [loading, setLoading] = useState(false)
    const [vehicles, setVehicles] = useState([])
    const [newVehicle, setNewVehicle] = useState({ plate: '', brand: '', model: '', year: '', color: '' })

    const fetchClients = async () => {
        const { data } = await supabase.from('clients').select('*').order('name')
        setClients(data || [])
    }

    const fetchVehicles = async (clientId) => {
        const { data } = await supabase.from('vehicles').select('*').eq('client_id', clientId).order('created_at')
        setVehicles(data || [])
    }

    const handleEdit = (client) => {
        setCurrentClient(client)
        fetchVehicles(client.id)
        setIsEditing(true)
    }

    const handleNew = () => {
        setCurrentClient({ name: '', email: '', phone: '', document: '' })
        setVehicles([])
        setNewVehicle({ plate: '', brand: '', model: '', year: '', color: '' })
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
                const { data, error } = await supabase.from('clients').insert([payload]).select().single()
                if (error) throw error

                if (vehicles.length > 0) {
                    const vehiclesPayload = vehicles.map(v => ({
                        tenant_id: tenantId,
                        client_id: data.id,
                        plate: v.plate,
                        brand: v.brand,
                        model: v.model,
                        year: v.year,
                        color: v.color
                    }))
                    await supabase.from('vehicles').insert(vehiclesPayload)
                }
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

    const handleAddVehicle = async () => {
        if (!newVehicle.plate) {
            alert('A placa do veículo é obrigatória.')
            return
        }

        if (currentClient.id) {
            setLoading(true)
            try {
                const payload = {
                    tenant_id: tenantId,
                    client_id: currentClient.id,
                    plate: newVehicle.plate.toUpperCase(),
                    brand: newVehicle.brand,
                    model: newVehicle.model,
                    year: newVehicle.year,
                    color: newVehicle.color
                }
                await supabase.from('vehicles').insert([payload])
                setNewVehicle({ plate: '', brand: '', model: '', year: '', color: '' })
                fetchVehicles(currentClient.id)
            } catch (error) {
                alert('Erro ao adicionar veículo: ' + error.message)
            } finally {
                setLoading(false)
            }
        } else {
            setVehicles([...vehicles, {
                id: Date.now(), // ID temporário
                ...newVehicle,
                plate: newVehicle.plate.toUpperCase()
            }])
            setNewVehicle({ plate: '', brand: '', model: '', year: '', color: '' })
        }
    }

    const handleDeleteVehicle = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir este veículo?')) return
        
        if (currentClient.id) {
            await supabase.from('vehicles').delete().eq('id', id)
            fetchVehicles(currentClient.id)
        } else {
            setVehicles(vehicles.filter(v => v.id !== id))
        }
    }

    const handleSearchVehicle = async () => {
        if (!newVehicle.plate) return
        setLoading(true)
        try {
            const data = await fetchVehicleByPlate(newVehicle.plate)
            setNewVehicle((prev) => ({
                ...prev,
                brand: data.marca || '',
                model: data.modelo || '',
                year: data.ano?.toString() || '',
                color: data.cor || ''
            }))
        } catch (error) {
            alert('Erro ao buscar veículo: ' + error.message)
        } finally {
            setLoading(false)
        }
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

                    <div className="mt-8 pt-6 border-t border-neutral-800">
                        <h4 className="text-md font-bold text-gray-200 mb-4">Veículos do Cliente</h4>

                            {/* Lista de Veículos Existentes */}
                            {vehicles.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    {vehicles.map(v => (
                                        <div key={v.id} className="bg-neutral-900 border border-neutral-700 p-4 rounded-lg flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-white text-lg">{v.plate}</div>
                                                <div className="text-sm text-gray-400">{v.brand} {v.model} {v.year ? `(${v.year})` : ''}</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteVehicle(v.id)}
                                                className="text-red-500 hover:text-red-400 p-2"
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 mb-6">Nenhum veículo cadastrado para este cliente.</p>
                            )}

                            {/* Form de Novo Veículo */}
                            <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800">
                                <h5 className="text-sm font-medium text-gray-300 mb-3">Adicionar Novo Veículo</h5>
                                <div className="flex flex-wrap gap-3 items-end">
                                    <div className="flex-1 min-w-[200px]">
                                        <label className="text-xs text-gray-400 block mb-1">Placa *</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newVehicle.plate}
                                                onChange={e => setNewVehicle({ ...newVehicle, plate: e.target.value.toUpperCase() })}
                                                className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                placeholder="ABC-1234"
                                                maxLength={8}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleSearchVehicle}
                                                disabled={loading || !newVehicle.plate}
                                                className="bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                                            >
                                                {loading ? '...' : 'Buscar'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-[120px]">
                                        <label className="text-xs text-gray-400 block mb-1">Marca</label>
                                        <input
                                            type="text"
                                            value={newVehicle.brand}
                                            onChange={e => setNewVehicle({ ...newVehicle, brand: e.target.value })}
                                            className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                            placeholder="Ex: Fiat"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-[120px]">
                                        <label className="text-xs text-gray-400 block mb-1">Modelo</label>
                                        <input
                                            type="text"
                                            value={newVehicle.model}
                                            onChange={e => setNewVehicle({ ...newVehicle, model: e.target.value })}
                                            className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                            placeholder="Ex: Argo"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-[80px]">
                                        <label className="text-xs text-gray-400 block mb-1">Ano</label>
                                        <input
                                            type="text"
                                            value={newVehicle.year}
                                            onChange={e => setNewVehicle({ ...newVehicle, year: e.target.value })}
                                            className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                            placeholder="2021"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-[100px]">
                                        <label className="text-xs text-gray-400 block mb-1">Cor</label>
                                        <input
                                            type="text"
                                            value={newVehicle.color}
                                            onChange={e => setNewVehicle({ ...newVehicle, color: e.target.value })}
                                            className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                            placeholder="Preto"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddVehicle}
                                        disabled={loading}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors w-full md:w-auto"
                                    >
                                        + Adicionar Veículo
                                    </button>
                                </div>
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

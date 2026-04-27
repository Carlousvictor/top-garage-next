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
    const [newVehicle, setNewVehicle] = useState({ plate: '', brand: '', model: '', submodel: '', year: '', manufacture_year: '', color: '', fuel_type: '', chassi: '', engine_displacement: '', transmission: '', city: '', state: '', observations: '' })

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
        setNewVehicle({ plate: '', brand: '', model: '', submodel: '', year: '', manufacture_year: '', color: '', fuel_type: '', chassi: '', engine_displacement: '', transmission: '', city: '', state: '', observations: '' })
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
                    submodel: newVehicle.submodel,
                    year: newVehicle.year,
                    manufacture_year: newVehicle.manufacture_year,
                    color: newVehicle.color,
                    fuel_type: newVehicle.fuel_type,
                    chassi: newVehicle.chassi,
                    engine_displacement: newVehicle.engine_displacement,
                    transmission: newVehicle.transmission,
                    city: newVehicle.city,
                    state: newVehicle.state,
                    observations: newVehicle.observations,
                }
                await supabase.from('vehicles').insert([payload])
                setNewVehicle({ plate: '', brand: '', model: '', submodel: '', year: '', manufacture_year: '', color: '', fuel_type: '', chassi: '', engine_displacement: '', transmission: '', city: '', state: '', observations: '' })
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
            setNewVehicle({ plate: '', brand: '', model: '', submodel: '', year: '', manufacture_year: '', color: '', fuel_type: '', chassi: '', engine_displacement: '', transmission: '', city: '', state: '', observations: '' })
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
                submodel: data.submodelo || '',
                year: data.ano?.toString() || '',
                manufacture_year: data.anoFabricacao?.toString() || '',
                color: data.cor || '',
                fuel_type: data.combustivel || '',
                chassi: data.chassi || '',
                engine_displacement: data.cilindrada || '',
                transmission: data.cambio || '',
                city: data.cidade || '',
                state: data.uf || '',
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
                            <label className="block text-sm font-medium text-gray-300 mb-1">Telefone / WhatsApp (Opcional)</label>
                            <input
                                type="text"
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
                                                <div className="text-sm text-gray-400">
                                                    {v.brand} {v.model} {v.submodel ? v.submodel : ''} {v.year ? `(${v.year})` : ''}
                                                </div>
                                                {(v.fuel_type || v.color || v.engine_displacement || v.transmission) && (
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {[v.color, v.fuel_type, v.engine_displacement, v.transmission].filter(Boolean).join(' · ')}
                                                    </div>
                                                )}
                                                {(v.city || v.state) && (
                                                    <div className="text-xs text-gray-500">
                                                        {[v.city, v.state].filter(Boolean).join(' / ')}
                                                    </div>
                                                )}
                                                {v.chassi && (
                                                    <div className="text-[11px] text-gray-600 font-mono mt-0.5">chassi: {v.chassi}</div>
                                                )}
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
                                <h5 className="text-sm font-medium text-gray-300 mb-4">Adicionar Novo Veículo</h5>

                                <div className="space-y-5">
                                    {/* Identificação */}
                                    <div>
                                        <h6 className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-2">Identificação</h6>
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                            <div className="md:col-span-5">
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
                                                        className="bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        {loading ? '...' : 'Buscar'}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="md:col-span-7">
                                                <label className="text-xs text-gray-400 block mb-1">Chassi</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.chassi}
                                                    onChange={e => setNewVehicle({ ...newVehicle, chassi: e.target.value.toUpperCase() })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2 font-mono"
                                                    placeholder="9BWZZZ377VT004251"
                                                    maxLength={17}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Veículo */}
                                    <div>
                                        <h6 className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-2">Veículo</h6>
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                            <div className="md:col-span-3">
                                                <label className="text-xs text-gray-400 block mb-1">Marca</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.brand}
                                                    onChange={e => setNewVehicle({ ...newVehicle, brand: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="Ex: Fiat"
                                                />
                                            </div>
                                            <div className="md:col-span-4">
                                                <label className="text-xs text-gray-400 block mb-1">Modelo</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.model}
                                                    onChange={e => setNewVehicle({ ...newVehicle, model: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="Ex: Argo"
                                                />
                                            </div>
                                            <div className="md:col-span-5">
                                                <label className="text-xs text-gray-400 block mb-1">Submodelo / Versão</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.submodel}
                                                    onChange={e => setNewVehicle({ ...newVehicle, submodel: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="Ex: Drive 1.3 Mi Total Flex"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Motor & Especificações */}
                                    <div>
                                        <h6 className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-2">Motor & Especificações</h6>
                                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Ano modelo</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.year}
                                                    onChange={e => setNewVehicle({ ...newVehicle, year: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="2021"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Ano fab.</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.manufacture_year}
                                                    onChange={e => setNewVehicle({ ...newVehicle, manufacture_year: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="2020"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Cor</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.color}
                                                    onChange={e => setNewVehicle({ ...newVehicle, color: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="Preto"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Combustível</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.fuel_type}
                                                    onChange={e => setNewVehicle({ ...newVehicle, fuel_type: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="Flex"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Cilindrada</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.engine_displacement}
                                                    onChange={e => setNewVehicle({ ...newVehicle, engine_displacement: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="1.6"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Câmbio</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.transmission}
                                                    onChange={e => setNewVehicle({ ...newVehicle, transmission: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="Manual"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Localização */}
                                    <div>
                                        <h6 className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-2">Localização</h6>
                                        <div className="grid grid-cols-12 gap-3">
                                            <div className="col-span-9">
                                                <label className="text-xs text-gray-400 block mb-1">Cidade</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.city}
                                                    onChange={e => setNewVehicle({ ...newVehicle, city: e.target.value })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                                    placeholder="Rio de Janeiro"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <label className="text-xs text-gray-400 block mb-1">UF</label>
                                                <input
                                                    type="text"
                                                    value={newVehicle.state}
                                                    onChange={e => setNewVehicle({ ...newVehicle, state: e.target.value.toUpperCase() })}
                                                    className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2 uppercase"
                                                    placeholder="RJ"
                                                    maxLength={2}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <label className="text-xs text-gray-400 block mb-1">Observações</label>
                                    <textarea
                                        value={newVehicle.observations}
                                        onChange={e => setNewVehicle({ ...newVehicle, observations: e.target.value })}
                                        rows={2}
                                        className="bg-black border border-neutral-700 text-white text-sm rounded-lg block w-full p-2"
                                        placeholder="Ex: kit GNV instalado, suspensão rebaixada, pneu especial…"
                                    />
                                </div>
                                <div className="mt-3 flex justify-end">
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

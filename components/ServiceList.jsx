"use client"
import { useState, useEffect } from 'react'
import Select from 'react-select'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'

// Estilos do react-select alinhados ao padrão dark do app (mesmos do ProductList).
const customStyles = {
    control: (base, state) => ({
        ...base,
        backgroundColor: '#000',
        borderColor: state.isFocused ? '#ef4444' : '#404040',
        color: '#fff',
        minHeight: '42px',
        boxShadow: 'none',
        '&:hover': { borderColor: '#ef4444' }
    }),
    singleValue: (base) => ({ ...base, color: '#fff' }),
    input: (base) => ({ ...base, color: '#fff' }),
    placeholder: (base) => ({ ...base, color: '#9ca3af' }),
    menu: (base) => ({ ...base, backgroundColor: '#171717', border: '1px solid #404040', zIndex: 30 }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused ? '#262626' : 'transparent',
        color: '#fff',
        cursor: 'pointer'
    }),
    indicatorSeparator: () => ({ display: 'none' })
}

export default function ServiceList({ initialServices }) {
    const supabase = createClient()
    const { companyId } = useAuth()

    const [services, setServices] = useState(initialServices || [])
    const [isEditing, setIsEditing] = useState(false)
    const [currentService, setCurrentService] = useState({ name: '', price: '', cost: '', description: '' })
    // Serviço selecionado na busca. Quando preenchido, tabela filtra. null = mostra tudo.
    const [searchService, setSearchService] = useState(null)

    const handleEdit = (service) => {
        setCurrentService(service)
        setIsEditing(true)
    }

    const handleNew = () => {
        setCurrentService({ name: '', price: '', cost: '', description: '' })
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
                cost: parseFloat(currentService.cost) || 0,
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

    // Opções do react-select com nome + descrição (a descrição entra no filtro também)
    const searchOptions = services.map(s => ({
        value: s.id,
        label: s.name,
        name: s.name,
        description: s.description || '',
        price: s.price || 0
    }))

    // Filtro custom: casa em nome OU descrição (default só olharia o label)
    const filterSearchOption = (option, input) => {
        if (!input) return true
        const q = input.toLowerCase()
        return (
            option.data.name?.toLowerCase().includes(q) ||
            option.data.description?.toLowerCase().includes(q)
        )
    }

    // Quando algum serviço é selecionado, filtra. Sem seleção, mostra tudo.
    const filteredServices = searchService
        ? services.filter(s => s.id === searchService.value)
        : services

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-bold text-white">Catálogo de Serviços</h2>
                <div className="flex gap-2 w-full md:w-auto items-center">
                    <div className="w-full md:w-96">
                        <Select
                            instanceId="service-search"
                            isClearable
                            placeholder="Buscar serviço..."
                            value={searchService}
                            onChange={(opt) => setSearchService(opt)}
                            options={searchOptions}
                            filterOption={filterSearchOption}
                            formatOptionLabel={(opt) => (
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex flex-col">
                                        <span className="text-white text-sm">{opt.name}</span>
                                        {opt.description && (
                                            <span className="text-[11px] text-gray-400 truncate max-w-[280px]">
                                                {opt.description}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] text-green-400 font-bold whitespace-nowrap">
                                        R$ {Number(opt.price).toFixed(2)}
                                    </span>
                                </div>
                            )}
                            noOptionsMessage={() => 'Nenhum serviço encontrado'}
                            styles={customStyles}
                        />
                    </div>
                    <button
                        onClick={handleNew}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                    >
                        Novo Serviço
                    </button>
                </div>
            </div>

            {/* List */}
            {!isEditing ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-200 uppercase bg-black">
                            <tr>
                                <th className="px-6 py-3">Serviço</th>
                                <th className="px-6 py-3">Descrição</th>
                                <th className="px-6 py-3">Preço</th>
                                <th className="px-6 py-3">Custo</th>
                                <th className="px-6 py-3">Margem</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredServices.length === 0 ? (
                                <tr><td colSpan="6" className="text-center py-4 text-gray-500">Nenhum serviço encontrado.</td></tr>
                            ) : filteredServices.map((service) => (
                                <tr key={service.id} className="border-b border-neutral-800 hover:bg-neutral-800">
                                    <td className="px-6 py-4 font-medium text-white">{service.name}</td>
                                    <td className="px-6 py-4">{service.description || '-'}</td>
                                    <td className="px-6 py-4 text-green-400 font-bold">R$ {service.price?.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-gray-400">R$ {(service.cost || 0).toFixed(2)}</td>
                                    <td className="px-6 py-4">
                                        {service.price > 0 ? (
                                            <span className={
                                                (service.price - (service.cost || 0)) / service.price >= 0.3
                                                    ? 'text-green-400'
                                                    : (service.price - (service.cost || 0)) / service.price >= 0.1
                                                        ? 'text-yellow-400'
                                                        : 'text-red-400'
                                            }>
                                                {(((service.price - (service.cost || 0)) / service.price) * 100).toFixed(0)}%
                                            </span>
                                        ) : '-'}
                                    </td>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Preço (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={currentService.price}
                                    onChange={e => setCurrentService({ ...currentService, price: e.target.value })}
                                    className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Custo (R$) <span className="text-xs text-gray-500">(mão de obra + insumos)</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={currentService.cost || ''}
                                    onChange={e => setCurrentService({ ...currentService, cost: e.target.value })}
                                    className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5"
                                    placeholder="0.00"
                                />
                            </div>
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

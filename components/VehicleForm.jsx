"use client"
import { useState } from 'react'
import { createClient } from '../utils/supabase/client'
import { fetchVehicleByPlate } from '../services/vehicleApi'

export default function VehicleForm() {
    const supabase = createClient()

    const [placa, setPlaca] = useState('')
    const [marca, setMarca] = useState('')
    const [modelo, setModelo] = useState('')
    const [ano, setAno] = useState('')
    const [cor, setCor] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    const handleSearch = async () => {
        if (!placa) return
        setLoading(true)
        setMessage('')

        try {
            const data = await fetchVehicleByPlate(placa)
            setMarca(data.marca)
            setModelo(data.modelo)
            setAno(data.ano.toString())
            setCor(data.cor)
        } catch (error) {
            setMessage('Erro ao buscar veículo: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async (e) => {
        e.preventDefault()
        if (!placa || !marca || !modelo) {
            setMessage('Preencha todos os campos obrigatórios')
            return
        }

        setLoading(true)
        const { data, error } = await supabase
            .from('vehicles')
            .insert([
                { placa, marca, modelo, ano, cor },
            ])

        if (error) {
            setMessage('Erro ao salvar: ' + error.message)
        } else {
            setMessage('Veículo salvo com sucesso!')
            setPlaca('')
            setMarca('')
            setModelo('')
            setAno('')
            setCor('')
        }
        setLoading(false)
    }

    return (
        <div className="max-w-md mx-auto mt-10 p-6 bg-neutral-900 rounded-lg shadow-xl border border-neutral-800">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Cadastro de Veículo</h2>

            <form onSubmit={handleSave} className="space-y-4">
                <div>
                    <label htmlFor="placa" className="block text-sm font-medium text-gray-300 mb-1">
                        Placa
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            id="placa"
                            value={placa}
                            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                            className="flex-1 bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block p-2.5 placeholder-gray-400"
                            placeholder="ABC-1234"
                            maxLength={8}
                        />
                        <button
                            type="button"
                            onClick={handleSearch}
                            disabled={loading || !placa}
                            className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-900 font-medium rounded-lg text-sm px-4 py-2.5 text-center disabled:opacity-50 transition-colors"
                        >
                            {loading ? '...' : 'Buscar'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="marca" className="block text-sm font-medium text-gray-300 mb-1">
                            Marca
                        </label>
                        <input
                            type="text"
                            id="marca"
                            value={marca}
                            onChange={(e) => setMarca(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block w-full p-2.5 placeholder-gray-400"
                            placeholder="Toyota"
                        />
                    </div>
                    <div>
                        <label htmlFor="modelo" className="block text-sm font-medium text-gray-300 mb-1">
                            Modelo
                        </label>
                        <input
                            type="text"
                            id="modelo"
                            value={modelo}
                            onChange={(e) => setModelo(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block w-full p-2.5 placeholder-gray-400"
                            placeholder="Corolla"
                        />
                    </div>
                    <div>
                        <label htmlFor="ano" className="block text-sm font-medium text-gray-300 mb-1">
                            Ano
                        </label>
                        <input
                            type="text"
                            id="ano"
                            value={ano}
                            onChange={(e) => setAno(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block w-full p-2.5 placeholder-gray-400"
                            placeholder="2021"
                        />
                    </div>
                    <div>
                        <label htmlFor="cor" className="block text-sm font-medium text-gray-300 mb-1">
                            Cor
                        </label>
                        <input
                            type="text"
                            id="cor"
                            value={cor}
                            onChange={(e) => setCor(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block w-full p-2.5 placeholder-gray-400"
                            placeholder="Preto"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-900 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors font-semibold mt-4"
                >
                    {loading ? 'Salvando...' : 'Salvar Veículo'}
                </button>

                {message && (
                    <div className={`p-4 mb-4 text-sm rounded-lg ${message.includes('sucesso') ? 'text-green-400 bg-neutral-900 border border-green-800' : 'text-red-400 bg-neutral-900 border border-red-800'}`} role="alert">
                        <span className="font-medium">{message}</span>
                    </div>
                )}
            </form>
        </div>
    )
}

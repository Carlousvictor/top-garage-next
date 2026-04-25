"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'
import { fetchVehicleByPlate } from '../services/vehicleApi'
import { Car, X, Search } from 'lucide-react'

// Cadastro rápido de veículo a partir da OS (cliente já existe).
// Reutiliza o mesmo fluxo de placa + busca da API Placas usado no
// QuickClientModal, mas sem criar cliente. Devolve o veículo via onCreated.
export default function QuickVehicleModal({ isOpen, onClose, onCreated, clientId, clientName }) {
    const supabase = createClient()
    const { tenantId } = useAuth()

    const [plate, setPlate] = useState('')
    const [brand, setBrand] = useState('')
    const [model, setModel] = useState('')
    const [year, setYear] = useState('')
    const [color, setColor] = useState('')
    const [extraVehicleData, setExtraVehicleData] = useState({})
    const [lookupLoading, setLookupLoading] = useState(false)

    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [infoMsg, setInfoMsg] = useState('')

    // Reseta o form sempre que o modal abrir — UX previsível pra "cadastrar mais um".
    useEffect(() => {
        if (isOpen) {
            setPlate('')
            setBrand('')
            setModel('')
            setYear('')
            setColor('')
            setExtraVehicleData({})
            setErrorMsg('')
            setInfoMsg('')
        }
    }, [isOpen])

    const handleLookupPlate = async () => {
        if (!plate.trim()) return
        setLookupLoading(true)
        setErrorMsg('')
        setInfoMsg('')
        try {
            const data = await fetchVehicleByPlate(plate)
            setBrand(data.marca || '')
            setModel(data.modelo || '')
            setYear(data.ano?.toString() || '')
            setColor(data.cor || '')
            setExtraVehicleData({
                submodel: data.submodelo || '',
                manufacture_year: data.anoFabricacao?.toString() || '',
                fuel_type: data.combustivel || '',
                chassi: data.chassi || '',
                engine_displacement: data.cilindrada || '',
                transmission: data.cambio || '',
                city: data.cidade || '',
                state: data.uf || ''
            })
            setInfoMsg('Dados do veículo preenchidos pela API.')
        } catch (err) {
            setErrorMsg('Erro ao buscar placa: ' + err.message)
        } finally {
            setLookupLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')

        if (!plate.trim() || plate.replace(/\W/g, '').length < 7) {
            setErrorMsg('Placa parece incompleta. Use AAA-1234 ou AAA1B23.')
            return
        }
        if (!tenantId || !clientId) {
            setErrorMsg('Cliente ou tenant não identificado. Recarregue a página.')
            return
        }

        setSaving(true)
        const { data, error } = await supabase
            .from('vehicles')
            .insert([{
                tenant_id: tenantId,
                client_id: clientId,
                plate: plate.trim().toUpperCase(),
                brand: brand.trim() || null,
                model: model.trim() || null,
                year: year.trim() || null,
                color: color.trim() || null,
                submodel: extraVehicleData.submodel || null,
                manufacture_year: extraVehicleData.manufacture_year || null,
                fuel_type: extraVehicleData.fuel_type || null,
                chassi: extraVehicleData.chassi || null,
                engine_displacement: extraVehicleData.engine_displacement || null,
                transmission: extraVehicleData.transmission || null,
                city: extraVehicleData.city || null,
                state: extraVehicleData.state || null
            }])
            .select()
            .single()

        setSaving(false)

        if (error) {
            setErrorMsg('Erro ao salvar veículo: ' + error.message)
            return
        }

        onCreated(data)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-8">
                <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Car className="w-5 h-5 text-red-500" />
                            Adicionar veículo
                        </h2>
                        {clientName && (
                            <p className="text-xs text-gray-400 mt-1">Vinculando a <strong className="text-gray-200">{clientName}</strong></p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition" aria-label="Fechar">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">
                            Placa <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                autoFocus
                                value={plate}
                                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                                className="flex-1 bg-black border border-neutral-700 rounded-lg p-2.5 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="ABC-1234"
                                maxLength={8}
                            />
                            <button
                                type="button"
                                onClick={handleLookupPlate}
                                disabled={lookupLoading || !plate.trim()}
                                className="bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap"
                            >
                                <Search className="w-4 h-4" />
                                {lookupLoading ? 'Buscando...' : 'Buscar'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Marca</label>
                            <input
                                type="text"
                                value={brand}
                                onChange={(e) => setBrand(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="VW"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Modelo</label>
                            <input
                                type="text"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="Gol"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Ano</label>
                            <input
                                type="text"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="2020"
                                maxLength={4}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Cor</label>
                            <input
                                type="text"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                placeholder="Prata"
                            />
                        </div>
                    </div>

                    {infoMsg && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg p-3">
                            {infoMsg}
                        </div>
                    )}

                    {errorMsg && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
                            {errorMsg}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-lg shadow-red-900/20 transition"
                        >
                            {saving ? 'Salvando...' : 'Adicionar à OS'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

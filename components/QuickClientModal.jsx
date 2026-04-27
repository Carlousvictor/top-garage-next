"use client"
import { useState } from 'react'
import { fetchVehicleByPlate } from '../services/vehicleApi'
import { UserPlus, X, Car, Search } from 'lucide-react'

// Modal de cadastro rápido de cliente (acionado da tela de OS).
// Salva o cliente E, opcionalmente, um veículo vinculado a ele.
// Devolve o cliente criado via onCreated() — o ServiceOrderForm já tem useEffect que
// busca veículos do cliente quando o id muda, então o auto-preencher acontece naturalmente.
export default function QuickClientModal({ isOpen, onClose, onCreated, initialName = '' }) {

    // Cliente
    const [name, setName] = useState(initialName)
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [document, setDocument] = useState('')

    // Veículo (opcional). Os campos "extras" (submodel, fuel_type, etc) ficam ocultos no form
    // — só são populados se o operador clicar em "Buscar" e a API retornar. São salvos
    // junto com a placa para o OS conseguir exibir info completa do veículo depois.
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

    // Máscara de telefone BR: (99) 99999-9999. Aceita apenas dígitos no input.
    const formatPhone = (v) => {
        const digits = String(v || '').replace(/\D/g, '').slice(0, 11)
        if (digits.length <= 2) return digits
        if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    }

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
            // Guarda os campos "extras" pra salvar no veículo — não exibidos no form
            // pra manter o cadastro rápido enxuto.
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

    const validateForm = () => {
        if (!name.trim() || name.trim().length < 2) return 'Informe o nome do cliente.'
        if (plate.trim() && plate.replace(/\W/g, '').length < 7) {
            return 'Placa parece incompleta. Use AAA-1234 ou AAA1B23.'
        }
        return null
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')
        setInfoMsg('')

        const validationError = validateForm()
        if (validationError) {
            setErrorMsg(validationError)
            return
        }

        setSaving(true)
        try {
            const vehicles = plate.trim() ? [{
                plate: plate.trim().toUpperCase(),
                brand: brand.trim() || null,
                model: model.trim() || null,
                year: year.trim() || null,
                color: color.trim() || null,
                ...extraVehicleData
            }] : []

            const res = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: name.trim(),
                    phone: phone.replace(/\D/g, '') || null,
                    email: email.trim() || null,
                    document: document.trim() || null,
                    vehicles
                })
            })
            const json = await res.json()
            if (!res.ok) {
                setErrorMsg('Erro ao salvar cliente: ' + (json.error || res.statusText))
                return
            }

            const created = json.clients?.find(c => c.name === name.trim()) ?? json.clients?.[0] ?? null
            if (created) onCreated(created)

            setName('')
            setPhone('')
            setEmail('')
            setDocument('')
            setPlate('')
            setBrand('')
            setModel('')
            setYear('')
            setColor('')
            setExtraVehicleData({})
        } catch (err) {
            setErrorMsg('Erro ao salvar cliente: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-8">
                <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-red-500" />
                        Cadastro rápido de cliente + veículo
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition"
                        aria-label="Fechar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-5">
                    {/* Cliente */}
                    <div>
                        <h6 className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-2">Dados do cliente</h6>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-7">
                                <label className="block text-sm text-gray-300 mb-1">
                                    Nome <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                    placeholder="Nome do cliente"
                                />
                            </div>
                            <div className="md:col-span-5">
                                <label className="block text-sm text-gray-300 mb-1">Telefone (WhatsApp)</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                                    className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                    placeholder="(21) 99999-9999"
                                />
                            </div>
                            <div className="md:col-span-6">
                                <label className="block text-sm text-gray-300 mb-1">CPF/CNPJ</label>
                                <input
                                    type="text"
                                    value={document}
                                    onChange={(e) => setDocument(e.target.value)}
                                    className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                    placeholder="Opcional"
                                />
                            </div>
                            <div className="md:col-span-6">
                                <label className="block text-sm text-gray-300 mb-1">E-mail</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                                    placeholder="Opcional"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Veículo */}
                    <div>
                        <h6 className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-2 flex items-center gap-1">
                            <Car className="w-3 h-3" /> Veículo (opcional)
                        </h6>
                        <p className="text-[11px] text-gray-500 mb-2">
                            Se preencher a placa, o veículo já fica vinculado ao cliente. Use "Buscar" para auto-preencher pela API.
                        </p>
                        {/* Linha 1: Placa + Buscar (sozinhos, sem competir com outros campos) */}
                        <div className="mb-3">
                            <label className="block text-sm text-gray-300 mb-1">Placa</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
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

                        {/* Linha 2: campos auto-preenchidos pela API, distribuídos uniformemente */}
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
                            {saving ? 'Salvando...' : 'Cadastrar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

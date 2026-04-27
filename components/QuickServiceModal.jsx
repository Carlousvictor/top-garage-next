"use client"
import { useState, useEffect } from 'react'
import { Wrench, X } from 'lucide-react'

export default function QuickServiceModal({ isOpen, onClose, onCreated, initialName = '' }) {
    const [name, setName] = useState(initialName)
    const [price, setPrice] = useState('')
    const [description, setDescription] = useState('')
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        if (isOpen) {
            setName(initialName)
            setPrice('')
            setDescription('')
            setErrorMsg('')
        }
    }, [isOpen, initialName])

    const formatInputCurrency = (value) => {
        if (!value) return ''
        const numericValue = value.toString().replace(/\D/g, '')
        const floatValue = parseFloat(numericValue) / 100
        return floatValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }

    const parseCurrency = (value) => {
        if (!value) return 0
        if (typeof value === 'number') return value
        const numericValue = value.toString().replace(/\D/g, '')
        return parseFloat(numericValue) / 100
    }

    const validate = () => {
        if (!name.trim()) return 'Informe o nome do serviço.'
        return null
    }

    // Adiciona apenas na OS — não salva no catálogo (sem service_id).
    const handleAddAvulso = () => {
        const err = validate()
        if (err) { setErrorMsg(err); return }
        const priceNum = parseCurrency(price)
        onCreated({ id: null, name: name.trim(), price: priceNum, avulso: true })
    }

    // Salva no catálogo via API server-side e adiciona na OS com service_id real.
    const handleSaveAndAdd = async () => {
        const err = validate()
        if (err) { setErrorMsg(err); return }

        const priceNum = parseCurrency(price)
        setSaving(true)
        setErrorMsg('')
        try {
            const res = await fetch('/api/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: name.trim(), price: priceNum, description: description.trim() || null })
            })
            const json = await res.json()
            if (!res.ok) {
                setErrorMsg('Erro ao salvar serviço: ' + (json.error || res.statusText))
                return
            }
            onCreated(json.service)
        } catch (err) {
            setErrorMsg('Erro ao salvar serviço: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-neutral-900 border border-neutral-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden my-8">
                <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-red-500" />
                        Adicionar serviço à OS
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition" aria-label="Fechar">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm text-gray-300 mb-1">
                            Nome <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                            placeholder="Ex: Troca de óleo"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-300 mb-1">
                            Valor (R$) <span className="text-gray-500 text-xs">(opcional)</span>
                        </label>
                        <input
                            type="text"
                            value={price}
                            onChange={(e) => setPrice(formatInputCurrency(e.target.value))}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                            placeholder="R$ 0,00"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">Em branco = define o valor depois, direto na OS.</p>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-300 mb-1">
                            Descrição <span className="text-gray-500 text-xs">(opcional — só ao salvar no catálogo)</span>
                        </label>
                        <textarea
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition resize-none"
                            placeholder="Opcional"
                        />
                    </div>

                    {errorMsg && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
                            {errorMsg}
                        </div>
                    )}

                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-3 text-[11px] text-gray-400">
                        <p><strong className="text-gray-200">Apenas nesta OS</strong> — adiciona o serviço somente nesta ordem, sem salvar no catálogo. Use para serviços pontuais.</p>
                        <p className="mt-1"><strong className="text-gray-200">Salvar no catálogo</strong> — registra o serviço permanentemente e adiciona na OS. Use para serviços recorrentes.</p>
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition text-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleAddAvulso}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg font-medium transition text-sm"
                        >
                            Apenas nesta OS
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveAndAdd}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-lg shadow-red-900/20 transition text-sm"
                        >
                            {saving ? 'Salvando...' : 'Salvar no catálogo'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

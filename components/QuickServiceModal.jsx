"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'
import { Wrench, X } from 'lucide-react'

// Cadastro rápido de serviço a partir da OS. Salva em services (com tenant_id)
// e devolve via onCreated. Inclui cost pra suportar cálculo de margem nos
// relatórios (coluna adicionada na migração de 2026-04-18).
export default function QuickServiceModal({ isOpen, onClose, onCreated, initialName = '' }) {
    const supabase = createClient()
    const { tenantId } = useAuth()

    const [name, setName] = useState(initialName)
    const [price, setPrice] = useState('')
    const [description, setDescription] = useState('')

    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        if (isOpen) {
            setName(initialName)
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

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg('')

        if (!name.trim()) {
            setErrorMsg('Informe o nome do serviço.')
            return
        }
        const priceNum = parseCurrency(price)
        if (priceNum <= 0) {
            setErrorMsg('Informe um preço válido.')
            return
        }
        if (!tenantId) {
            setErrorMsg('Tenant não identificado. Faça login novamente.')
            return
        }

        setSaving(true)
        const { data, error } = await supabase
            .from('services')
            .insert([{
                tenant_id: tenantId,
                name: name.trim(),
                price: priceNum,
                description: description.trim() || null
            }])
            .select()
            .single()

        setSaving(false)

        if (error) {
            setErrorMsg('Erro ao salvar serviço: ' + error.message)
            return
        }

        onCreated(data)
        setName('')
        setPrice('')
        setDescription('')
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-neutral-900 border border-neutral-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden my-8">
                <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-red-500" />
                        Cadastro rápido de serviço
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition" aria-label="Fechar">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
                            Preço (R$) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={price}
                            onChange={(e) => setPrice(formatInputCurrency(e.target.value))}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                            placeholder="R$ 0,00"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-300 mb-1">Descrição</label>
                        <textarea
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition resize-none"
                            placeholder="Opcional — detalhes do serviço"
                        />
                    </div>

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
                            {saving ? 'Salvando...' : 'Cadastrar e adicionar à OS'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

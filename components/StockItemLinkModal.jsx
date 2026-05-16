"use client"
import { useState, useEffect, useRef } from 'react'
import { X, Search, Link2, Layers, Check } from 'lucide-react'

// Modal pra (1) vincular item da nota a produto existente do estoque
// e (2) escolher equivalências (produtos intercambiáveis).
// Não cria/edita produtos — apenas seleciona. Persistência vai via payload
// do submit pai (/api/stock/import ou /api/stock/manual-entry).
//
// Props:
//  - isOpen
//  - onClose()
//  - itemLabel               : nome do item da NF pra exibir no header
//  - initialLinkProductId    : id atualmente vinculado (override de match)
//  - initialLinkProductName  : nome do produto vinculado pra render imediato
//  - initialEquivIds[]       : ids já selecionados como equivalentes
//  - onApply({ link_product_id, link_product_name, linked_product_ids })
export default function StockItemLinkModal({
    isOpen,
    onClose,
    itemLabel = '',
    initialLinkProductId = null,
    initialLinkProductName = null,
    initialEquivIds = [],
    onApply
}) {
    const [tab, setTab] = useState('link') // 'link' | 'equiv'
    const [q, setQ] = useState('')
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(false)
    const [linkId, setLinkId] = useState(initialLinkProductId)
    const [linkName, setLinkName] = useState(initialLinkProductName)
    const [equivIds, setEquivIds] = useState(initialEquivIds || [])
    const [equivLabels, setEquivLabels] = useState({}) // id -> name pra exibir chips
    const debounceRef = useRef(null)

    useEffect(() => {
        if (!isOpen) return
        setTab('link')
        setQ('')
        setResults([])
        setLinkId(initialLinkProductId)
        setLinkName(initialLinkProductName)
        setEquivIds(initialEquivIds || [])
        // labels pra ids já vindos do pai (sem fetch — opcional)
    }, [isOpen, initialLinkProductId, initialLinkProductName, initialEquivIds])

    useEffect(() => {
        if (!isOpen) return
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            setLoading(true)
            try {
                const url = new URL('/api/stock/products-search', window.location.origin)
                if (q.trim()) url.searchParams.set('q', q.trim())
                url.searchParams.set('limit', '20')
                const res = await fetch(url.toString(), { credentials: 'include' })
                const json = await res.json().catch(() => ({}))
                if (res.ok) {
                    setResults(json.products || [])
                    setEquivLabels(prev => {
                        const next = { ...prev }
                        for (const p of json.products || []) {
                            next[p.id] = p.name
                        }
                        return next
                    })
                } else {
                    setResults([])
                }
            } catch {
                setResults([])
            } finally {
                setLoading(false)
            }
        }, 280)
        return () => debounceRef.current && clearTimeout(debounceRef.current)
    }, [q, isOpen])

    if (!isOpen) return null

    const toggleEquiv = (p) => {
        setEquivIds(prev => {
            if (prev.includes(p.id)) return prev.filter(id => id !== p.id)
            return [...prev, p.id]
        })
        setEquivLabels(prev => ({ ...prev, [p.id]: p.name }))
    }

    const handleApply = () => {
        onApply?.({
            link_product_id: linkId || null,
            link_product_name: linkId ? (linkName || equivLabels[linkId] || null) : null,
            linked_product_ids: equivIds
        })
        onClose?.()
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white">Vincular item da nota</h2>
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">{itemLabel || '—'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-lg text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex border-b border-neutral-800">
                    <button
                        type="button"
                        onClick={() => setTab('link')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition ${tab === 'link' ? 'bg-neutral-800 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Link2 className="w-4 h-4" />
                        Adicionar a item existente
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('equiv')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition ${tab === 'equiv' ? 'bg-neutral-800 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Layers className="w-4 h-4" />
                        Equivalências
                        {equivIds.length > 0 && (
                            <span className="bg-red-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 ml-1">
                                {equivIds.length}
                            </span>
                        )}
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    {tab === 'link' && (
                        <div className="text-xs text-gray-400">
                            Selecione um produto existente para somar esta linha da NF ao estoque dele. A linha vira <strong>entrada</strong> nesse produto (custo/venda recalculados).
                        </div>
                    )}
                    {tab === 'equiv' && (
                        <div className="text-xs text-gray-400">
                            Marque produtos intercambiáveis (mesmo OEM, peça compatível). As equivalências são bidirecionais e ficam salvas no cadastro.
                        </div>
                    )}

                    <div className="flex items-center gap-2 bg-black border border-neutral-700 rounded-lg px-3 py-2">
                        <Search className="w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Buscar por nome, SKU ou EAN..."
                            className="flex-1 bg-transparent outline-none text-white text-sm"
                            autoFocus
                        />
                    </div>

                    {tab === 'link' && linkId && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 flex items-center justify-between">
                            <p className="text-xs text-emerald-200">
                                Vinculado a: <strong>{linkName || equivLabels[linkId] || linkId}</strong>
                            </p>
                            <button
                                type="button"
                                onClick={() => { setLinkId(null); setLinkName(null) }}
                                className="text-[11px] text-emerald-300 hover:text-white underline"
                            >
                                desfazer
                            </button>
                        </div>
                    )}

                    {tab === 'equiv' && equivIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {equivIds.map(id => (
                                <span key={id} className="bg-neutral-800 text-gray-200 text-xs rounded-full px-2 py-0.5 flex items-center gap-1">
                                    {equivLabels[id] || id}
                                    <button
                                        type="button"
                                        onClick={() => setEquivIds(prev => prev.filter(x => x !== id))}
                                        className="text-gray-400 hover:text-red-400"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="max-h-72 overflow-y-auto border border-neutral-800 rounded-lg divide-y divide-neutral-800">
                        {loading ? (
                            <p className="text-xs text-gray-500 italic p-4 text-center">Buscando...</p>
                        ) : results.length === 0 ? (
                            <p className="text-xs text-gray-500 italic p-4 text-center">
                                {q.trim() ? 'Nenhum produto encontrado.' : 'Digite para buscar produtos.'}
                            </p>
                        ) : (
                            results.map(p => {
                                const isSelectedLink = tab === 'link' && linkId === p.id
                                const isSelectedEquiv = tab === 'equiv' && equivIds.includes(p.id)
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => {
                                            if (tab === 'link') {
                                                if (linkId === p.id) {
                                                    setLinkId(null); setLinkName(null)
                                                } else {
                                                    setLinkId(p.id); setLinkName(p.name)
                                                }
                                            } else {
                                                toggleEquiv(p)
                                            }
                                        }}
                                        className={`w-full text-left p-3 hover:bg-neutral-800 transition flex items-center justify-between ${isSelectedLink || isSelectedEquiv ? 'bg-neutral-800/60' : ''}`}
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm text-white font-medium truncate">{p.name}</p>
                                            <p className="text-[11px] text-gray-500 truncate">
                                                {p.sku ? `SKU ${p.sku}` : '—'}
                                                {p.ean ? `  •  EAN ${p.ean}` : ''}
                                                {Number.isFinite(Number(p.quantity)) ? `  •  ${p.quantity} em estoque` : ''}
                                            </p>
                                        </div>
                                        {(isSelectedLink || isSelectedEquiv) && (
                                            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 ml-2" />
                                        )}
                                    </button>
                                )
                            })
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-neutral-800 flex justify-end gap-2 bg-black/30">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold"
                    >
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    )
}

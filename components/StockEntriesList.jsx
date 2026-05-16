"use client"
import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { Trash2, FileText, ChevronDown, ChevronUp, AlertCircle, Calendar, Hash, Truck, RefreshCw } from 'lucide-react'
import Pagination, { usePagination } from './Pagination'

// `refreshTrigger` é opcional: o pai pode incrementá-lo após salvar uma nota
// pra forçar refetch sem precisar remontar o componente. Default 0 mantém
// comportamento antigo (fetch só na montagem / mudança de tenant).
export default function StockEntriesList({ refreshTrigger = 0 }) {
    const supabase = createClient()
    const { tenantId } = useAuth()
    const toast = useToast()
    const confirm = useConfirm()

    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)
    const [expandedEntry, setExpandedEntry] = useState(null)
    const [entryItems, setEntryItems] = useState({}) // { entryId: [items] }
    const pagination = usePagination(entries, 10)

    const fetchEntries = async () => {
        setLoading(true)
        setLoadError(null)
        // Server-side via /api/stock/entries: cookie httpOnly garante auth
        // fresh, sem o bug de "lista vazia/cacheada até relogar" causado por
        // token stale do supabase-js client-side. AbortController preserva o
        // timeout de 20s — qualquer hang vira erro visível, não spinner eterno.
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000)
        try {
            const res = await fetch('/api/stock/entries', {
                method: 'GET',
                credentials: 'include',
                signal: controller.signal,
                // Evita cache do navegador/Next entre invocações sucessivas.
                cache: 'no-store',
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(json.error || `Erro HTTP ${res.status}`)
            }
            setEntries(json.entries || [])
        } catch (error) {
            console.error('[StockEntriesList] fetchEntries falhou:', error)
            const msg = error?.name === 'AbortError'
                ? 'Tempo limite (20s) ao carregar histórico. Verifique sua conexão.'
                : (error?.message || 'Erro desconhecido ao carregar histórico.')
            setLoadError(msg)
            toast.error('Erro ao carregar entradas: ' + msg)
        } finally {
            clearTimeout(timeoutId)
            setLoading(false)
        }
    }

    useEffect(() => {
        if (tenantId) fetchEntries()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, refreshTrigger])

    const toggleExpand = async (entryId) => {
        if (expandedEntry === entryId) {
            setExpandedEntry(null)
            return
        }

        setExpandedEntry(entryId)
        if (!entryItems[entryId]) {
            try {
                const { data, error } = await supabase
                    .from('stock_entry_items')
                    .select('*')
                    .eq('stock_entry_id', entryId)
                
                if (error) throw error
                setEntryItems(prev => ({ ...prev, [entryId]: data }))
            } catch (error) {
                toast.error('Erro ao carregar itens da nota: ' + error.message)
            }
        }
    }

    const handleDelete = async (entry) => {
        const isManual = !entry.xml_key
        const ok = await confirm({
            title: 'Excluir Entrada de Estoque',
            message: `Tem certeza que deseja excluir esta entrada do fornecedor "${entry.suppliers?.name}"?\n\nIsso irá:\n1. Reverter as quantidades no estoque.\n2. Excluir os lançamentos financeiros vinculados.\n3. Remover o registro desta nota.\n\nEsta ação NÃO PODE ser desfeita.`,
            confirmLabel: 'Excluir e Reverter',
            cancelLabel: 'Cancelar',
            danger: true
        })

        if (!ok) return

        try {
            setLoading(true)
            
            // 1. Get items to revert stock
            const { data: items, error: itemsErr } = await supabase
                .from('stock_entry_items')
                .select('*')
                .eq('stock_entry_id', entry.id)
            
            if (itemsErr) throw itemsErr

            // 2. Revert stock quantity for each product
            if (items && items.length > 0) {
                for (const item of items) {
                    if (item.product_id) {
                        // Get current quantity
                        const { data: prod } = await supabase
                            .from('products')
                            .select('quantity')
                            .eq('id', item.product_id)
                            .single()
                        
                        if (prod) {
                            const newQty = Number(prod.quantity || 0) - Number(item.quantity)
                            await supabase
                                .from('products')
                                .update({ quantity: newQty })
                                .eq('id', item.product_id)
                        }
                    }
                }
            } else if (!isManual) {
                // If it's an old entry without items records, we can't revert stock automatically
                toast.warning('Esta é uma entrada antiga sem registro de itens. O estoque não foi revertido automaticamente, mas o financeiro será excluído.')
            }

            // 3. Delete related transactions
            const { error: txErr } = await supabase
                .from('transactions')
                .delete()
                .eq('related_stock_entry_id', entry.id)
            
            if (txErr) throw txErr

            // 4. Delete the stock entry (cascades to stock_entry_items)
            const { error: entryErr } = await supabase
                .from('stock_entries')
                .delete()
                .eq('id', entry.id)
            
            if (entryErr) throw entryErr

            toast.success('Entrada excluída e estoque revertido.')
            setEntries(prev => prev.filter(e => e.id !== entry.id))
        } catch (error) {
            toast.error('Erro ao excluir entrada: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">
                    {entries.length > 0 ? `${entries.length} nota(s) registrada(s)` : 'Histórico'}
                </p>
                <button
                    type="button"
                    onClick={fetchEntries}
                    disabled={loading}
                    className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-800 hover:border-neutral-700 transition disabled:opacity-50"
                    title="Recarregar histórico"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Carregando...' : 'Atualizar'}
                </button>
            </div>

            {loadError && (
                <div className="bg-red-900/30 border border-red-800/60 rounded-2xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-red-200">Falha ao carregar histórico</p>
                        <p className="text-xs text-red-300/80 mt-1">{loadError}</p>
                    </div>
                    <button
                        type="button"
                        onClick={fetchEntries}
                        className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                    >
                        Tentar novamente
                    </button>
                </div>
            )}

            {loading && entries.length === 0 ? (
                <div className="text-center py-10 text-gray-500">Carregando histórico de notas...</div>
            ) : entries.length === 0 ? (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-10 text-center text-gray-500">
                    <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p>Nenhuma nota fiscal encontrada no histórico.</p>
                </div>
            ) : (
                pagination.paginatedItems.map(entry => (
                    <div key={entry.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden transition-all duration-300">
                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-xl ${entry.xml_key ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`} title={entry.xml_key ? 'Importado via XML' : 'Lançamento Manual'}>
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold">{entry.suppliers?.name || 'Fornecedor Desconhecido'}</h4>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                        {entry.invoice_number && (
                                            <span className="text-xs text-gray-300 flex items-center gap-1" title="Número da NF">
                                                <Hash className="w-3 h-3" /> NF {entry.invoice_number}
                                            </span>
                                        )}
                                        {entry.emission_date && (
                                            <span className="text-xs text-gray-400 flex items-center gap-1" title="Data de emissão">
                                                <Calendar className="w-3 h-3" /> Emissão {new Date(entry.emission_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                        <span className="text-xs text-gray-500 flex items-center gap-1" title="Data do lançamento no sistema">
                                            <Calendar className="w-3 h-3" /> Lançado {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                                        </span>
                                        <span className="text-xs text-gray-400 flex items-center gap-1">
                                            {entry.xml_key ? 'XML' : 'Manual'}
                                        </span>
                                        <span className="text-xs text-green-400 font-bold">
                                            R$ {Number(entry.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => toggleExpand(entry.id)}
                                    className="p-2 text-gray-400 hover:text-white transition"
                                    title="Ver itens da nota"
                                >
                                    {expandedEntry === entry.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </button>
                                <button 
                                    onClick={() => handleDelete(entry)}
                                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition"
                                    title="Excluir nota e reverter estoque"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {expandedEntry === entry.id && (
                            <div className="border-t border-neutral-800 bg-black/40 p-4 animate-in slide-in-from-top-2 duration-300">
                                <h5 className="text-xs uppercase font-bold text-gray-500 mb-3 tracking-widest flex items-center gap-2">
                                    <Truck className="w-3 h-3" /> Itens desta Nota
                                </h5>
                                {!entryItems[entry.id] ? (
                                    <p className="text-sm text-gray-500 italic">Carregando itens...</p>
                                ) : entryItems[entry.id].length === 0 ? (
                                    <p className="text-sm text-gray-500 italic">Nenhum item registrado para esta nota (entrada antiga).</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead className="text-gray-400 border-b border-neutral-800">
                                                <tr>
                                                    <th className="px-2 py-2">Produto</th>
                                                    <th className="px-2 py-2">SKU/EAN</th>
                                                    <th className="px-2 py-2 text-right">Qtd</th>
                                                    <th className="px-2 py-2 text-right">Custo</th>
                                                    <th className="px-2 py-2 text-right">Venda</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {entryItems[entry.id].map(item => (
                                                    <tr key={item.id} className="border-b border-neutral-800/50 text-gray-300">
                                                        <td className="px-2 py-2 font-medium text-white">{item.name}</td>
                                                        <td className="px-2 py-2 font-mono text-[10px]">{item.sku || item.ean || '-'}</td>
                                                        <td className="px-2 py-2 text-right">{item.quantity}</td>
                                                        <td className="px-2 py-2 text-right">R$ {Number(item.cost_price).toFixed(2)}</td>
                                                        <td className="px-2 py-2 text-right text-green-400">R$ {Number(item.selling_price).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))
            )}

            {entries.length > 0 && (
                <Pagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    pageSize={pagination.pageSize}
                    total={pagination.total}
                    onPageChange={pagination.setPage}
                    onPageSizeChange={pagination.setPageSize}
                    label="notas"
                />
            )}
        </div>
    )
}

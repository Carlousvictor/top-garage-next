"use client"
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ClipboardList, Plus, AlertTriangle, Trash2 } from 'lucide-react'

// Lista de sessões de inventário + criação de uma nova contagem.
export default function InventoryList({ initialInventories = [], tablesMissing = false }) {
    const router = useRouter()
    const toast = useToast()
    const confirm = useConfirm()
    const [creating, setCreating] = useState(false)
    const [inventories, setInventories] = useState(initialInventories)
    const [deletingId, setDeletingId] = useState(null)

    const handleDelete = async (inv) => {
        const isOpen = inv.status === 'open'
        const ok = await confirm({
            title: `Excluir inventário #${inv.id}`,
            message: isOpen
                ? 'A contagem deste inventário será perdida. Esta ação não pode ser desfeita.'
                : 'Este inventário já foi finalizado. Excluí-lo remove o histórico de divergências, mas NÃO reverte os ajustes de estoque já aplicados. Esta ação não pode ser desfeita.',
            confirmLabel: 'Excluir',
            danger: true,
        })
        if (!ok) return
        setDeletingId(inv.id)
        try {
            const res = await fetch(`/api/stock/inventory?id=${inv.id}`, { method: 'DELETE', credentials: 'include' })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || `Erro HTTP ${res.status}`)
            setInventories(prev => prev.filter(i => i.id !== inv.id))
            toast.success('Inventário excluído.')
        } catch (err) {
            toast.error('Erro ao excluir: ' + err.message)
        } finally {
            setDeletingId(null)
        }
    }

    const handleCreate = async () => {
        const ok = await confirm({
            title: 'Realizar inventário',
            message: 'Isso congela um snapshot de TODOS os produtos (ordem e estoque atual) para contagem física.\n\nVocê poderá imprimir a folha e ir preenchendo as contagens aos poucos. Continuar?',
            confirmLabel: 'Realizar inventário',
        })
        if (!ok) return
        setCreating(true)
        try {
            const res = await fetch('/api/stock/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({}),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || `Erro HTTP ${res.status}`)
            if (json.existing) toast.info('Já existe um inventário aberto — abrindo ele.')
            router.push(`/stock/inventory/${json.id}`)
        } catch (err) {
            toast.error('Erro ao criar inventário: ' + err.message)
            setCreating(false)
        }
    }

    const fmtDate = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—'

    return (
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ClipboardList className="w-6 h-6 text-red-500" /> Inventário
                    </h2>
                    <p className="text-sm text-gray-400">Contagem física do estoque. A folha impressa segue a mesma ordem da tela.</p>
                </div>
                <div className="flex gap-2">
                    <Link
                        href="/stock"
                        className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-neutral-700 whitespace-nowrap"
                    >
                        Voltar ao estoque
                    </Link>
                    <button
                        onClick={handleCreate}
                        disabled={creating || tablesMissing}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" /> {creating ? 'Criando...' : 'Realizar inventário'}
                    </button>
                </div>
            </div>

            {tablesMissing ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="text-amber-300 font-bold">Tabelas de inventário não encontradas.</p>
                        <p className="text-amber-200/80 mt-1">
                            Rode a migration no Supabase para habilitar a feature:
                        </p>
                        <code className="block mt-2 bg-black/40 rounded px-3 py-2 text-amber-200 text-xs font-mono">
                            migrations/2026_05_30_add_inventory_tables.sql
                        </code>
                    </div>
                </div>
            ) : inventories.length === 0 ? (
                <div className="text-center py-12 text-gray-500 border border-dashed border-neutral-800 rounded-lg">
                    Nenhum inventário ainda. Clique em <strong>Realizar inventário</strong> para iniciar a primeira contagem.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-200 uppercase bg-black">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">Nº</th>
                                <th className="px-4 py-3">Criado em</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Progresso</th>
                                <th className="px-4 py-3">Estoque ajustado?</th>
                                <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {inventories.map((inv) => {
                                const total = inv._total ?? 0
                                const counted = inv._counted ?? 0
                                const pct = total > 0 ? Math.round((counted / total) * 100) : 0
                                const isOpen = inv.status === 'open'
                                return (
                                    <tr key={inv.id} className="border-b border-neutral-800 hover:bg-neutral-800 transition-colors">
                                        <td className="px-4 py-3 font-medium text-white">#{inv.id}</td>
                                        <td className="px-4 py-3">{fmtDate(inv.created_at)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-md text-xs border ${isOpen
                                                ? 'bg-amber-900 text-amber-300 border-amber-700'
                                                : 'bg-green-900 text-green-300 border-green-700'}`}>
                                                {isOpen ? 'Aberto' : 'Finalizado'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 h-2 bg-neutral-700 rounded-full overflow-hidden">
                                                    <div className="h-full bg-red-500" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-xs text-gray-400 whitespace-nowrap">{counted}/{total}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">{inv.applied_to_stock ? 'Sim' : '—'}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <Link href={`/stock/inventory/${inv.id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                                                    {isOpen ? 'Continuar contagem' : 'Ver'}
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(inv)}
                                                    disabled={deletingId === inv.id}
                                                    className="text-red-500 hover:text-red-400 font-medium disabled:opacity-50 inline-flex items-center gap-1"
                                                    title="Excluir inventário"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    {deletingId === inv.id ? 'Excluindo...' : 'Excluir'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

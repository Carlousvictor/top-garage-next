"use client"
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { Search, X, Printer, CheckCircle2, Loader2, AlertTriangle, ArrowLeft, Trash2 } from 'lucide-react'
import InventoryCountSheet from './InventoryCountSheet'

const fmtQty = (v) => (v === null || v === undefined || v === '')
    ? '—'
    : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export default function InventoryCount({ inventory, initialItems = [] }) {
    const router = useRouter()
    const toast = useToast()
    const confirm = useConfirm()

    const isOpen = inventory.status === 'open'

    const [items, setItems] = useState(initialItems)
    // drafts: texto cru de cada input, keyed por item.id (separado do valor salvo).
    const [drafts, setDrafts] = useState(() => {
        const d = {}
        for (const it of initialItems) d[it.id] = it.counted_quantity != null ? String(it.counted_quantity) : ''
        return d
    })
    const [rowState, setRowState] = useState({}) // id -> 'saving' | 'saved' | 'error'
    const [searchText, setSearchText] = useState('')
    const [finalizing, setFinalizing] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [result, setResult] = useState(null)

    const normalize = (v) => String(v ?? '').toLowerCase().trim()
    const countedTotal = items.filter(it => it.counted_quantity !== null && it.counted_quantity !== undefined).length
    const total = items.length

    // Saldo de sistema = AO VIVO (current_quantity vem do products atual). Fallback
    // pro snapshot do início se o produto foi removido durante a contagem.
    const sysQty = (it) => Number(it.current_quantity ?? it.system_quantity) || 0

    // Divergências vivas (contagem salva × saldo atual).
    const liveDivergences = items.filter(it => {
        if (it.counted_quantity === null || it.counted_quantity === undefined) return false
        return (Number(it.counted_quantity) || 0) !== sysQty(it)
    }).length

    // Autosave por item ao sair do campo.
    const saveItem = async (item) => {
        if (!isOpen) return
        const raw = drafts[item.id] ?? ''
        const trimmed = String(raw).trim()
        const newVal = trimmed === '' ? null : Number(trimmed)
        if (trimmed !== '' && (!Number.isFinite(newVal) || newVal < 0)) {
            setRowState(s => ({ ...s, [item.id]: 'error' }))
            toast.error('Quantidade inválida.')
            return
        }
        const cur = item.counted_quantity ?? null
        if ((newVal ?? null) === cur) return // nada mudou

        setRowState(s => ({ ...s, [item.id]: 'saving' }))
        try {
            const res = await fetch('/api/stock/inventory/item', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ item_id: item.id, counted_quantity: trimmed === '' ? null : newVal }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || `Erro HTTP ${res.status}`)
            setItems(prev => prev.map(it => it.id === item.id
                ? { ...it, counted_quantity: newVal, counted_at: newVal === null ? null : new Date().toISOString() }
                : it))
            setRowState(s => ({ ...s, [item.id]: 'saved' }))
        } catch (err) {
            setRowState(s => ({ ...s, [item.id]: 'error' }))
            toast.error('Erro ao salvar contagem: ' + err.message)
        }
    }

    const handleFinalize = async () => {
        const ok = await confirm({
            title: 'Finalizar inventário',
            message: `${countedTotal} de ${total} itens contados.\n\nOs itens contados terão o estoque AJUSTADO para a contagem física. Itens em branco não serão alterados.\n\nApós finalizar, o inventário não pode mais ser editado. Continuar?`,
            confirmLabel: 'Finalizar e ajustar estoque',
        })
        if (!ok) return
        setFinalizing(true)
        try {
            const res = await fetch('/api/stock/inventory/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ inventory_id: inventory.id, apply: true }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || `Erro HTTP ${res.status}`)
            setResult(json)
        } catch (err) {
            toast.error('Erro ao finalizar: ' + err.message)
            setFinalizing(false)
        }
    }

    const handleDelete = async () => {
        const ok = await confirm({
            title: `Excluir inventário #${inventory.id}`,
            message: isOpen
                ? 'A contagem deste inventário será perdida. Esta ação não pode ser desfeita.'
                : 'Este inventário já foi finalizado. Excluí-lo remove o histórico de divergências, mas NÃO reverte os ajustes de estoque já aplicados. Esta ação não pode ser desfeita.',
            confirmLabel: 'Excluir',
            danger: true,
        })
        if (!ok) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/stock/inventory?id=${inventory.id}`, { method: 'DELETE', credentials: 'include' })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || `Erro HTTP ${res.status}`)
            toast.success('Inventário excluído.')
            router.push('/stock/inventory')
        } catch (err) {
            toast.error('Erro ao excluir: ' + err.message)
            setDeleting(false)
        }
    }

    const handlePrint = () => window.print()

    const filtered = (() => {
        const q = normalize(searchText)
        if (!q) return items
        return items.filter(it => normalize(it.product_name).includes(q) || normalize(it.sku).includes(q))
    })()

    return (
        <>
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800 print:hidden">
            <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        Inventário #{inventory.id}
                        <span className={`px-2 py-1 rounded-md text-xs border ${isOpen
                            ? 'bg-amber-900 text-amber-300 border-amber-700'
                            : 'bg-green-900 text-green-300 border-green-700'}`}>
                            {isOpen ? 'Aberto' : 'Finalizado'}
                        </span>
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Criado em {new Date(inventory.created_at).toLocaleString('pt-BR')}
                        {!isOpen && inventory.closed_at && ` · Finalizado em ${new Date(inventory.closed_at).toLocaleString('pt-BR')}`}
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Link href="/stock/inventory" className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium border border-neutral-700 flex items-center gap-2 whitespace-nowrap">
                        <ArrowLeft className="w-4 h-4" /> Inventários
                    </Link>
                    <button onClick={handlePrint} className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium border border-neutral-700 flex items-center gap-2 whitespace-nowrap">
                        <Printer className="w-4 h-4" /> Imprimir folha
                    </button>
                    <button onClick={handleDelete} disabled={deleting} className="bg-neutral-800 hover:bg-red-900/40 text-red-400 hover:text-red-300 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium border border-red-900/50 flex items-center gap-2 whitespace-nowrap">
                        <Trash2 className="w-4 h-4" /> {deleting ? 'Excluindo...' : 'Excluir'}
                    </button>
                    {isOpen && (
                        <button onClick={handleFinalize} disabled={finalizing} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 whitespace-nowrap">
                            {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Finalizar
                        </button>
                    )}
                </div>
            </div>

            {/* Resumo de progresso */}
            <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-black rounded-lg p-3 border border-neutral-800">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Itens</p>
                    <p className="text-xl font-black text-white">{total}</p>
                </div>
                <div className="bg-black rounded-lg p-3 border border-neutral-800">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Contados</p>
                    <p className="text-xl font-black text-white">{countedTotal}<span className="text-sm text-gray-500">/{total}</span></p>
                </div>
                <div className="bg-black rounded-lg p-3 border border-neutral-800">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Divergências</p>
                    <p className={`text-xl font-black ${liveDivergences > 0 ? 'text-amber-400' : 'text-white'}`}>{liveDivergences}</p>
                </div>
            </div>

            {isOpen && (
                <p className="text-xs text-gray-500 mb-3">
                    A contagem salva sozinha ao sair de cada campo. O <strong>Sistema (atual)</strong> não congela: se você vender algo no PDV durante o inventário, o saldo aqui se atualiza ao recarregar/voltar. A ordem dos itens é a mesma da folha impressa.
                </p>
            )}

            <div className="mb-4 relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Buscar item por nome ou SKU..."
                    className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg pl-9 pr-9 py-2.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                />
                {searchText && (
                    <button type="button" onClick={() => setSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-200 uppercase bg-black">
                        <tr>
                            <th className="px-3 py-3 rounded-tl-lg w-14">#</th>
                            <th className="px-3 py-3">SKU</th>
                            <th className="px-3 py-3">Produto</th>
                            <th className="px-3 py-3 text-right w-24">Sistema (atual)</th>
                            <th className="px-3 py-3 text-center w-36">Contagem</th>
                            <th className="px-3 py-3 text-right w-24 rounded-tr-lg">Divergência</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((it) => {
                            const draft = drafts[it.id] ?? ''
                            const draftNum = draft.trim() === '' ? null : Number(draft)
                            const hasNum = draftNum !== null && Number.isFinite(draftNum)
                            const diff = hasNum ? draftNum - sysQty(it) : null
                            const rs = rowState[it.id]
                            return (
                                <tr key={it.id} className="border-b border-neutral-800 hover:bg-neutral-800/50 transition-colors">
                                    <td className="px-3 py-2 text-gray-500 font-mono text-xs">{String(it.position + 1).padStart(3, '0')}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-gray-300 break-all">{it.sku || '—'}</td>
                                    <td className="px-3 py-2 text-white">{it.product_name}</td>
                                    <td className="px-3 py-2 text-right font-bold text-white">{fmtQty(sysQty(it))}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5 justify-center">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.001"
                                                inputMode="decimal"
                                                disabled={!isOpen}
                                                value={draft}
                                                onChange={(e) => setDrafts(d => ({ ...d, [it.id]: e.target.value }))}
                                                onBlur={() => saveItem(it)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                                placeholder="—"
                                                className="w-24 bg-neutral-800 border border-neutral-700 text-white text-right rounded-lg p-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none disabled:opacity-60"
                                            />
                                            <span className="w-4 shrink-0">
                                                {rs === 'saving' && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                                                {rs === 'saved' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                                {rs === 'error' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                                            </span>
                                        </div>
                                    </td>
                                    <td className={`px-3 py-2 text-right font-bold ${diff === null ? 'text-gray-600' : diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                        {diff === null ? '—' : (diff > 0 ? `+${fmtQty(diff)}` : fmtQty(diff))}
                                    </td>
                                </tr>
                            )
                        })}
                        {filtered.length === 0 && (
                            <tr><td colSpan="6" className="text-center py-10 text-gray-500">Nenhum item para a busca.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Modal de resultado da finalização */}
        {result && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
                <div className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                    <div className="p-5 border-b border-neutral-800">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-500" /> Inventário finalizado
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">
                            {result.countedCount} itens contados · {result.appliedCount} ajustados no estoque · {result.divergences?.length || 0} divergências.
                        </p>
                    </div>
                    <div className="p-5 overflow-y-auto">
                        {(!result.divergences || result.divergences.length === 0) ? (
                            <div className="text-center py-8 text-gray-400">
                                Nenhuma divergência — estoque físico bateu com o sistema. 🎉
                            </div>
                        ) : (
                            <div className="bg-black rounded-lg border border-neutral-800 overflow-hidden">
                                <table className="w-full text-sm text-left text-gray-400">
                                    <thead className="text-xs text-gray-200 uppercase bg-neutral-900">
                                        <tr>
                                            <th className="px-3 py-2">Produto</th>
                                            <th className="px-3 py-2 text-right">Sistema</th>
                                            <th className="px-3 py-2 text-right">Físico</th>
                                            <th className="px-3 py-2 text-right">Dif.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.divergences.map((d, i) => (
                                            <tr key={i} className="border-b border-neutral-800">
                                                <td className="px-3 py-2 text-white">{d.product_name}</td>
                                                <td className="px-3 py-2 text-right">{fmtQty(d.system_quantity)}</td>
                                                <td className="px-3 py-2 text-right text-white font-bold">{fmtQty(d.counted_quantity)}</td>
                                                <td className={`px-3 py-2 text-right font-bold ${d.diff > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                                    {d.diff > 0 ? `+${fmtQty(d.diff)}` : fmtQty(d.diff)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <div className="p-5 border-t border-neutral-800">
                        <button
                            onClick={() => { setResult(null); router.refresh() }}
                            className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition"
                        >
                            OK
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Folha de impressão — mesma ordem (position) da tela, saldo ao vivo no momento da impressão. */}
        <InventoryCountSheet inventory={inventory} items={items.map(it => ({ ...it, system_quantity: sysQty(it) }))} />
        </>
    )
}

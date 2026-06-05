"use client"
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Search, X, Eye, Printer, FileText, Trash2 } from 'lucide-react'
import Pagination, { usePagination } from './Pagination'
import PDVSalePrint from './PDVSalePrint'
import PDVConsolidatedPrint from './PDVConsolidatedPrint'

// Listagem das vendas do PDV (balcão). Espelha a UX da ServiceOrderList:
// busca livre + filtro de status (pills) + range de data + paginação.
// "Ver" abre um modal com os itens da venda e botão de imprimir/PDF.
//
// Vendas do PDV são transactions com descrição "Venda Balcão (PDV) - ...".
// O cliente e a forma de pagamento ficam embutidos na descrição, então
// derivamos esses campos por parsing (só pra exibição — nada é re-gravado).
export default function PDVSalesList({ initialSales }) {
    const { tenant } = useAuth()
    const router = useRouter()
    const toast = useToast()
    const [sales, setSales] = useState(initialSales || [])
    const [filterStatus, setFilterStatus] = useState('Todas')
    // Exclusão de venda — estorna estoque (opcional) e remove o lançamento.
    const [deleteTarget, setDeleteTarget] = useState(null)
    const [restockOnDelete, setRestockOnDelete] = useState(true)
    const [deleting, setDeleting] = useState(false)
    const [searchText, setSearchText] = useState('')
    const [dateStart, setDateStart] = useState('')
    const [dateEnd, setDateEnd] = useState('')
    const [selectedSale, setSelectedSale] = useState(null)
    // Seleção p/ relatório consolidado de pendências — só vendas em aberto.
    // Guarda ids (sobrevive a mudança de filtro/página).
    const [selectedIds, setSelectedIds] = useState(() => new Set())
    const [consolidatedOpen, setConsolidatedOpen] = useState(false)
    const [reportType, setReportType] = useState('synthetic') // 'synthetic' | 'analytic'

    const normalize = (v) => String(v ?? '').toLowerCase().trim()

    // Extrai forma de pagamento + nome do cliente da descrição.
    // Formato gerado pelo checkout:
    //   "Venda Balcão (PDV) - {método|Em Aberto|Múltiplo} - {cliente}[ - Desc X%]"
    const parseSale = (desc) => {
        let rest = (desc || '').replace(/^Venda Balcão \(PDV\)\s*-\s*/, '')
        rest = rest.replace(/\s*-\s*Desc\s*[\d.,]+%\s*$/i, '') // tira a tag de desconto do fim
        const idx = rest.indexOf(' - ')
        const method = idx >= 0 ? rest.slice(0, idx).trim() : rest.trim()
        const client = idx >= 0 ? rest.slice(idx + 3).trim() : ''
        return { method, client: client || 'Consumidor' }
    }

    const formatMoney = (v) => `R$ ${(Number(v) || 0).toFixed(2)}`

    const filteredSales = (() => {
        let list = sales
        if (filterStatus === 'Pagas') list = list.filter(s => s.status === 'paid')
        else if (filterStatus === 'Em aberto') list = list.filter(s => s.status === 'pending')

        const q = normalize(searchText)
        if (q) {
            list = list.filter(s => {
                const { client } = parseSale(s.description)
                return (
                    normalize(client).includes(q) ||
                    normalize(s.description).includes(q) ||
                    normalize(s.id).includes(q) ||
                    normalize(s.amount).includes(q)
                )
            })
        }

        if (dateStart || dateEnd) {
            const startMs = dateStart ? new Date(dateStart + 'T00:00:00').getTime() : -Infinity
            const endMs = dateEnd ? new Date(dateEnd + 'T23:59:59.999').getTime() : Infinity
            list = list.filter(s => {
                if (!s.date) return false
                const t = new Date(s.date).getTime()
                return t >= startMs && t <= endMs
            })
        }
        return list
    })()

    const pagination = usePagination(filteredSales, 25)

    const statusBadge = (status) => {
        if (status === 'pending') return { label: 'Em aberto', cls: 'bg-amber-900 text-amber-300 border-amber-700' }
        return { label: 'Paga', cls: 'bg-green-900 text-green-300 border-green-700' }
    }

    // Dados derivados da venda selecionada pra alimentar o modal + impressão.
    const saleView = (() => {
        if (!selectedSale) return null
        const { method, client } = parseSale(selectedSale.description)
        const items = Array.isArray(selectedSale.items_snapshot) ? selectedSale.items_snapshot : []
        return {
            id: selectedSale.id,
            client,
            method: selectedSale.payment_method || method || 'Em aberto',
            status: selectedSale.status,
            date: selectedSale.date,
            items,
            subtotal: selectedSale.subtotal_amount,
            discountPercent: selectedSale.discount_percent,
            discountAmount: selectedSale.discount_amount,
            observation: selectedSale.observation || null,
            total: selectedSale.amount,
        }
    })()

    const handlePrint = () => {
        if (!saleView || saleView.items.length === 0) return
        window.print()
    }

    // ----- Seleção p/ consolidado (só vendas em aberto) -----
    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }
    const clearSelection = () => setSelectedIds(new Set())

    // Mapeia as vendas selecionadas pro shape que o PDVConsolidatedPrint consome.
    // Filtra sobre a lista completa (não a filtrada) pra seleção sobreviver a
    // mudança de filtro. Defensivo: ignora ids que sumiram + vendas pagas.
    const selectedSalesForReport = sales
        .filter(s => selectedIds.has(s.id) && s.status === 'pending')
        .map(s => {
            const { client } = parseSale(s.description)
            return {
                id: s.id,
                client,
                date: s.date,
                total: s.amount,
                items: Array.isArray(s.items_snapshot) ? s.items_snapshot : [],
                observation: s.observation || null,
            }
        })
    const selectedTotal = selectedSalesForReport.reduce((acc, s) => acc + (Number(s.total) || 0), 0)

    const openConsolidated = () => {
        if (selectedSalesForReport.length === 0) return
        setConsolidatedOpen(true)
    }
    const handlePrintConsolidated = () => {
        if (selectedSalesForReport.length === 0) return
        window.print()
    }

    // ----- Exclusão de venda -----
    const handleDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/pdv/sales/${deleteTarget.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ restock: restockOnDelete }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
            toast.success(
                restockOnDelete
                    ? `Venda excluída. ${json.restocked || 0} item(ns) devolvido(s) ao estoque.`
                    : 'Venda excluída (sem estorno de estoque).'
            )
            // Remove localmente + limpa seleção/modais e ressincroniza o SSR.
            const removedId = deleteTarget.id
            setSales(prev => prev.filter(s => s.id !== removedId))
            setSelectedIds(prev => {
                const next = new Set(prev)
                next.delete(removedId)
                return next
            })
            if (selectedSale?.id === removedId) setSelectedSale(null)
            setDeleteTarget(null)
            router.refresh()
        } catch (e) {
            toast.error('Erro ao excluir venda: ' + e.message)
        } finally {
            setDeleting(false)
        }
    }

    // Abre o modal de exclusão; default do estorno = baixou estoque? Sim na
    // maioria das vendas, então começa marcado.
    const openDelete = (sale) => {
        setRestockOnDelete(true)
        setDeleteTarget(sale)
    }

    return (
        <>
        <div className="w-full bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-800 print:hidden">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Vendas do PDV</h2>
                    <p className="text-sm text-gray-400">Vendas do balcão. O botão Ver mostra os itens e permite imprimir.</p>
                </div>
                <Link
                    href="/pdv"
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                >
                    Nova Venda
                </Link>
            </div>

            <div className="mb-4 relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Buscar por cliente, descrição, nº ou valor..."
                    className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg pl-9 pr-9 py-2.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition"
                />
                {searchText && (
                    <button
                        type="button"
                        onClick={() => setSearchText('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition"
                        title="Limpar busca"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="mb-4 flex gap-2 overflow-x-auto pb-2 items-center">
                {['Todas', 'Pagas', 'Em aberto'].map(status => (
                    <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${filterStatus === status
                            ? 'bg-red-600 text-white border-red-500'
                            : 'bg-neutral-800 text-gray-400 border-neutral-700 hover:border-gray-500'
                            }`}
                    >
                        {status}
                    </button>
                ))}
                {(searchText || filterStatus !== 'Todas' || dateStart || dateEnd) && (
                    <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">
                        {filteredSales.length} de {sales.length}
                    </span>
                )}
            </div>

            {/* Range de data (De / Até) sobre a data da venda. */}
            <div className="mb-6 flex flex-wrap gap-3 items-end bg-black border border-neutral-800 rounded-lg p-3">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Data da venda — De</label>
                    <input
                        type="date"
                        value={dateStart}
                        max={dateEnd || undefined}
                        onChange={(e) => setDateStart(e.target.value)}
                        className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg p-2 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Até</label>
                    <input
                        type="date"
                        value={dateEnd}
                        min={dateStart || undefined}
                        onChange={(e) => setDateEnd(e.target.value)}
                        className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg p-2 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    />
                </div>
                {(dateStart || dateEnd) && (
                    <button
                        type="button"
                        onClick={() => { setDateStart(''); setDateEnd('') }}
                        className="text-xs text-red-400 hover:text-red-300 underline px-2 py-2 whitespace-nowrap"
                    >
                        Limpar data
                    </button>
                )}
            </div>

            {sales.length === 0 ? (
                <div className="text-center py-10 text-gray-500 border border-dashed border-neutral-800 rounded-lg">
                    Nenhuma venda de PDV encontrada.
                </div>
            ) : filteredSales.length === 0 ? (
                <div className="text-center py-10 text-gray-500 border border-dashed border-neutral-800 rounded-lg">
                    Nenhuma venda para os filtros aplicados.
                    <button
                        type="button"
                        onClick={() => { setSearchText(''); setFilterStatus('Todas'); setDateStart(''); setDateEnd('') }}
                        className="block mx-auto mt-2 text-xs text-red-400 hover:text-red-300 underline"
                    >
                        Limpar filtros
                    </button>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-200 uppercase bg-black">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg w-10" title="Selecionar vendas em aberto para o consolidado"></th>
                                <th className="px-4 py-3">Nº</th>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Pagamento</th>
                                <th className="px-4 py-3">Total</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagination.paginatedItems.map((sale) => {
                                const { client, method } = parseSale(sale.description)
                                const badge = statusBadge(sale.status)
                                return (
                                    <tr key={sale.id} className="border-b border-neutral-800 hover:bg-neutral-800 transition-colors">
                                        <td className="px-4 py-3">
                                            {sale.status === 'pending' ? (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(sale.id)}
                                                    onChange={() => toggleSelect(sale.id)}
                                                    className="w-4 h-4 accent-red-600 cursor-pointer"
                                                    title="Incluir no consolidado de pendências"
                                                />
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-white">#{sale.id}</td>
                                        <td className="px-4 py-3">{client}</td>
                                        <td className="px-4 py-3">{sale.date ? new Date(sale.date).toLocaleDateString('pt-BR') : '—'}</td>
                                        <td className="px-4 py-3">{sale.payment_method || method || '—'}</td>
                                        <td className="px-4 py-3 font-medium text-white">{formatMoney(sale.amount)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-md text-xs border ${badge.cls}`}>{badge.label}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="inline-flex items-center gap-3 justify-end">
                                                <button
                                                    onClick={() => setSelectedSale(sale)}
                                                    className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium"
                                                >
                                                    <Eye className="w-4 h-4" /> Ver
                                                </button>
                                                <button
                                                    onClick={() => openDelete(sale)}
                                                    className="inline-flex items-center gap-1 text-red-500 hover:text-red-400 font-medium"
                                                    title="Excluir venda (estorna estoque e cancela o lançamento)"
                                                >
                                                    <Trash2 className="w-4 h-4" /> Excluir
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    <Pagination
                        page={pagination.page}
                        totalPages={pagination.totalPages}
                        pageSize={pagination.pageSize}
                        total={pagination.total}
                        onPageChange={pagination.setPage}
                        onPageSizeChange={pagination.setPageSize}
                        label="vendas"
                    />
                </div>
            )}

            {/* Barra de seleção p/ consolidado — só vendas em aberto. */}
            {selectedIds.size > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-black border border-red-700/50 rounded-xl p-4">
                    <div className="text-sm text-gray-300">
                        <span className="font-bold text-white">{selectedSalesForReport.length}</span> venda(s) em aberto selecionada(s) ·
                        {' '}Devendo <span className="font-bold text-red-400">{formatMoney(selectedTotal)}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                        <button
                            type="button"
                            onClick={clearSelection}
                            className="px-3 py-2 text-xs text-gray-400 hover:text-white underline whitespace-nowrap"
                        >
                            Limpar seleção
                        </button>
                        <button
                            type="button"
                            onClick={openConsolidated}
                            disabled={selectedSalesForReport.length === 0}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 whitespace-nowrap"
                        >
                            <FileText className="w-4 h-4" /> Consolidado
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Modal de detalhes da venda — itens + totais + imprimir. */}
        {saleView && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
                <div className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                    <div className="p-5 border-b border-neutral-800 flex justify-between items-start gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-white">Venda #{saleView.id}</h2>
                            <p className="text-sm text-gray-400 mt-0.5">
                                {saleView.client} · {saleView.date ? new Date(saleView.date).toLocaleString('pt-BR') : '—'}
                            </p>
                        </div>
                        <button
                            onClick={() => setSelectedSale(null)}
                            className="text-gray-500 hover:text-white transition"
                            title="Fechar"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-5 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                            <div className="bg-neutral-950 rounded-lg p-3 border border-neutral-800">
                                <p className="text-[10px] uppercase text-gray-500 font-semibold">Pagamento</p>
                                <p className="text-white font-medium">{saleView.method}</p>
                            </div>
                            <div className="bg-neutral-950 rounded-lg p-3 border border-neutral-800">
                                <p className="text-[10px] uppercase text-gray-500 font-semibold">Status</p>
                                <p className="text-white font-medium">{statusBadge(saleView.status).label}</p>
                            </div>
                        </div>

                        {saleView.items.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 border border-dashed border-neutral-800 rounded-lg text-sm">
                                Itens não registrados nesta venda.
                                <span className="block text-xs text-gray-600 mt-1">
                                    Vendas anteriores à atualização não guardam o detalhamento de itens.
                                </span>
                            </div>
                        ) : (
                            <div className="bg-black rounded-lg border border-neutral-800 overflow-hidden">
                                <table className="w-full text-sm text-left text-gray-400">
                                    <thead className="text-xs text-gray-200 uppercase bg-neutral-900">
                                        <tr>
                                            <th className="px-4 py-2">Produto</th>
                                            <th className="px-4 py-2 w-16 text-center">Qtd</th>
                                            <th className="px-4 py-2 w-24 text-right">Un.</th>
                                            <th className="px-4 py-2 w-24 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {saleView.items.map((it, idx) => {
                                            const qty = Number(it.quantity) || 0
                                            const price = Number(it.unit_price) || 0
                                            return (
                                                <tr key={idx} className="border-b border-neutral-800">
                                                    <td className="px-4 py-2 text-white">{it.name || it.description || 'Item'}</td>
                                                    <td className="px-4 py-2 text-center">{qty}</td>
                                                    <td className="px-4 py-2 text-right">{formatMoney(price)}</td>
                                                    <td className="px-4 py-2 text-right font-medium text-white">{formatMoney(qty * price)}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mt-4 border-t border-neutral-800 pt-4 space-y-1">
                            {Number(saleView.discountPercent) > 0 && (
                                <>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400">Subtotal:</span>
                                        <span className="text-gray-200">{formatMoney(saleView.subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-amber-300">Desconto ({saleView.discountPercent}%):</span>
                                        <span className="text-amber-300">- {formatMoney(saleView.discountAmount)}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between items-end pt-1">
                                <span className="text-gray-400 text-lg">Total:</span>
                                <span className="text-2xl font-black text-green-500">{formatMoney(saleView.total)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-5 border-t border-neutral-800 flex gap-3">
                        <button
                            onClick={() => setSelectedSale(null)}
                            className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition"
                        >
                            Fechar
                        </button>
                        <button
                            onClick={handlePrint}
                            disabled={saleView.items.length === 0}
                            title={saleView.items.length === 0 ? 'Sem itens registrados para imprimir' : 'Imprimir recibo'}
                            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-bold flex items-center justify-center gap-2 transition"
                        >
                            <Printer className="w-4 h-4" /> Imprimir / PDF
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Recibo oculto na tela; aparece só na impressão (print:flex). */}
        {saleView && (
            <PDVSalePrint
                items={saleView.items}
                clientLabel={saleView.client}
                paymentMethod={saleView.method}
                splitPayment={false}
                subtotal={saleView.subtotal}
                discountPercent={saleView.discountPercent}
                discountAmount={saleView.discountAmount}
                total={saleView.total}
                serviceDate={saleView.date}
                observation={saleView.observation}
                tenant={tenant}
            />
        )}

        {/* Modal do relatório consolidado de pendências. */}
        {consolidatedOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
                <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                    <div className="p-5 border-b border-neutral-800 flex justify-between items-start gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-white">Relatório Consolidado</h2>
                            <p className="text-sm text-gray-400 mt-0.5">
                                {selectedSalesForReport.length} venda(s) em aberto · Devendo {formatMoney(selectedTotal)}
                            </p>
                        </div>
                        <button
                            onClick={() => setConsolidatedOpen(false)}
                            className="text-gray-500 hover:text-white transition"
                            title="Fechar"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-5 space-y-3">
                        <p className="text-sm text-gray-400">Tipo de relatório:</p>
                        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${reportType === 'synthetic' ? 'border-red-500 bg-red-500/10' : 'border-neutral-700 bg-black'}`}>
                            <input
                                type="radio"
                                name="report-type"
                                checked={reportType === 'synthetic'}
                                onChange={() => setReportType('synthetic')}
                                className="mt-1 accent-red-600"
                            />
                            <span>
                                <span className="block font-bold text-white">Sintético</span>
                                <span className="block text-xs text-gray-400">Resumo: data e valor de cada venda, sem detalhar itens.</span>
                            </span>
                        </label>
                        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${reportType === 'analytic' ? 'border-red-500 bg-red-500/10' : 'border-neutral-700 bg-black'}`}>
                            <input
                                type="radio"
                                name="report-type"
                                checked={reportType === 'analytic'}
                                onChange={() => setReportType('analytic')}
                                className="mt-1 accent-red-600"
                            />
                            <span>
                                <span className="block font-bold text-white">Analítico</span>
                                <span className="block text-xs text-gray-400">Detalhado: itens de cada venda + subtotais.</span>
                            </span>
                        </label>
                    </div>

                    <div className="p-5 border-t border-neutral-800 flex gap-3">
                        <button
                            onClick={() => setConsolidatedOpen(false)}
                            className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition"
                        >
                            Fechar
                        </button>
                        <button
                            onClick={handlePrintConsolidated}
                            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition"
                        >
                            <Printer className="w-4 h-4" /> Imprimir / PDF
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Print consolidado — renderizado só com o modal aberto pra não
            conflitar com o recibo de venda individual (ambos usam print:flex). */}
        {consolidatedOpen && (
            <PDVConsolidatedPrint
                sales={selectedSalesForReport}
                reportType={reportType}
                tenant={tenant}
            />
        )}

        {/* Modal de exclusão de venda — estorno de estoque + cancelamento financeiro. */}
        {deleteTarget && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
                <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                    <div className="p-5 border-b border-neutral-800 flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
                            <Trash2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Excluir venda #{deleteTarget.id}</h2>
                            <p className="text-sm text-gray-400 mt-0.5">
                                {parseSale(deleteTarget.description).client} · {formatMoney(deleteTarget.amount)}
                            </p>
                        </div>
                    </div>
                    <div className="p-5 space-y-4">
                        <p className="text-sm text-gray-300">
                            Isso vai <strong className="text-white">cancelar o lançamento financeiro</strong> desta venda.
                            Esta ação não pode ser desfeita.
                        </p>
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-neutral-700 bg-black cursor-pointer">
                            <input
                                type="checkbox"
                                checked={restockOnDelete}
                                onChange={(e) => setRestockOnDelete(e.target.checked)}
                                className="mt-1 accent-red-600 w-4 h-4"
                            />
                            <span>
                                <span className="block font-bold text-white">Retornar itens ao estoque</span>
                                <span className="block text-xs text-gray-400">
                                    Desmarque se esta venda foi lançada sem baixar estoque (ex.: venda retroativa).
                                </span>
                            </span>
                        </label>
                    </div>
                    <div className="p-5 border-t border-neutral-800 flex gap-3">
                        <button
                            onClick={() => setDeleteTarget(null)}
                            disabled={deleting}
                            className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition"
                        >
                            <Trash2 className="w-4 h-4" /> {deleting ? 'Excluindo...' : 'Excluir venda'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    )
}

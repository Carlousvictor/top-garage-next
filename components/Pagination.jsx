"use client"
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Hook reutilizável que pagina qualquer array em memória.
// items: array já filtrado/ordenado pelo componente pai.
// defaultPageSize: tamanho inicial; o usuário pode trocar via <Pagination />.
// Retorna paginatedItems + controles + props prontos pra <Pagination />.
//
// Mudança aditiva: o pai continua tendo o array original (`items`), o hook só
// retorna uma fatia. Sem ele, comportamento idêntico ao layout antigo.
export function usePagination(items, defaultPageSize = 25) {
    const [pageSize, setPageSize] = useState(defaultPageSize)
    const [page, setPage] = useState(1)

    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    // Quando o array de entrada muda (filtro, busca, refetch), volta pra página 1
    // pra não ficar mostrando página vazia. Compara pelo total — barato e
    // suficiente pra detectar mudança real (lista nova vs reorder no mesmo set).
    useEffect(() => {
        if (page > totalPages) setPage(1)
    }, [total, totalPages, page])

    const paginatedItems = useMemo(() => {
        const start = (page - 1) * pageSize
        return items.slice(start, start + pageSize)
    }, [items, page, pageSize])

    const handlePageSizeChange = (newSize) => {
        setPageSize(newSize)
        setPage(1)
    }

    return {
        paginatedItems,
        page,
        totalPages,
        pageSize,
        total,
        setPage,
        setPageSize: handlePageSizeChange,
    }
}

// Default fixo — pode ser overridden via prop `options` em <Pagination />.
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// UI padronizada de paginação. Renderiza o seletor de tamanho da página,
// indicador "X–Y de Z" e botões prev/next. Esconde-se quando total <= menor
// opção (não há nada pra paginar) pra evitar barra visual desnecessária.
export default function Pagination({
    page,
    totalPages,
    pageSize,
    total,
    onPageChange,
    onPageSizeChange,
    options = DEFAULT_PAGE_SIZE_OPTIONS,
    label = 'itens',
}) {
    if (total <= Math.min(...options)) return null

    const start = total === 0 ? 0 : (page - 1) * pageSize + 1
    const end = Math.min(page * pageSize, total)

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm text-gray-400">
            <div className="flex items-center gap-2">
                <label htmlFor="page-size-select" className="whitespace-nowrap">
                    Por página:
                </label>
                <select
                    id="page-size-select"
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="bg-neutral-800 border border-neutral-700 text-white text-xs rounded-md px-2 py-1.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                >
                    {options.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                    Mostrando <strong className="text-gray-300">{start}–{end}</strong> de <strong className="text-gray-300">{total}</strong> {label}
                </span>
            </div>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-800 text-gray-200 text-xs font-medium hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    aria-label="Página anterior"
                >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                    Página <strong className="text-white">{page}</strong> de <strong className="text-white">{totalPages}</strong>
                </span>
                <button
                    type="button"
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-800 text-gray-200 text-xs font-medium hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    aria-label="Próxima página"
                >
                    Próxima <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

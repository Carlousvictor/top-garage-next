"use client"
import { useState } from 'react'
import StockImport from '@/components/StockImport'
import ManualStockEntry from '@/components/ManualStockEntry'
import StockEntriesList from '@/components/StockEntriesList'
import { FileText, FileCode2, History } from 'lucide-react'

export default function ImportPage() {
    const [mode, setMode] = useState('xml') // 'xml' | 'manual' | 'list'
    // Incrementado quando uma entrada é gravada com sucesso (XML ou manual).
    // O StockEntriesList observa isso pra refazer o fetch sem depender só
    // do remount do componente. Sem isso, criar nota e voltar pra aba
    // "Histórico" às vezes mostrava lista cacheada/em loading.
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    const handleEntryCreated = () => {
        setRefreshTrigger(t => t + 1)
        setMode('list')
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-white tracking-tight">Entrada de Nota Fiscal</h1>
                <p className="text-gray-400 mt-1">
                    Lance NFs no estoque por XML (automático) ou manualmente quando o XML não estiver disponível.
                </p>
            </div>

            <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 w-fit">
                    <button
                        type="button"
                        onClick={() => setMode('xml')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'xml'
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <FileCode2 className="w-4 h-4" /> Via XML
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('manual')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'manual'
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <FileText className="w-4 h-4" /> Manual
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('list')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'list'
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <History className="w-4 h-4" /> Histórico / Excluir
                    </button>
                </div>

                {mode === 'list' && (
                    <p className="text-xs text-gray-500 italic hidden sm:block">
                        * Excluir uma nota reverte as quantidades no estoque e remove os lançamentos financeiros.
                    </p>
                )}
            </div>

            {mode === 'xml' && <StockImport onEntryCreated={handleEntryCreated} />}
            {mode === 'manual' && <ManualStockEntry onEntryCreated={handleEntryCreated} />}
            {mode === 'list' && <StockEntriesList refreshTrigger={refreshTrigger} />}
        </div>
    )
}

"use client"
import { useState } from 'react'
import StockImport from '@/components/StockImport'
import ManualStockEntry from '@/components/ManualStockEntry'
import { FileText, FileCode2 } from 'lucide-react'

export default function ImportPage() {
    const [mode, setMode] = useState('xml') // 'xml' | 'manual'

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-white tracking-tight">Entrada de Nota Fiscal</h1>
                <p className="text-gray-400 mt-1">
                    Lance NFs no estoque por XML (automático) ou manualmente quando o XML não estiver disponível.
                </p>
            </div>

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
            </div>

            {mode === 'xml' ? <StockImport /> : <ManualStockEntry />}
        </div>
    )
}

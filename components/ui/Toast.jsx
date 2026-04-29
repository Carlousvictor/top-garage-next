"use client"
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const ICON = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
}

const STYLE = {
    success: 'bg-emerald-900/90 border-emerald-700 text-emerald-100',
    error: 'bg-red-900/90 border-red-700 text-red-100',
    warning: 'bg-amber-900/90 border-amber-700 text-amber-100',
    info: 'bg-blue-900/90 border-blue-700 text-blue-100',
}

export default function Toast({ id, type = 'info', message, onDismiss }) {
    const Icon = ICON[type] || Info
    const cls = STYLE[type] || STYLE.info
    return (
        <div
            role="status"
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-2xl backdrop-blur-sm ${cls} animate-in slide-in-from-right-4 fade-in duration-200`}
        >
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm leading-relaxed whitespace-pre-line">{message}</div>
            <button
                type="button"
                onClick={() => onDismiss(id)}
                className="text-current opacity-60 hover:opacity-100 transition shrink-0"
                aria-label="Fechar notificação"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}

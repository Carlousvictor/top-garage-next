"use client"
import { useEffect, useRef } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false,
    onConfirm,
    onCancel,
}) {
    const cancelBtnRef = useRef(null)

    useEffect(() => {
        if (!open) return
        cancelBtnRef.current?.focus()
        const onKey = (e) => {
            if (e.key === 'Escape') onCancel?.()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onCancel])

    if (!open) return null

    const Icon = danger ? AlertTriangle : HelpCircle
    const iconColor = danger ? 'text-red-400' : 'text-blue-400'
    const confirmBtnCls = danger
        ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
        : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500'

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={onCancel}
        >
            <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-150"
            >
                <div className="flex items-start gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${danger ? 'bg-red-500/10' : 'bg-blue-500/10'} shrink-0`}>
                        <Icon className={`w-6 h-6 ${iconColor}`} />
                    </div>
                    <div className="flex-1 pt-0.5">
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                    </div>
                </div>
                <div className="text-sm text-gray-300 leading-relaxed mb-6 whitespace-pre-line">
                    {message}
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        ref={cancelBtnRef}
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-gray-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-neutral-500"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition focus:outline-none focus:ring-2 ${confirmBtnCls}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

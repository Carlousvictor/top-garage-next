"use client"
import { createContext, useContext, useState, useCallback, useRef } from 'react'
import ConfirmDialog from '../components/ui/ConfirmDialog'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
    const [state, setState] = useState({ open: false })
    const pendingResolveRef = useRef(null)

    const confirm = useCallback((options) => {
        return new Promise((resolve) => {
            // If another confirm is open, resolve it as cancelled before opening the new one.
            if (pendingResolveRef.current) {
                pendingResolveRef.current(false)
            }
            pendingResolveRef.current = resolve

            const finish = (result) => {
                if (pendingResolveRef.current === resolve) {
                    pendingResolveRef.current = null
                    resolve(result)
                }
                setState(s => ({ ...s, open: false }))
            }

            setState({
                open: true,
                title: options.title || 'Confirmar',
                message: options.message || '',
                confirmLabel: options.confirmLabel,
                cancelLabel: options.cancelLabel,
                danger: options.danger || false,
                onConfirm: () => finish(true),
                onCancel: () => finish(false),
            })
        })
    }, [])

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <ConfirmDialog
                open={state.open}
                title={state.title}
                message={state.message}
                confirmLabel={state.confirmLabel}
                cancelLabel={state.cancelLabel}
                danger={state.danger}
                onConfirm={state.onConfirm}
                onCancel={state.onCancel}
            />
        </ConfirmContext.Provider>
    )
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext)
    if (!ctx) throw new Error('useConfirm deve ser usado dentro de <ConfirmProvider>')
    return ctx
}

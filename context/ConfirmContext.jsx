"use client"
import { createContext, useContext, useState, useCallback } from 'react'
import ConfirmDialog from '../components/ui/ConfirmDialog'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
    const [state, setState] = useState({ open: false })

    const confirm = useCallback((options) => {
        return new Promise((resolve) => {
            setState({
                open: true,
                title: options.title || 'Confirmar',
                message: options.message || '',
                confirmLabel: options.confirmLabel,
                cancelLabel: options.cancelLabel,
                danger: options.danger || false,
                onConfirm: () => { setState(s => ({ ...s, open: false })); resolve(true) },
                onCancel: () => { setState(s => ({ ...s, open: false })); resolve(false) },
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

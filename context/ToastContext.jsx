"use client"
import { createContext, useContext, useState, useCallback, useRef } from 'react'
import ToastContainer from '../components/ui/ToastContainer'

const DURATIONS = { success: 4000, info: 4000, warning: 5000, error: 6000 }

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([])
    const idRef = useRef(0)

    const dismiss = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const push = useCallback((type, message) => {
        const id = ++idRef.current
        setToasts(prev => [...prev, { id, type, message }])
        const ms = DURATIONS[type] ?? 4000
        setTimeout(() => dismiss(id), ms)
        return id
    }, [dismiss])

    const api = {
        success: (msg) => push('success', msg),
        error: (msg) => push('error', msg),
        warning: (msg) => push('warning', msg),
        info: (msg) => push('info', msg),
    }

    return (
        <ToastContext.Provider value={api}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    )
}

export function useToast() {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
    return ctx
}

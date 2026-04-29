"use client"
import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import ToastContainer from '../components/ui/ToastContainer'

const DURATIONS = { success: 4000, info: 4000, warning: 5000, error: 6000 }

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([])
    const idRef = useRef(0)
    const timersRef = useRef(new Map())

    const dismiss = useCallback((id) => {
        const timer = timersRef.current.get(id)
        if (timer) {
            clearTimeout(timer)
            timersRef.current.delete(id)
        }
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const push = useCallback((type, message) => {
        const id = ++idRef.current
        setToasts(prev => [...prev, { id, type, message }])
        const ms = DURATIONS[type] ?? 4000
        const timer = setTimeout(() => dismiss(id), ms)
        timersRef.current.set(id, timer)
        return id
    }, [dismiss])

    // Cleanup all pending timers on unmount.
    useEffect(() => {
        const timers = timersRef.current
        return () => {
            for (const t of timers.values()) clearTimeout(t)
            timers.clear()
        }
    }, [])

    const api = useMemo(() => ({
        success: (msg) => push('success', msg),
        error: (msg) => push('error', msg),
        warning: (msg) => push('warning', msg),
        info: (msg) => push('info', msg),
    }), [push])

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

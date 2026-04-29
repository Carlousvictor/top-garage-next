"use client"
import Toast from './Toast'

export default function ToastContainer({ toasts, onDismiss }) {
    if (toasts.length === 0) return null
    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-auto">
            {toasts.map(t => (
                <Toast key={t.id} {...t} onDismiss={onDismiss} />
            ))}
        </div>
    )
}

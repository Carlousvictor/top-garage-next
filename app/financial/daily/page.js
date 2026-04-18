import { Suspense } from 'react'
import DailyMovement from '@/components/DailyMovement'

export default function DailyMovementPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-400 animate-pulse">Carregando movimento...</div>}>
            <DailyMovement />
        </Suspense>
    )
}

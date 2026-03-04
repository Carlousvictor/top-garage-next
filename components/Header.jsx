"use client"
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'

export default function Header() {
    const pathname = usePathname()
    const { tenant, loading } = useAuth()

    // Hide header on login page to allow explicit centering there
    if (pathname === '/login') return null

    if (loading) {
        return <header className="flex-shrink-0 h-16 w-48" />
    }

    const logoSrc = tenant?.logo_url || '/logo.png'
    const name = tenant?.name || 'Top Garage'

    return (
        <header className="flex-shrink-0 flex items-center h-20 w-64 shrink-0 p-2 md:pl-4">
            <div className="relative w-full h-full">
                <Image
                    src={logoSrc}
                    alt={name}
                    fill
                    className="object-contain object-left"
                    priority
                />
            </div>
        </header>
    )
}

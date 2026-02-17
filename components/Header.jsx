"use client"
import { usePathname } from 'next/navigation'
import Image from 'next/image'

export default function Header() {
    const pathname = usePathname()

    // Hide header on login page to allow explicit centering there
    if (pathname === '/login') return null

    return (
        <header className="flex-shrink-0">
            <div className="relative w-72 h-24">
                <Image
                    src="/logo.png"
                    alt="Top Garage"
                    fill
                    className="object-contain object-left"
                    priority
                />
            </div>
        </header>
    )
}

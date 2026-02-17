"use client"
import { usePathname } from 'next/navigation'
import Image from 'next/image'

export default function Header() {
    const pathname = usePathname()

    // Hide header on login page to allow explicit centering there
    if (pathname === '/login') return null

    return (
        <header className="flex-shrink-0 ml-4">
            <div className="relative w-96 h-32">
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

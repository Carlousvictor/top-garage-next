"use client"
import { usePathname } from 'next/navigation'
import Image from 'next/image'

export default function Header() {
    const pathname = usePathname()

    // Hide header on login page to allow explicit centering there
    if (pathname === '/login') return null

    return (
        <header className="mb-10 text-center">
            <div className="relative w-full h-48 mx-auto">
                <Image
                    src="/logo.png"
                    alt="Top Garage"
                    fill
                    className="object-contain"
                    priority
                />
            </div>
        </header>
    )
}

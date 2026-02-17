"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
    const pathname = usePathname()
    const { signOut } = useAuth()

    if (pathname === '/login' || pathname === '/signup') return null

    const isActive = (path) => {
        if (path === '/' && pathname === '/') return true
        if (path !== '/' && pathname.startsWith(path)) return true
        return false
    }

    const navItems = [
        { name: 'Ordens de Serviço', path: '/os' },
        { name: 'Cadastro de Veículo', path: '/vehicles' },
        { name: 'Estoque', path: '/stock' },
        { name: 'Serviços', path: '/services' },
        { name: 'Importação XML', path: '/import' },
        { name: 'Financeiro', path: '/financial' },
    ]

    return (
        <div className="w-full flex justify-center space-x-4 bg-neutral-900 rounded-lg border border-red-900/30 items-center px-2 py-1">
            {navItems.map((item) => (
                <Link
                    key={item.path}
                    href={item.path}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${isActive(item.path)
                        ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                        : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                        }`}
                >
                    {item.name}
                </Link>
            ))}
            <button
                onClick={signOut}
                className="px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap text-red-500 hover:text-white hover:bg-red-900/50 border border-transparent hover:border-red-500/50"
            >
                Sair
            </button>
        </div>
    )
}

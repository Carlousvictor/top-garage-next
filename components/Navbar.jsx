"use client"

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
        { name: 'OS Terceiros', path: '/thirds' },
        { name: 'PDV (Balcão)', path: '/pdv' },
        { name: 'CRM (Pós-Venda)', path: '/crm' },
        { name: 'Clientes', path: '/clients' },
        { name: 'Cadastro de Veículo', path: '/vehicles' },
        { name: 'Estoque', path: '/stock' },
        { name: 'Serviços', path: '/services' },
        { name: 'Importação XML', path: '/import' },
        { name: 'Financeiro', path: '/financial' },
    ]

    return (
        <nav className="w-full xl:w-auto flex-grow flex justify-start overflow-x-auto gap-2 bg-neutral-900 rounded-lg border border-red-900/30 items-center px-4 py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            {navItems.map((item) => (
                <a
                    key={item.path}
                    href={item.path}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${isActive(item.path)
                        ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                        : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                        }`}
                >
                    {item.name}
                </a>
            ))}
            <button
                onClick={signOut}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap text-red-500 hover:text-white hover:bg-red-900/50 flex-shrink-0 xl:ml-auto"
            >
                Sair
            </button>
        </nav>
    )
}

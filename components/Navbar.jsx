"use client"

import { usePathname } from 'next/navigation'
import Link from 'next/link'

export default function Navbar() {
    const pathname = usePathname()

    if (pathname === '/login' || pathname === '/signup' || pathname === '/' || pathname.startsWith('/admin')) return null

    const isActive = (path) => {
        if (path === '/' && pathname === '/') return true
        // Sub-páginas de Financeiro (daily, reports) acendem o item "Financeiro".
        if (path !== '/' && pathname.startsWith(path)) return true
        return false
    }

    // Apenas módulos de topo. Sub-páginas (Movimento Diário, Relatórios, Importação XML)
    // ficam dentro de seus respectivos módulos pais — Financeiro e Estoque.
    const navItems = [
        { name: 'Início', path: '/' },
        { name: 'Ordens de Serviço', path: '/os' },
        { name: 'OS Terceiros', path: '/thirds' },
        { name: 'PDV (Balcão)', path: '/pdv' },
        { name: 'CRM (Pós-Venda)', path: '/crm' },
        { name: 'Clientes', path: '/clients' },
        { name: 'Estoque', path: '/stock' },
        { name: 'Serviços', path: '/services' },
        { name: 'Financeiro', path: '/financial' },
    ]

    return (
        <nav className="w-full xl:w-auto flex justify-start overflow-x-auto gap-1 bg-neutral-900 rounded-lg border border-red-900/30 items-center px-3 py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            {navItems.map((item) => (
                <Link
                    key={item.path}
                    href={item.path}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${isActive(item.path)
                        ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                        : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                        }`}
                >
                    {item.name}
                </Link>
            ))}
        </nav>
    )
}

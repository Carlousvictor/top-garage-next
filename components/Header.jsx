"use client"
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

import { LogOut, Shield } from 'lucide-react'

export default function Header() {
    const pathname = usePathname()
    const { tenant, loading, signOut, role } = useAuth()

    // Hide header on login page to allow explicit centering there
    if (pathname === '/login') return null

    const isAdminMode = pathname.startsWith('/admin')
    const logoSrc = tenant?.logo_url
    const name = tenant?.name || 'Garaje.io'

    return (
        <header className="flex-shrink-0 flex items-center justify-between h-20 w-full xl:w-64 shrink-0 mb-4 xl:mb-0">
            {/* Brand slot: prioriza logo do tenant; fallback é tipografia Garaje.io (identidade do sistema) */}
            {isAdminMode ? (
                <div className="flex items-center h-full">
                    <h1 className="text-2xl font-black text-white uppercase tracking-tight ml-2">
                        GARAJE<span className="text-red-500">.</span>IO
                    </h1>
                </div>
            ) : loading ? (
                <div className="h-20 w-48 flex items-center">
                    <div className="h-8 w-32 bg-neutral-800 rounded animate-pulse" />
                </div>
            ) : logoSrc ? (
                <div className="relative h-20 w-48">
                    <Image
                        src={logoSrc}
                        alt={name}
                        fill
                        className="object-contain object-left"
                        priority
                    />
                </div>
            ) : (
                <div className="flex items-center h-20 w-48">
                    <h1 className="text-2xl font-black text-white uppercase tracking-tight">
                        GARAJE<span className="text-red-500">.</span>IO
                    </h1>
                </div>
            )}

            {/* Área direita: atalho pra /admin (se super_admin fora do /admin) + Sair */}
            <div className="flex items-center gap-2">
                {role === 'super_admin' && !isAdminMode && (
                    <Link
                        href="/admin"
                        className="flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2 rounded-md border border-amber-500/30 shadow-sm"
                        title="Voltar ao painel de Super Admin"
                    >
                        <Shield size={16} />
                        <span className="text-sm font-medium uppercase tracking-wider">Admin</span>
                    </Link>
                )}
                <button
                    onClick={signOut}
                    className="flex items-center gap-2 text-neutral-400 hover:text-red-500 transition-colors bg-neutral-900/40 hover:bg-neutral-900 px-4 py-2 rounded-md border border-neutral-800/60 shadow-sm"
                    title="Sair do Sistema"
                >
                    <span className="text-sm font-medium uppercase tracking-wider">Sair</span>
                    <LogOut size={18} />
                </button>
            </div>
        </header>
    )
}

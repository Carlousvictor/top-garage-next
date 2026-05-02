"use client"
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

import { LogOut, Shield } from 'lucide-react'

// Fallback de marca quando NÃO temos logo do tenant (raro — só em /admin ou
// edge case com tenant sem logo_url cadastrado). Mesma var que o /login usa.
const RAW_BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME || 'TOP GARAGE.RJ').toUpperCase()
function BrandFallback({ className }) {
    const dotIdx = RAW_BRAND_NAME.indexOf('.')
    if (dotIdx === -1) {
        return <h1 className={className}>{RAW_BRAND_NAME}</h1>
    }
    const left = RAW_BRAND_NAME.slice(0, dotIdx)
    const right = RAW_BRAND_NAME.slice(dotIdx + 1)
    return (
        <h1 className={className}>
            {left}<span className="text-red-500">.</span>{right}
        </h1>
    )
}

export default function Header() {
    const pathname = usePathname()
    const { tenant, loading, signOut, role } = useAuth()

    // Hide header on login page to allow explicit centering there
    if (pathname === '/login') return null

    const isAdminMode = pathname.startsWith('/admin')
    const logoSrc = tenant?.logo_url
    // NÃO use 'Garaje.io' como fallback visível pra usuários do Top Garage —
    // confunde quando aparece após deploy/refresh enquanto o tenant carrega.
    // Sem nome de tenant: mantém o brand institucional GARAJE.IO (que é a
    // marca do sistema em si), mas só renderiza quando loading=false.
    const name = tenant?.name || ''

    return (
        <header className="flex-shrink-0 flex items-center justify-between h-20 w-full xl:w-64 shrink-0 mb-4 xl:mb-0">
            {/* Brand slot: prioriza logo do tenant; fallback é tipografia configurável
                via NEXT_PUBLIC_BRAND_NAME. Antes era "GARAJE.IO" hardcoded — mudou
                porque clientes white-label (ex: Top Garage RJ) não querem ver a
                marca do platform na própria interface. */}
            {isAdminMode ? (
                <div className="flex items-center h-full ml-2">
                    <BrandFallback className="text-2xl font-black text-white uppercase tracking-tight" />
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
                    <BrandFallback className="text-2xl font-black text-white uppercase tracking-tight" />
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

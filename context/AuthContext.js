"use client"
import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const AuthContext = createContext({})

const EMPTY_AUTH = { user: null, tenantId: null, tenant: null, role: null, actingTenantId: null }

export const AuthProvider = ({ children, initialAuth = EMPTY_AUTH }) => {
    const supabase = createClient()
    const router = useRouter()
    // Hidrata com dados resolvidos no servidor (app/layout.js → getInitialAuth).
    // Sem isso, o cliente começava com tudo null e mostrava "Garaje.io" /
    // skeletons por 1-2s depois de cada deploy ou refresh hard. Com SSR-pré-hidratado,
    // o HTML inicial já tem o nome certo e o React hidrata sem janela de flash.
    const [user, setUser] = useState(initialAuth.user)
    const [tenantId, setTenantId] = useState(initialAuth.tenantId)
    const [tenant, setTenant] = useState(initialAuth.tenant)
    const [role, setRole] = useState(initialAuth.role)
    // Tenant que o super_admin está inspecionando (NULL = modo neutro/admin).
    // Usado pra exibir o botão "Sair da empresa" no Header.
    const [actingTenantId, setActingTenantId] = useState(initialAuth.actingTenantId)
    // loading=false quando já temos user resolvido pelo servidor — sem precisar
    // esperar a primeira ida ao /api/auth/profile.
    const [loading, setLoading] = useState(!initialAuth.user)

    useEffect(() => {
        // Subscrevemos síncronamente pra poder devolver o cleanup do useEffect de verdade.
        // O bug anterior tinha o `return () => unsubscribe()` dentro de uma função async,
        // então nunca chegava ao useEffect — subscriptions duplicadas acumulavam em cada
        // remount (Strict Mode, HMR), causando races e AbortError.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                setUser(session.user)
                // Se já temos tenant via SSR, não refetch desnecessário.
                // Refetch só quando event é SIGNED_IN (login novo) ou TOKEN_REFRESHED
                // pode mudar permissões — refresh só se faltar tenant.
                if (event === 'SIGNED_IN' || !tenant) {
                    await fetchTenantData()
                } else {
                    setLoading(false)
                }
            } else {
                setUser(null)
                setTenantId(null)
                setTenant(null)
                setRole(null)
                setActingTenantId(null)
                setLoading(false)
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login'
                }
            }
        })

        // Bootstrap só se NÃO veio user via SSR (caso edge: cliente sem cookie
        // mas com auth válida no Supabase, raríssimo; também usado em dev/HMR).
        const bootstrap = async () => {
            if (initialAuth.user) {
                setLoading(false)
                return
            }
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
                setUser(session.user)
                await fetchTenantData()
            } else {
                setLoading(false)
            }
        }
        bootstrap()

        return () => {
            subscription.unsubscribe()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const fetchTenantData = async () => {
        try {
            // Usa API route server-side para evitar bloqueio de RLS no cliente
            const res = await fetch('/api/auth/profile', { credentials: 'include' })
            if (!res.ok) return

            const profile = await res.json()
            // role e actingTenantId sempre atualizam — inclusive quando tenantId
            // é null (super_admin em modo neutro), pra que o Header saiba o estado.
            setRole(profile.role)
            setActingTenantId(profile.actingTenantId ?? null)
            setTenantId(profile.tenantId ?? null)

            if (profile.tenantId) {
                const { data: tenantData } = await supabase
                    .from('tenants')
                    .select('name, logo_url, primary_color, document')
                    .eq('id', profile.tenantId)
                    .maybeSingle()

                if (tenantData) setTenant(tenantData)
            } else {
                setTenant(null)
            }
        } catch (error) {
            console.error('Error fetching tenant data:', error)
        } finally {
            setLoading(false)
        }
    }

    const signOut = async () => {
        // Form POST pra /auth/signout — o server limpa os cookies httpOnly
        // e o 303 redireciona pra /login. Fazer só via cliente causava o bug
        // de "logout não funciona" porque o middleware relia na cookie antiga.
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = '/auth/signout'
        document.body.appendChild(form)
        form.submit()
    }

    return (
        <AuthContext.Provider value={{ user, tenantId, companyId: tenantId, tenant, role, actingTenantId, signOut, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)

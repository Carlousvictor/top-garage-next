"use client"
import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
    const supabase = createClient()
    const router = useRouter()
    const [user, setUser] = useState(null)
    const [tenantId, setTenantId] = useState(null)
    const [tenant, setTenant] = useState(null)
    const [role, setRole] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Subscrevemos síncronamente pra poder devolver o cleanup do useEffect de verdade.
        // O bug anterior tinha o `return () => unsubscribe()` dentro de uma função async,
        // então nunca chegava ao useEffect — subscriptions duplicadas acumulavam em cada
        // remount (Strict Mode, HMR), causando races e AbortError.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                setUser(session.user)
                await fetchTenantData()
            } else {
                setUser(null)
                setTenantId(null)
                setTenant(null)
                setRole(null)
                setLoading(false)
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login'
                }
            }
        })

        const bootstrap = async () => {
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
    }, [])

    const fetchTenantData = async () => {
        try {
            // Usa API route server-side para evitar bloqueio de RLS no cliente
            const res = await fetch('/api/auth/profile', { credentials: 'include' })
            if (!res.ok) return

            const profile = await res.json()
            if (profile.tenantId) {
                setTenantId(profile.tenantId)
                setRole(profile.role)

                const { data: tenantData } = await supabase
                    .from('tenants')
                    .select('name, logo_url, primary_color')
                    .eq('id', profile.tenantId)
                    .single()

                if (tenantData) setTenant(tenantData)
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
        <AuthContext.Provider value={{ user, tenantId, companyId: tenantId, tenant, role, signOut, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)

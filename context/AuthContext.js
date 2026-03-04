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
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const initializeAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession()

            if (session?.user) {
                setUser(session.user)
                await fetchTenantData(session.user.id)
            } else {
                setLoading(false)
            }

            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                    setUser(session.user)
                    await fetchTenantData(session.user.id)
                } else {
                    setUser(null)
                    setTenantId(null)
                    setTenant(null)
                    setLoading(false)
                    router.push('/login')
                }
            })

            return () => {
                subscription.unsubscribe()
            }
        }

        initializeAuth()
    }, [])

    const fetchTenantData = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select(`
                    tenant_id,
                    tenants (name, logo_url, primary_color)
                `)
                .eq('user_id', userId)
                .single()

            if (data) {
                setTenantId(data.tenant_id)
                setTenant(data.tenants)
            }
        } catch (error) {
            console.error('Error fetching tenant data:', error)
        } finally {
            setLoading(false)
        }
    }

    const signOut = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <AuthContext.Provider value={{ user, tenantId, companyId: tenantId, tenant, signOut, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)

"use client"
import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
    const supabase = createClient()
    const router = useRouter()
    const [user, setUser] = useState(null)
    const [companyId, setCompanyId] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const initializeAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession()

            if (session?.user) {
                setUser(session.user)
                await fetchCompanyId(session.user.id)
            } else {
                setLoading(false)
            }

            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                    setUser(session.user)
                    await fetchCompanyId(session.user.id)
                } else {
                    setUser(null)
                    setCompanyId(null)
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

    const fetchCompanyId = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('company_id')
                .eq('user_id', userId)
                .single()

            if (data) {
                setCompanyId(data.company_id)
            }
        } catch (error) {
            console.error('Error fetching company ID:', error)
        } finally {
            setLoading(false)
        }
    }

    const signOut = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <AuthContext.Provider value={{ user, companyId, signOut, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)

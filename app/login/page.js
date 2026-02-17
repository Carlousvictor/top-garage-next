"use client"
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const router = useRouter()
    const supabase = createClient()

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const emailToUse = username.includes('@') ? username : `${username}@topgarage.com`

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: emailToUse,
                password,
            })

            if (error) throw error

            router.push('/')
            router.refresh()
        } catch (err) {
            setError('Falha na autenticação.')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-black">
            <div className="w-full max-w-sm p-4">
                <div className="text-center mb-6">
                    <div className="relative w-40 h-20 mx-auto">
                        <Image
                            src="/logo.png"
                            alt="Top Garage RJ"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Usuário</label>
                        <input
                            type="text"
                            required
                            className="block w-full rounded-md border-neutral-800 bg-neutral-900 py-2 px-3 text-white placeholder:text-gray-600 focus:ring-1 focus:ring-red-900 focus:border-red-900 sm:text-sm"
                            placeholder="Usuario"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Senha</label>
                        <input
                            type="password"
                            required
                            className="block w-full rounded-md border-neutral-800 bg-neutral-900 py-2 px-3 text-white placeholder:text-gray-600 focus:ring-1 focus:ring-red-900 focus:border-red-900 sm:text-sm"
                            placeholder="••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="text-xs text-red-500 text-center">{error}</div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-800 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-900 disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Entrar' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    )
}

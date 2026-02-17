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

            router.push('/') // Redirect to home/dashboard on success
            router.refresh()
        } catch (err) {
            setError('Falha na autenticação. Verifique suas credenciais.')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-br from-neutral-900 via-black to-neutral-900 relative overflow-hidden">

            {/* Background Texture/Effect */}
            <div className="absolute inset-0 opacity-10 pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #333 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            </div>

            {/* Main Card */}
            <div className="w-full max-w-md bg-neutral-900/80 backdrop-blur-md rounded-2xl shadow-2xl border border-neutral-800 overflow-hidden relative z-10 transition-all hover:border-red-900/50">

                {/* Header Section */}
                <div className="pt-8 pb-6 px-8 text-center border-b border-neutral-800 bg-black/40">
                    <div className="relative w-48 h-24 mx-auto mb-4">
                        {/* Ensure width/height ratio matches your logo */}
                        <Image
                            src="/logo.png"
                            alt="Top Garage RJ"
                            fill
                            className="object-contain drop-shadow-lg"
                            priority
                        />
                    </div>
                    <h2 className="text-xl font-bold text-gray-100 tracking-wider uppercase">
                        Acesso Restrito
                    </h2>
                    <p className="text-xs text-red-500 font-medium mt-1 uppercase tracking-widest">
                        Sistema de Gestão Automotiva
                    </p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleLogin} className="space-y-6 p-8">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label htmlFor="username" className="block text-xs font-medium text-gray-400 uppercase tracking-wide ml-1">Usuário ou E-mail</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                    </svg>
                                </span>
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    autoComplete="username"
                                    required
                                    className="block w-full rounded-lg border-none bg-black/50 py-3 pl-10 pr-3 text-white placeholder:text-gray-600 focus:ring-2 focus:ring-red-600 transition-all sm:text-sm shadow-inner"
                                    placeholder="seu.usuario"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide ml-1">Senha de Acesso</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                                    </svg>
                                </span>
                                <input
                                    type="password"
                                    required
                                    className="block w-full rounded-lg border-none bg-black/50 py-3 pl-10 pr-3 text-white placeholder:text-gray-600 focus:ring-2 focus:ring-red-600 transition-all sm:text-sm shadow-inner"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 p-3 rounded-lg border border-red-900/30">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="group relative flex w-full justify-center items-center gap-2 rounded-lg bg-red-700 py-3 px-4 text-sm font-bold text-white uppercase tracking-wider transition-all hover:bg-red-600 hover:shadow-lg hover:shadow-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed mt-6 transform active:scale-[0.98]"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Autenticando...
                            </>
                        ) : (
                            <>
                                Acessar Painel
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 transition-transform group-hover:translate-x-1">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                                </svg>
                            </>
                        )}
                    </button>
                </form>

                {/* Footer Section */}
                <div className="bg-black/40 px-8 py-4 text-center border-t border-neutral-800">
                    <p className="text-xs text-gray-500">
                        Não possui acesso?{' '}
                        <Link href="/signup" className="font-bold text-red-500 hover:text-red-400 hover:underline transition-colors">
                            Solicite uma conta
                        </Link>
                    </p>
                </div>
            </div>

            {/* Branding Footer */}
            <div className="absolute bottom-4 text-center">
                <p className="text-[10px] text-neutral-600 uppercase tracking-widest">
                    &copy; 2024 Top Garage RJ • v1.2.0 (Next.js)
                </p>
            </div>
        </div>
    )
}

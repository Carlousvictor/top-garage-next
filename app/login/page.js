"use client"
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { FileText, Wrench, CircleDollarSign, Loader2, ArrowRight } from 'lucide-react'

const features = [
    {
        icon: FileText,
        title: 'Importação automática de NFe',
        desc: 'XML entra com produtos, parcelas e contas a pagar em um clique.'
    },
    {
        icon: Wrench,
        title: 'OS e PDV integrados',
        desc: 'Ordem de Serviço e Ponto de Venda falando com o estoque em tempo real.'
    },
    {
        icon: CircleDollarSign,
        title: 'Financeiro consolidado',
        desc: 'Receitas, despesas, fluxo de caixa e relatórios em um só lugar.'
    }
]

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const router = useRouter()
    const supabase = createClient()

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password })

            if (error) throw error

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', data.user.id)
                .single()

            if (profile?.role === 'super_admin') {
                router.push('/admin')
            } else {
                router.push('/')
            }
            router.refresh()
        } catch (err) {
            setError('Email ou senha inválidos.')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex bg-neutral-950 overflow-hidden">
            {/* LEFT: brand + pitch (escondido em mobile) */}
            <div className="hidden lg:flex lg:w-3/5 relative flex-col justify-between p-12 overflow-hidden">
                {/* Gradientes decorativos — mesma linguagem dos cards do dashboard */}
                <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] bg-red-600 rounded-full opacity-20 blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 -right-40 w-[28rem] h-[28rem] bg-blue-600 rounded-full opacity-10 blur-3xl pointer-events-none"></div>
                <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-orange-500 rounded-full opacity-10 blur-3xl pointer-events-none"></div>

                {/* Topo: logo */}
                <div className="relative z-10 animate-in fade-in slide-in-from-left-4 duration-700">
                    <h1 className="text-7xl font-black text-white tracking-tight leading-none">
                        GARAJE<span className="text-red-500">.</span>IO
                    </h1>
                    <p className="mt-4 text-xl text-gray-400 max-w-md font-light">
                        Gestão completa da sua oficina.
                    </p>
                </div>

                {/* Meio: features */}
                <div className="relative z-10 space-y-6 max-w-md animate-in fade-in slide-in-from-left-4 duration-700 delay-150">
                    {features.map((f, i) => (
                        <div key={i} className="flex gap-4 items-start group">
                            <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl group-hover:border-red-500/40 group-hover:bg-red-500/15 transition-colors">
                                <f.icon className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-white font-semibold text-base">{f.title}</h3>
                                <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{f.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Rodapé: copyright */}
                <div className="relative z-10 text-xs text-gray-600 uppercase tracking-widest animate-in fade-in duration-700 delay-300">
                    &copy; 2026 Garaje.io &middot; Feito pra oficinas mecânicas do Brasil
                </div>
            </div>

            {/* RIGHT: form */}
            <div className="w-full lg:w-2/5 flex items-center justify-center p-6 sm:p-8 relative">
                {/* Gradiente de fundo só em mobile (pra não deixar cru) */}
                <div className="lg:hidden absolute -top-32 -right-32 w-96 h-96 bg-red-600 rounded-full opacity-15 blur-3xl pointer-events-none"></div>
                <div className="lg:hidden absolute -bottom-32 -left-32 w-96 h-96 bg-blue-600 rounded-full opacity-10 blur-3xl pointer-events-none"></div>

                <div className="w-full max-w-md relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* Logo only on mobile — no desktop o logo fica no lado esquerdo */}
                    <div className="lg:hidden text-center mb-8">
                        <h1 className="text-5xl font-black text-white tracking-tight">
                            GARAJE<span className="text-red-500">.</span>IO
                        </h1>
                        <p className="mt-2 text-sm text-gray-500">Gestão completa da sua oficina</p>
                    </div>

                    <div className="bg-neutral-900/70 backdrop-blur-xl border border-neutral-800 rounded-2xl p-8 shadow-2xl shadow-black/40">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-white">Acessar sistema</h2>
                            <p className="text-sm text-gray-400 mt-1">Entre com seu email e senha.</p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                                    Email
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="block w-full px-4 py-3 bg-black border border-neutral-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition-colors placeholder:text-neutral-600"
                                    placeholder="voce@empresa.com.br"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                                    Senha
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    className="block w-full px-4 py-3 bg-black border border-neutral-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition-colors placeholder:text-neutral-600"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>

                            {error && (
                                <div className="text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2.5">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold rounded-lg shadow-lg shadow-red-900/30 hover:shadow-red-900/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Entrando...
                                    </>
                                ) : (
                                    <>
                                        Acessar Sistema
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    <p className="text-xs text-gray-600 text-center mt-6">
                        Problema pra entrar? Fale com o administrador da sua oficina.
                    </p>
                </div>
            </div>
        </div>
    )
}

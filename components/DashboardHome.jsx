"use client"
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
    Wrench, Users, Package, FileText,
    CircleDollarSign, TrendingUp, AlertCircle, ShoppingCart, Activity,
    PiggyBank, Lock, Unlock, Clock, Eye, EyeOff
} from 'lucide-react'

const SHOW_VALUES_KEY = 'topgarage_show_values'

export default function DashboardHome({ metrics }) {
    const router = useRouter()
    const { tenant } = useAuth()
    // Remove sufixos entre parênteses como "(Matriz)" / "(Filial X)" do nome no greeting.
    // O nome real fica intacto no banco; isso é só para a saudação.
    const rawName = tenant?.name || 'Garaje.io'
    const tenantName = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim() || rawName

    // Modo discreto: esconde valores monetários por padrão (sistema fica aberto no balcão).
    // Preferência persiste em localStorage para não precisar reativar a cada refresh.
    const [showValues, setShowValues] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined') return
        if (window.localStorage.getItem(SHOW_VALUES_KEY) === 'true') {
            setShowValues(true)
        }
    }, [])

    const toggleShowValues = () => {
        setShowValues(prev => {
            const next = !prev
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(SHOW_VALUES_KEY, String(next))
            }
            return next
        })
    }

    const formatBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const maskBRL = (v) => showValues ? formatBRL(v) : 'R$ ••••••'

    const modules = [
        {
            title: 'Ordens de Serviço',
            desc: 'Gerencie OS em andamento, orçamentos e concluídas.',
            icon: Wrench,
            path: '/os',
            color: 'from-blue-600 to-blue-900',
            textColor: 'text-blue-400'
        },
        {
            title: 'PDV (Balcão)',
            desc: 'Venda rápida de peças no balcão.',
            icon: ShoppingCart,
            path: '/pdv',
            color: 'from-orange-600 to-orange-900',
            textColor: 'text-orange-400'
        },
        {
            title: 'Movimento Diário',
            desc: 'Abertura, fechamento de caixa e despesas do dia.',
            icon: Activity,
            path: '/financial/daily',
            color: 'from-emerald-600 to-emerald-900',
            textColor: 'text-emerald-400'
        },
        {
            title: 'Estoque',
            desc: 'Controle de peças, preços e entrada de notas.',
            icon: Package,
            path: '/stock',
            color: 'from-purple-600 to-purple-900',
            textColor: 'text-purple-400'
        },
        {
            title: 'CRM (Pós-Venda)',
            desc: 'Relacionamento, retorno e avisos automáticos.',
            icon: Users,
            path: '/crm',
            color: 'from-rose-600 to-rose-900',
            textColor: 'text-rose-400'
        },
        {
            title: 'Serviços',
            desc: 'Tabela de preço da mão de obra.',
            icon: FileText,
            path: '/services',
            color: 'from-cyan-600 to-cyan-900',
            textColor: 'text-cyan-400'
        },
        {
            title: 'Financeiro',
            desc: 'Visão geral, contas a pagar e receber, relatórios.',
            icon: CircleDollarSign,
            path: '/financial',
            color: 'from-teal-600 to-teal-900',
            textColor: 'text-teal-400'
        },
        {
            title: 'Clientes e Veículos',
            desc: 'Cadastro de clientes e suas respectivas frotas.',
            icon: Users,
            path: '/clients',
            color: 'from-indigo-600 to-indigo-900',
            textColor: 'text-indigo-400'
        }
    ]

    return (
        <div className="w-full space-y-8 animate-in fade-in duration-700">
            {/* Header Greeting */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-black text-white tracking-tight">
                        Bem-vindo, {tenantName}
                    </h1>
                    <p className="text-gray-400 text-lg">
                        Selecione um módulo abaixo para começar a trabalhar.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={toggleShowValues}
                    title={showValues ? 'Ocultar valores monetários' : 'Mostrar valores monetários'}
                    className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-gray-400 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition shrink-0"
                >
                    {showValues ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    <span className="hidden sm:inline">{showValues ? 'Ocultar valores' : 'Mostrar valores'}</span>
                </button>
            </div>

            {/* Pending closures alert */}
            {metrics.pendingClosuresCount > 0 && (
                <Link
                    href="/financial/daily/pending"
                    className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 hover:bg-amber-500/15 transition group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-lg">
                            <Clock className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-amber-300 font-bold">
                                {metrics.pendingClosuresCount} dia{metrics.pendingClosuresCount > 1 ? 's' : ''} pendente{metrics.pendingClosuresCount > 1 ? 's' : ''} de fechamento
                            </p>
                            <p className="text-xs text-amber-400/70">Clique para fechar os movimentos atrasados.</p>
                        </div>
                    </div>
                    <span className="text-amber-400 font-bold opacity-0 group-hover:opacity-100 transition">→</span>
                </Link>
            )}

            {/* Quick Metrics / Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl shadow-xl flex items-start justify-between group hover:border-blue-500/50 transition">
                    <div>
                        <p className="text-gray-400 text-sm font-medium mb-1">OS em Andamento</p>
                        <h3 className="text-2xl font-black text-white">{metrics.activeOS}</h3>
                    </div>
                    <div className="p-2.5 bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                        <Wrench className="w-5 h-5 text-blue-500" />
                    </div>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl shadow-xl flex items-start justify-between group hover:border-red-500/50 transition cursor-pointer" onClick={() => router.push('/stock')}>
                    <div>
                        <p className="text-gray-400 text-sm font-medium mb-1">Itens c/ Estoque Baixo</p>
                        <h3 className={`text-2xl font-black ${metrics.lowStock > 0 ? 'text-red-500' : 'text-white'}`}>
                            {metrics.lowStock}
                        </h3>
                    </div>
                    <div className="p-2.5 bg-red-500/10 rounded-xl group-hover:scale-110 transition-transform">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                    </div>
                </div>

                {/* Receita Hoje - dois valores + status de fechamento */}
                <div
                    className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl shadow-xl group hover:border-green-500/50 transition cursor-pointer"
                    onClick={() => router.push('/financial/daily')}
                >
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <p className="text-gray-400 text-sm font-medium">Receita de Hoje</p>
                            {metrics.todayClosed ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-emerald-500/30">
                                    <Lock className="w-3 h-3" /> Fechado
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-500/30">
                                    <Unlock className="w-3 h-3" /> Aberto
                                </span>
                            )}
                        </div>
                        <div className="p-2.5 bg-green-500/10 rounded-xl group-hover:scale-110 transition-transform">
                            <TrendingUp className="w-5 h-5 text-green-500" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div>
                            <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Total do dia (Entradas)</p>
                            <h3 className={`text-2xl font-black text-green-400 ${!showValues && 'tracking-widest'}`}>
                                {maskBRL(metrics.todayIncome)}
                            </h3>
                        </div>
                        <div className="border-t border-neutral-800 pt-2 flex items-center gap-2">
                            <PiggyBank className="w-4 h-4 text-blue-400 shrink-0" />
                            <div>
                                <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Saldo (Entradas − Saídas)</p>
                                <h4 className={`text-base font-bold ${!showValues ? 'text-gray-400 tracking-widest' : (metrics.todayNet >= 0 ? 'text-white' : 'text-red-400')}`}>
                                    {maskBRL(metrics.todayNet)}
                                </h4>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modules Grid */}
            <div>
                <h2 className="text-2xl font-bold text-white mb-6">Módulos do Sistema</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {modules.map((mod, idx) => (
                        <Link
                            href={mod.path}
                            key={idx}
                            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group hover:-translate-y-1 hover:shadow-2xl hover:shadow-red-900/20 transition-all duration-300"
                        >
                            <div className={`absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-br ${mod.color} rounded-full opacity-20 group-hover:scale-150 transition-transform duration-500 blur-2xl`}></div>

                            <div className="relative z-10 flex flex-col h-full">
                                <mod.icon className={`w-10 h-10 ${mod.textColor} mb-4 group-hover:scale-110 transition-transform`} />
                                <h3 className="text-xl font-bold text-white mb-2">{mod.title}</h3>
                                <p className="text-sm text-gray-400 leading-relaxed flex-grow">
                                    {mod.desc}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            <div className="pt-10 pb-4 text-center text-gray-600 text-xs">
                &copy; 2026 Top Garage System. Todos os direitos reservados.
            </div>
        </div>
    )
}

"use client"
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Building2, X, LogIn, CheckCircle2 } from 'lucide-react'
import { createTenantAndAdmin, enterTenant } from '@/actions/admin'

export default function SuperAdminPage() {
    const [companies, setCompanies] = useState([])
    const [loading, setLoading] = useState(true)
    const [isCheckingAdmin, setIsCheckingAdmin] = useState(true)
    const [currentTenantId, setCurrentTenantId] = useState(null)
    const [entering, setEntering] = useState(null)

    const [showModal, setShowModal] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [formError, setFormError] = useState('')
    const [formSuccess, setFormSuccess] = useState('')

    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        checkAdminAccess()
    }, [])

    const checkAdminAccess = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('role, tenant_id')
                .eq('user_id', user.id)
                .single()

            if (profile?.role !== 'super_admin') {
                router.push('/')
                return
            }

            setCurrentTenantId(profile.tenant_id)
            setIsCheckingAdmin(false)
            fetchCompanies()
        } catch (error) {
            console.error("Access check failed", error)
            router.push('/login')
        }
    }

    const handleEnter = async (tenantId, tenantName) => {
        if (tenantId === currentTenantId) {
            // Já estamos neste tenant — vai direto pro dashboard
            router.push('/')
            return
        }
        setEntering(tenantId)
        const result = await enterTenant(tenantId)
        if (result?.error) {
            alert(`Erro: ${result.error}`)
            setEntering(null)
            return
        }
        // Navega pro dashboard do tenant recém-selecionado
        router.push('/')
        router.refresh()
    }

    const fetchCompanies = async () => {
        setLoading(true)
        // Lê da tabela tenants (fonte de verdade). A tabela companies é legado órfão.
        const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .order('created_at', { ascending: false })

        if (!error && data) {
            setCompanies(data)
        }
        setLoading(false)
    }

    if (isCheckingAdmin) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="text-gray-400">Verificando permissões...</div>
            </div>
        )
    }

    return (
        <div className="w-full flex-1 flex flex-col p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent uppercase tracking-wider">
                        Garaj.io - Super Admin
                    </h1>
                    <p className="text-neutral-400 text-sm mt-1">Gerenciamento de Empresas (Tenants)</p>
                </div>
                <button
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors uppercase text-sm font-medium tracking-wide shadow-lg shadow-red-900/20"
                    onClick={() => {
                        setShowModal(true); setFormError(''); setFormSuccess('');
                    }}
                >
                    <Plus size={18} />
                    Nova Empresa
                </button>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-2xl">
                {loading ? (
                    <div className="p-12 text-center text-neutral-400">Carregando empresas...</div>
                ) : companies.length === 0 ? (
                    <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
                        <Building2 size={48} className="mb-4 opacity-20" />
                        <p className="text-lg">Nenhuma empresa encontrada</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-neutral-800 bg-neutral-950/50">
                                    <th className="p-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Empresa</th>
                                    <th className="p-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Documento</th>
                                    <th className="p-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Status</th>
                                    <th className="p-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Logo URL</th>
                                    <th className="p-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Criada em</th>
                                    <th className="p-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800">
                                {companies.map((company) => (
                                    <tr key={company.id} className="hover:bg-neutral-800/50 transition-colors">
                                        <td className="p-4 bg-transparent border-0 space-y-1">
                                            <div className="font-medium text-white">{company.name}</div>
                                            <div className="text-xs text-neutral-500 font-mono">{company.id}</div>
                                        </td>
                                        <td className="p-4 bg-transparent border-0 text-sm text-neutral-300">
                                            {company.document || '-'}
                                        </td>
                                        <td className="p-4 bg-transparent border-0">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                company.status === 'active' 
                                                ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                            }`}>
                                                {company.status === 'active' ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </td>
                                        <td className="p-4 bg-transparent border-0">
                                            {company.logo_url ? (
                                                <div className="text-xs text-neutral-400 truncate max-w-[150px]" title={company.logo_url}>
                                                    {company.logo_url}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-neutral-600">Sem logo</span>
                                            )}
                                        </td>
                                        <td className="p-4 bg-transparent border-0 text-neutral-400 text-sm">
                                            {new Date(company.created_at).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="p-4 bg-transparent border-0 text-right">
                                            {company.id === currentTenantId ? (
                                                <button
                                                    onClick={() => handleEnter(company.id, company.name)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
                                                    title="Você já está neste tenant — clique pra ir pro dashboard"
                                                >
                                                    <CheckCircle2 size={14} />
                                                    Atual
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleEnter(company.id, company.name)}
                                                    disabled={entering === company.id}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600/80 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
                                                >
                                                    <LogIn size={14} />
                                                    {entering === company.id ? 'Entrando...' : 'Entrar'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Nova Empresa */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center p-6 border-b border-neutral-800 bg-neutral-950/50">
                            <h2 className="text-xl font-bold text-white uppercase tracking-wider">Cadastrar Nova Empresa</h2>
                            <button onClick={() => setShowModal(false)} className="text-neutral-500 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto">
                            <form action={async (formData) => {
                                setSubmitting(true)
                                setFormError('')
                                setFormSuccess('')
                                const result = await createTenantAndAdmin(formData)
                                if (result?.error) {
                                    setFormError(result.error)
                                } else if (result?.success) {
                                    setFormSuccess(result.message)
                                    fetchCompanies() // Refresh list
                                    setTimeout(() => setShowModal(false), 2000)
                                }
                                setSubmitting(false)
                            }} className="space-y-6">
                                
                                {formError && <div className="p-3 bg-red-900/20 border border-red-900/50 text-red-400 text-sm rounded-md">{formError}</div>}
                                {formSuccess && <div className="p-3 bg-green-900/20 border border-green-900/50 text-green-400 text-sm rounded-md">{formSuccess}</div>}

                                <div>
                                    <h3 className="text-sm font-semibold uppercase text-red-500 mb-4 border-b border-neutral-800 pb-2">1. Dados da Empresa</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-neutral-400 mb-1">Razão Social / Nome Fantasia *</label>
                                            <input name="companyName" required className="w-full bg-black border border-neutral-800 rounded-md px-3 py-2 text-white focus:outline-none focus:border-red-500 text-sm" placeholder="Ex: Auto Mecânica Silva" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-neutral-400 mb-1">CNPJ *</label>
                                            <input name="document" required className="w-full bg-black border border-neutral-800 rounded-md px-3 py-2 text-white focus:outline-none focus:border-red-500 text-sm" placeholder="00.000.000/0001-00" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-neutral-400 mb-1">Telefone Principal</label>
                                            <input name="companyPhone" className="w-full bg-black border border-neutral-800 rounded-md px-3 py-2 text-white focus:outline-none focus:border-red-500 text-sm" placeholder="(11) 99999-9999" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-neutral-400 mb-1">E-mail Comercial</label>
                                            <input name="companyEmail" type="email" className="w-full bg-black border border-neutral-800 rounded-md px-3 py-2 text-white focus:outline-none focus:border-red-500 text-sm" placeholder="contato@empresa.com" />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-sm font-semibold uppercase text-red-500 mb-4 border-b border-neutral-800 pb-2">2. Administrador Principal (1º Acesso)</h3>
                                    <p className="text-xs text-neutral-500 mb-4">Este é o usuário que a empresa usará para acessar o sistema inicialmente.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-xs text-neutral-400 mb-1">Nome do Responsável *</label>
                                            <input name="adminName" required className="w-full bg-black border border-neutral-800 rounded-md px-3 py-2 text-white focus:outline-none focus:border-red-500 text-sm" placeholder="João da Silva" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-neutral-400 mb-1">E-mail de Login *</label>
                                            <input name="adminEmail" required type="email" className="w-full bg-black border border-neutral-800 rounded-md px-3 py-2 text-white focus:outline-none focus:border-red-500 text-sm" placeholder="joao@empresa.com" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-neutral-400 mb-1">Senha Inicial *</label>
                                            <input name="adminPassword" required type="password" className="w-full bg-black border border-neutral-800 rounded-md px-3 py-2 text-white focus:outline-none focus:border-red-500 text-sm" placeholder="••••••••" />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end gap-3 border-t border-neutral-800">
                                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 hover:bg-neutral-800 rounded-md text-neutral-400 text-sm transition-colors uppercase font-medium tracking-wide">
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={submitting} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-md transition-colors text-sm font-medium uppercase tracking-wide">
                                        {submitting ? 'Salvando...' : 'Cadastrar Empresa'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

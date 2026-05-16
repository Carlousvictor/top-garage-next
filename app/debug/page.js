import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

// ATENÇÃO: esta página usa SERVICE_ROLE_KEY e expõe dados crus de TODOS
// os tenants. Por isso é blindada com checagem de role=super_admin antes
// de qualquer query — usuários comuns de tenants clientes recebem 403 e
// nunca veem dados de outras empresas. Mantida como ferramenta de
// diagnóstico do dono do sistema (super_admin), nunca pra clientes finais.
export default async function DebugPage() {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
        return <div className="p-10 bg-black text-white min-h-screen font-mono">Sem sessão.</div>
    }

    const { data: profile } = await userClient
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
    const { data: profileById } = profile?.role ? { data: profile } : await userClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
    const role = (profile?.role ?? profileById?.role) || null

    if (role !== 'super_admin') {
        return (
            <div className="p-10 bg-black text-white min-h-screen font-mono">
                <h1 className="text-xl font-bold text-red-500">Acesso negado</h1>
                <p className="mt-2 text-gray-400">Esta página é restrita a super administradores.</p>
            </div>
        )
    }

    // Só super_admin chega aqui — dump cross-tenant via service role
    const supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const { data: profiles, error: pErr } = await supabase.from('profiles').select('*')
    const { data: clients, error: cErr } = await supabase.from('clients').select('*')
    const { data: orders, error: oErr } = await supabase.from('service_orders').select('*')

    return (
        <div className="p-10 bg-black text-white min-h-screen font-mono text-sm leading-relaxed overflow-auto flex flex-col gap-8">
            <div>
                <h1 className="text-xl font-bold mb-4 text-red-500">PROFILES</h1>
                {pErr ? <p className="text-red-500">{pErr.message}</p> : <pre className="bg-neutral-900 p-4 border border-neutral-700">{JSON.stringify(profiles, null, 2)}</pre>}
            </div>

            <div>
                <h1 className="text-xl font-bold mb-4 text-green-500">CLIENTS</h1>
                {cErr ? <p className="text-red-500">{cErr.message}</p> : <pre className="bg-neutral-900 p-4 border border-neutral-700">{JSON.stringify(clients, null, 2)}</pre>}
            </div>

            <div>
                <h1 className="text-xl font-bold mb-4 text-blue-500">ORDERS</h1>
                {oErr ? <p className="text-red-500">{oErr.message}</p> : <pre className="bg-neutral-900 p-4 border border-neutral-700">{JSON.stringify(orders, null, 2)}</pre>}
            </div>
        </div>
    )
}

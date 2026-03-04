import { createClient } from '@supabase/supabase-js'

export default async function DebugPage() {
    // Override with a service role key to bypass RLS and see reality
    const supabase = createClient(
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

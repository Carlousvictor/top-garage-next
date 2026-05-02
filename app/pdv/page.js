import { createClient } from '@/utils/supabase/server'
import POSForm from '@/components/POSForm'

export default async function PDVPage() {
    // Carrega clientes E produtos no servidor pra evitar race condition do useEffect
    // client-side: a sessão Supabase aqui já está hidratada via cookie, então
    // o RLS resolve corretamente. Antes, o fetch no useEffect às vezes disparava
    // antes do auth client-side estar pronto e devolvia lista vazia silenciosamente
    // (mesmo bug que clients tinha — products carregava no client e às vezes vinha vazio).
    const supabase = await createClient()
    const [{ data: clients }, { data: products }] = await Promise.all([
        supabase.from('clients').select('id, name').order('name'),
        supabase.from('products').select('*').order('name'),
    ])

    return <POSForm initialClients={clients || []} initialProducts={products || []} />
}

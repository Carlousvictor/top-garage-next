import { createClient } from '@/utils/supabase/server'
import POSForm from '@/components/POSForm'

export default async function PDVPage() {
    // Carrega clientes no servidor pra evitar race condition do useEffect
    // client-side: a sessão Supabase aqui já está hidratada via cookie, então
    // o RLS resolve corretamente. Antes, o fetch no useEffect às vezes disparava
    // antes do auth client-side estar pronto e devolvia lista vazia silenciosamente.
    const supabase = await createClient()
    const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .order('name')

    return <POSForm initialClients={clients || []} />
}

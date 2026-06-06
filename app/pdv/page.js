import { createClient } from '@/utils/supabase/server'
import POSForm from '@/components/POSForm'

// Render server-side em toda visita: garante que a lista de produtos (initialProducts)
// reflita exclusões/edições feitas no estoque. Sem isso, o picker de venda servia o
// snapshot SSR cacheado — item excluído ainda aparecia e preço editado não atualizava.
// Espelha app/stock/page.js. revalidatePath('/pdv') nas rotas de produto complementa.
export const dynamic = 'force-dynamic'

export default async function PDVPage() {
    // Carrega clientes E produtos no servidor pra evitar race condition do useEffect
    // client-side: a sessão Supabase aqui já está hidratada via cookie, então
    // o RLS resolve corretamente. Antes, o fetch no useEffect às vezes disparava
    // antes do auth client-side estar pronto e devolvia lista vazia silenciosamente
    // (mesmo bug que clients tinha — products carregava no client e às vezes vinha vazio).
    const supabase = await createClient()
    const [{ data: clients }, { data: products }] = await Promise.all([
        supabase.from('clients').select('id, name, client_number').order('client_number', { ascending: true, nullsFirst: false }).order('name'),
        supabase.from('products').select('*').order('name'),
    ])

    return <POSForm initialClients={clients || []} initialProducts={products || []} />
}

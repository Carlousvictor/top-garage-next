import { createClient } from '@/utils/supabase/server'
import PDVSalesList from '@/components/PDVSalesList'

// Listagem das vendas do PDV. Vendas do balcão não são uma entidade própria —
// são linhas em transactions marcadas pela descrição "Venda Balcão (PDV)".
// Mesmo padrão SSR do /os: carrega no servidor (sessão já hidratada via cookie,
// RLS resolve o tenant) e passa pra lista client-side que cuida de filtros/busca.
export default async function PDVSalesPage() {
    const supabase = await createClient()
    const { data: sales } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'income')
        .ilike('description', 'Venda Balcão (PDV)%')
        .order('date', { ascending: false })

    return <PDVSalesList initialSales={sales || []} />
}

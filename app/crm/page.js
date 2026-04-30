import { createClient } from '@/utils/supabase/server'
import CRMList from '@/components/CRMList'

export default async function CRMPage() {
    const supabase = await createClient()

    // Fetch concluded orders that have an explicit next_revision_date — só faz
    // sentido trazer essas pro CRM já que os alertas só aparecem pra revisões
    // que o operador marcou na OS. Filtro server-side reduz payload e ajuda
    // a escalar pra muitas OS concluídas.
    const { data: recentOrders, error } = await supabase
        .from('service_orders')
        .select(`
            *,
            clients (name, phone, email),
            service_order_items (description, type)
        `)
        .eq('status', 'Concluido')
        .not('next_revision_date', 'is', null)
        .order('next_revision_date', { ascending: true })

    return <CRMList recentOrders={recentOrders || []} error={error} />
}

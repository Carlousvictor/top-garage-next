import { createClient } from '@/utils/supabase/server'
import ServiceOrderList from '@/components/ServiceOrderList'

export default async function ServiceOrderListPage() {
    const supabase = await createClient()
    const { data: orders } = await supabase
        .from('service_orders')
        .select(`
            *,
            clients (name, client_number)
        `)
        .order('created_at', { ascending: false })

    return <ServiceOrderList initialOrders={orders || []} />
}

import { createClient } from '@/utils/supabase/server'
import CRMList from '@/components/CRMList'

export default async function CRMPage() {
    const supabase = await createClient()

    // Fetch concluded orders to find the last maintenance dates
    const { data: recentOrders } = await supabase
        .from('service_orders')
        .select(`
            *,
            clients (name, phone, email),
            service_order_items (description, type)
        `)
        .eq('status', 'Concluido')
        .order('created_at', { ascending: false })

    return <CRMList recentOrders={recentOrders || []} />
}

import { createClient } from '@/utils/supabase/server'
import CRMList from '@/components/CRMList'

export default async function CRMPage() {
    const supabase = await createClient()

    // Fetch concluded orders to find the last maintenance dates
    const { data: recentOrders, error } = await supabase
        .from('service_orders')
        .select(`
            *,
            clients (name, phone, email),
            service_order_items (description, type)
        `)
        .eq('status', 'Concluido')
        .order('created_at', { ascending: false })

    console.log("CRM Fetch Error:", error)
    console.log("CRM Fetched Orders Count:", recentOrders?.length)
    if (recentOrders?.length > 0) {
        console.log("CRM First Order:", JSON.stringify(recentOrders[0], null, 2))
    }

    return <CRMList recentOrders={recentOrders || []} error={error} />
}

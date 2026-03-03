import { createClient } from '@/utils/supabase/server'
import ThirdPartyOrderList from '@/components/ThirdPartyOrderList'

export default async function ThirdsPage() {
    const supabase = await createClient()
    // Fetch OS from thirds. We use a separate type or table. Let's assume there is an is_third_party boolean in service_orders, or we can just filter by it. Oh wait, the prompt says it shouldn't touch stock, so maybe it's completely isolated. I'll use a type column in service_orders: 'third_party' = true.
    const { data } = await supabase.from('service_orders').select('*').eq('is_third_party', true).order('created_at', { ascending: false })

    return <ThirdPartyOrderList initialOrders={data || []} />
}

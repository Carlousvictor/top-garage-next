import { createClient } from '@/utils/supabase/server'
import ThirdPartyOrderForm from '@/components/ThirdPartyOrderForm'
import { notFound } from 'next/navigation'

export default async function EditThirdPartyOrderPage({ params }) {
    const supabase = await createClient()
    const { id } = await params

    const { data: order } = await supabase
        .from('service_orders')
        .select('*')
        .eq('id', id)
        .single()

    if (!order || !order.is_third_party) {
        notFound()
    }

    const { data: items } = await supabase
        .from('service_order_items')
        .select('*')
        .eq('service_order_id', id)

    return <ThirdPartyOrderForm order={order} initialItems={items || []} />
}

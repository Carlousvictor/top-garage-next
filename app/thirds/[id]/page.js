import { createClient } from '@/utils/supabase/server'
import ServiceOrderForm from '@/components/ServiceOrderForm'
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

    const [
        { data: items },
        { data: clients },
        { data: products },
        { data: services }
    ] = await Promise.all([
        supabase.from('service_order_items').select('*').eq('service_order_id', id),
        supabase.from('clients').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('services').select('*').order('name'),
    ])

    return (
        <ServiceOrderForm
            order={order}
            initialItems={items || []}
            initialClients={clients || []}
            initialProducts={products || []}
            initialServices={services || []}
            isThirdParty={true}
            onCancelPath="/thirds"
            onSavePath="/thirds"
        />
    )
}

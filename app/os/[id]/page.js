import { createClient } from '@/utils/supabase/server'
import ServiceOrderForm from '@/components/ServiceOrderForm'
import { notFound } from 'next/navigation'

export default async function EditServiceOrderPage({ params }) {
    const { id } = await params
    const supabase = await createClient()

    const [
        { data: order, error },
        { data: clients },
        { data: products },
        { data: services },
        { data: items },
    ] = await Promise.all([
        supabase.from('service_orders').select('*').eq('id', id).single(),
        supabase.from('clients').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('services').select('*').order('name'),
        supabase.from('service_order_items').select('*').eq('service_order_id', id),
    ])

    if (error || !order) {
        notFound()
    }

    return (
        <ServiceOrderForm
            order={order}
            initialClients={clients || []}
            initialProducts={products || []}
            initialServices={services || []}
            initialItems={items || []}
        />
    )
}

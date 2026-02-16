import ServiceOrderForm from '@/components/ServiceOrderForm'
import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'

export default async function EditServiceOrderPage({ params }) {
    const { id } = await params
    const supabase = await createClient()

    const { data: order, error } = await supabase
        .from('service_orders')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !order) {
        notFound()
    }

    return <ServiceOrderForm order={order} />
}

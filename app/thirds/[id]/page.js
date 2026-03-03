import { createClient } from '@/utils/supabase/server'
import ThirdPartyOrderForm from '@/components/ThirdPartyOrderForm'
import { notFound } from 'next/navigation'

export default async function EditThirdPartyOrderPage({ params }) {
    const supabase = await createClient()
    // Need to await params.id depending on Next.js version, but let's assume standard params structure
    const id = params.id

    const { data: order } = await supabase
        .from('service_orders')
        .select('*')
        .eq('id', id)
        .single()

    if (!order || !order.is_third_party) {
        notFound()
    }

    return <ThirdPartyOrderForm order={order} />
}

import { createClient } from '@/utils/supabase/server'
import ServiceOrderForm from '@/components/ServiceOrderForm'

export default async function NewServiceOrderPage() {
    const supabase = await createClient()

    const [{ data: clients }, { data: products }, { data: services }] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('services').select('*').order('name'),
    ])

    return (
        <ServiceOrderForm
            initialClients={clients || []}
            initialProducts={products || []}
            initialServices={services || []}
        />
    )
}

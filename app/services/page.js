import { createClient } from '@/utils/supabase/server'
import ServiceList from '@/components/ServiceList'

export default async function ServicesPage() {
    const supabase = await createClient()
    const { data } = await supabase.from('services').select('*').order('name')

    return <ServiceList initialServices={data || []} />
}

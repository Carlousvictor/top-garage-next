import { createClient } from '@/utils/supabase/server'
import ClientList from '@/components/ClientList'

export default async function ClientsPage() {
    const supabase = await createClient()
    const { data } = await supabase
        .from('clients')
        .select('*, vehicles(plate)')
        .order('client_number', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true })

    return <ClientList initialClients={data || []} />
}

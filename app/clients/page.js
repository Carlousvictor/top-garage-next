import { createClient } from '@/utils/supabase/server'
import ClientList from '@/components/ClientList'

export default async function ClientsPage() {
    const supabase = await createClient()
    const { data } = await supabase.from('clients').select('*').order('name')

    return <ClientList initialClients={data || []} />
}

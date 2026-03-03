import { createClient } from '@/utils/supabase/server'
import POSForm from '@/components/POSForm'

export default async function PDVPage() {
    return <POSForm />
}

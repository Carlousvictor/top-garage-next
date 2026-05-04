import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    console.log('Testing connection...')
    const { data, error } = await supabase
        .from('transactions')
        .select('tenant_id')
        .limit(1)

    console.log('Data:', data)
    console.log('Error:', error)
}

test()

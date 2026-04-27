import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')
    if (!clientId) return NextResponse.json({ vehicles: [] })

    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: vehicles, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ vehicles: vehicles || [] })
}

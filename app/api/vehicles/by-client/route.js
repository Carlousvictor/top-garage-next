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

    // Derive tenant_id so the query satisfies RLS policies that check tenant scope
    let tenantId = null
    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()
    tenantId = profile?.tenant_id

    if (!tenantId) {
        const { data: profileById } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single()
        tenantId = profileById?.tenant_id
    }

    // Query vehicles for this client. RLS on the vehicles table (if enabled)
    // will further scope results to the authenticated tenant automatically.
    const { data: vehicles, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ vehicles: vehicles || [] })
}

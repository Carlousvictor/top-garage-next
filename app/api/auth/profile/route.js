import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Dual-key lookup: user_id é canônico, .id é legacy.
    // .maybeSingle() não erra com 0 rows — evita 500 silenciosos que zeram
    // o tenant pro cliente.
    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .maybeSingle()

    if (profile?.tenant_id) {
        return NextResponse.json({
            tenantId: profile.tenant_id,
            role: profile.role ?? null,
        })
    }

    const { data: profileById } = await supabase
        .from('profiles')
        .select('tenant_id, role')
        .eq('id', user.id)
        .maybeSingle()

    return NextResponse.json({
        tenantId: profileById?.tenant_id ?? null,
        role: profileById?.role ?? null,
    })
}

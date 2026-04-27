import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .single()

    if (profileError || !profile) {
        // Fallback: tenta pela coluna id (padrão Supabase)
        const { data: profileById } = await supabase
            .from('profiles')
            .select('tenant_id, role')
            .eq('id', user.id)
            .single()

        return NextResponse.json({
            tenantId: profileById?.tenant_id ?? null,
            role: profileById?.role ?? null,
        })
    }

    return NextResponse.json({
        tenantId: profile.tenant_id ?? null,
        role: profile.role ?? null,
    })
}

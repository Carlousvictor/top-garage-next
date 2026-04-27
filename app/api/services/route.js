import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantId(supabase, user) {
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).single()
    if (profile?.tenant_id) return profile.tenant_id
    const { data: profileById } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    return profileById?.tenant_id ?? null
}

export async function POST(request) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 403 })
    }

    const { name, price, description } = await request.json()
    if (!name?.trim()) {
        return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('services')
        .insert([{
            tenant_id: tenantId,
            name: name.trim(),
            price: price ?? 0,
            description: description?.trim() || null
        }])
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ service: data })
}

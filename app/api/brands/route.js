import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

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

    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 403 })
    }

    const { name } = await request.json()
    if (!name?.trim()) {
        return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('brands')
        .insert([{ tenant_id: tenantId, name: name.trim() }])
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ brand: data })
}

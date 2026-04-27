import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantId(supabase, user) {
    const { data: p } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).single()
    if (p?.tenant_id) return p.tenant_id
    const { data: p2 } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    return p2?.tenant_id ?? null
}

export async function POST(request) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 403 })

    const body = await request.json()
    const {
        client_id, plate, brand, model, year, color,
        submodel, manufacture_year, fuel_type, chassi,
        engine_displacement, transmission, city, state, observations
    } = body

    if (!client_id || !plate?.trim()) {
        return NextResponse.json({ error: 'client_id e plate são obrigatórios.' }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('vehicles')
        .insert([{
            tenant_id: tenantId,
            client_id,
            plate: plate.trim().toUpperCase(),
            brand: brand?.trim() || null,
            model: model?.trim() || null,
            year: year?.toString().trim() || null,
            color: color?.trim() || null,
            submodel: submodel?.trim() || null,
            manufacture_year: manufacture_year?.toString().trim() || null,
            fuel_type: fuel_type?.trim() || null,
            chassi: chassi?.trim() || null,
            engine_displacement: engine_displacement?.trim() || null,
            transmission: transmission?.trim() || null,
            city: city?.trim() || null,
            state: state?.trim() || null,
            observations: observations?.trim() || null,
        }])
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ vehicle: data })
}

export async function DELETE(request) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { error } = await supabase.from('vehicles').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}

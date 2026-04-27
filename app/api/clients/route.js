import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantId(supabase, user) {
    const { data: p } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).single()
    if (p?.tenant_id) return p.tenant_id
    const { data: p2 } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    return p2?.tenant_id ?? null
}

export async function GET() {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ clients: [] })

    const { data, error } = await supabase.from('clients').select('*').eq('tenant_id', tenantId).order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ clients: data || [] })
}

export async function POST(request) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 403 })

    const body = await request.json()
    const { id, name, email, phone, document, vehicles = [] } = body

    if (!name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })

    if (id) {
        const { error } = await supabase
            .from('clients')
            .update({ name: name.trim(), email: email || null, phone: phone || null, document: document || null })
            .eq('id', id)
            .eq('tenant_id', tenantId)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
        const { data: newClient, error } = await supabase
            .from('clients')
            .insert([{ tenant_id: tenantId, name: name.trim(), email: email || null, phone: phone || null, document: document || null }])
            .select()
            .single()
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })

        if (vehicles.length > 0) {
            const vehiclesPayload = vehicles.map(v => ({
                tenant_id: tenantId,
                client_id: newClient.id,
                plate: v.plate?.toUpperCase() || null,
                brand: v.brand || null,
                model: v.model || null,
                year: v.year || null,
                color: v.color || null,
                submodel: v.submodel || null,
                manufacture_year: v.manufacture_year || null,
                fuel_type: v.fuel_type || null,
                chassi: v.chassi || null,
                engine_displacement: v.engine_displacement || null,
                transmission: v.transmission || null,
                city: v.city || null,
                state: v.state || null,
                observations: v.observations || null,
            }))
            await supabase.from('vehicles').insert(vehiclesPayload)
        }
    }

    // Return updated client list
    const { data: clients } = await supabase.from('clients').select('*').eq('tenant_id', tenantId).order('name')
    return NextResponse.json({ clients: clients || [] })
}

export async function DELETE(request) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    const { error } = await supabase.from('clients').delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}

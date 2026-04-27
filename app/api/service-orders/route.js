import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantId(supabase, user) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()
    if (profile?.tenant_id) return profile.tenant_id

    const { data: profileById } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
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
        return NextResponse.json({ error: 'Empresa não encontrada para este usuário.' }, { status: 403 })
    }

    const body = await request.json()
    const {
        id,
        items = [],
        service_date_iso,
        // order fields (tenant_id from client is ignored)
        client_id,
        vehicle_plate,
        vehicle_brand,
        vehicle_model,
        status,
        observation,
        is_estimate,
        is_third_party,
        next_revision_date,
        current_km,
        next_revision_km,
        total,
    } = body

    const orderData = {
        tenant_id: tenantId,
        client_id: client_id || null,
        vehicle_plate: vehicle_plate || null,
        vehicle_brand: vehicle_brand || null,
        vehicle_model: vehicle_model || null,
        status: status || 'Aberto',
        observation: observation || null,
        is_estimate: is_estimate || false,
        is_third_party: is_third_party || false,
        next_revision_date: next_revision_date || null,
        current_km: current_km ?? null,
        next_revision_km: next_revision_km ?? null,
        total: total || 0,
        created_at: service_date_iso || new Date().toISOString(),
    }

    let orderId = id || null

    if (orderId) {
        const { error } = await supabase
            .from('service_orders')
            .update(orderData)
            .eq('id', orderId)
            .eq('tenant_id', tenantId)

        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
        const { data, error } = await supabase
            .from('service_orders')
            .insert([orderData])
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        orderId = data.id
    }

    // Re-sync items: delete existing then insert current list
    if (id) {
        const { error: delError } = await supabase
            .from('service_order_items')
            .delete()
            .eq('service_order_id', orderId)
        if (delError) return NextResponse.json({ error: delError.message }, { status: 400 })
    }

    if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
            tenant_id: tenantId,
            service_order_id: orderId,
            product_id: item.product_id || null,
            service_id: item.service_id || null,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            type: item.type,
        }))

        const { error: itemsError } = await supabase
            .from('service_order_items')
            .insert(itemsToInsert)

        if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 400 })
    }

    return NextResponse.json({ orderId })
}

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

    const { order_id, plate, total, service_date_iso, is_retroactive, payment_method, items = [] } = await request.json()

    if (!order_id) {
        return NextResponse.json({ error: 'order_id é obrigatório.' }, { status: 400 })
    }

    // 1. Update OS status
    const { error: osError } = await supabase
        .from('service_orders')
        .update({ status: 'Concluido', total, created_at: service_date_iso })
        .eq('id', order_id)
        .eq('tenant_id', tenantId)

    if (osError) return NextResponse.json({ error: osError.message }, { status: 400 })

    // 2. Deduct stock only for non-retroactive orders
    if (!is_retroactive) {
        for (const item of items) {
            if (item.type === 'product' && item.product_id) {
                const { data: prod } = await supabase
                    .from('products')
                    .select('quantity')
                    .eq('id', item.product_id)
                    .single()

                if (prod) {
                    await supabase
                        .from('products')
                        .update({ quantity: prod.quantity - item.quantity })
                        .eq('id', item.product_id)
                }
            }
        }
    }

    // 3. Insert financial transaction
    const { error: txError } = await supabase.from('transactions').insert([{
        tenant_id: tenantId,
        description: `Receita OS #${order_id} - Placa ${plate}`,
        type: 'income',
        category: 'Service',
        amount: total,
        related_os_id: order_id,
        status: 'paid',
        payment_method: payment_method || 'Dinheiro',
        date: service_date_iso,
    }])

    if (txError) return NextResponse.json({ error: txError.message }, { status: 400 })

    return NextResponse.json({ success: true })
}

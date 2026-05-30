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
        client_label,
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
        // Desconto — usado pra (a) anexar tag em descrição da transação relacionada
        // e (b) sincronizar as colunas estruturadas (subtotal_amount, etc) na transação
        // já existente quando a OS é editada após finalizada.
        discount_percent,
        subtotal_amount,
        discount_amount,
    } = body

    // Sanitiza o desconto aqui pra reaproveitar tanto na persistência da OS
    // quanto no sync da transação relacionada lá embaixo.
    const discNumPersisted = Number(discount_percent)
    const hasDiscountPersisted = Number.isFinite(discNumPersisted) && discNumPersisted > 0

    // Baixa de estoque ao SALVAR: toda OS real (não-orçamento) reflete a saída
    // das peças imediatamente, sem esperar o "Finalizar". Orçamento nunca baixa.
    const shouldDeductNow = !(is_estimate || false)

    // Estado anterior da OS (só em edição): se já estava com estoque baixado,
    // precisamos estornar os itens ANTIGOS antes de baixar os novos — assim a
    // edição de quantidade/itens reconcilia o estoque por delta, sem dupla baixa.
    let wasDeducted = false
    let oldProductItems = []
    if (id) {
        const { data: existing } = await supabase
            .from('service_orders')
            .select('stock_deducted')
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .maybeSingle()
        wasDeducted = existing?.stock_deducted === true

        if (wasDeducted) {
            const { data: prevItems } = await supabase
                .from('service_order_items')
                .select('product_id, quantity, type')
                .eq('service_order_id', id)
                .eq('tenant_id', tenantId)
            oldProductItems = (prevItems || []).filter(it => it.type === 'product' && it.product_id)
        }
    }

    const orderData = {
        tenant_id: tenantId,
        client_id: client_id || null,
        client_label: client_label || null,
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
        // Persiste o desconto no service_orders pra que reabrir a OS já mostre
        // o valor lançado. Sem isso, o form lia order.discount_percent = undefined
        // e o campo voltava em branco.
        discount_percent: hasDiscountPersisted ? discNumPersisted : null,
        created_at: service_date_iso || new Date().toISOString(),
        // Marca se esta OS está com estoque baixado depois deste save.
        stock_deducted: shouldDeductNow,
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

    // Reconciliação de estoque por delta.
    // delta[product_id] = soma dos ajustes a aplicar no estoque atual:
    //   + estorno dos itens ANTIGOS (devolve ao estoque) quando a OS já estava baixada
    //   − baixa dos itens NOVOS quando esta OS é real (não-orçamento)
    // Agregar por produto evita race quando o mesmo produto aparece 2x e reduz writes.
    const stockDelta = new Map()
    const addDelta = (productId, amount) => {
        if (!productId || !amount) return
        stockDelta.set(productId, (stockDelta.get(productId) || 0) + amount)
    }

    // Estorno dos itens antigos (estado já refletido no estoque pelo save anterior).
    for (const it of oldProductItems) {
        addDelta(it.product_id, Number(it.quantity) || 0)
    }
    // Baixa dos itens novos da versão atual da OS.
    if (shouldDeductNow) {
        for (const item of items) {
            if (item.type === 'product' && item.product_id) {
                addDelta(item.product_id, -(Number(item.quantity) || 0))
            }
        }
    }

    for (const [productId, delta] of stockDelta) {
        if (!delta) continue
        const { data: prod } = await supabase
            .from('products')
            .select('quantity')
            .eq('id', productId)
            .eq('tenant_id', tenantId)
            .maybeSingle()
        if (prod) {
            await supabase
                .from('products')
                .update({ quantity: (Number(prod.quantity) || 0) + delta })
                .eq('id', productId)
                .eq('tenant_id', tenantId)
        }
    }

    // Sincroniza desconto + total na transação relacionada (se existir).
    // Casos cobertos:
    // - OS finalizada teve o desconto editado depois → transação atualiza, Movimento Diário/Relatórios refletem.
    // - OS sem transação (orçamento, ainda não finalizada) → UPDATE não acha nada, no-op.
    // Mudança aditiva: se a transação foi criada antes deste código existir e tem
    // discount_amount NULL, agora passa a refletir o desconto editado.
    if (orderId && id) {
        const txPatch = {
            amount: total || 0,
            subtotal_amount: hasDiscountPersisted && subtotal_amount != null ? Number(subtotal_amount) : null,
            discount_percent: hasDiscountPersisted ? discNumPersisted : null,
            discount_amount: hasDiscountPersisted && discount_amount != null ? Number(discount_amount) : null,
        }
        await supabase
            .from('transactions')
            .update(txPatch)
            .eq('related_os_id', orderId)
            .eq('tenant_id', tenantId)
        // Erro ignorado de propósito: se não existir transação relacionada (orçamento,
        // OS aberta), o UPDATE não acha nada — comportamento esperado.
    }

    return NextResponse.json({ orderId })
}

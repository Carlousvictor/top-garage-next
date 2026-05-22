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

    const {
        order_id,
        plate,
        total,
        service_date_iso,
        is_retroactive,
        // Quando true, força baixa de estoque mesmo em OS retroativa. Default
        // legado: undefined → mantém comportamento anterior (retroativa = sem
        // baixa). Frontend novo manda explicitamente true/false.
        deduct_stock,
        payment_method,
        payments,  // NEW: optional [{ method, amount }] for split payments
        items = [],
        // Campos opcionais editados no formulário antes de clicar Finalizar.
        // Usamos `... in body` no update pra só sobrescrever quando vieram —
        // assim chamadas legadas (sem esses campos) não zeram dados no banco.
        client_id,
        client_label,
        vehicle_brand,
        vehicle_model,
        observation,
        current_km,
        next_revision_date,
        next_revision_km,
        // Desconto em % aplicado pelo frontend antes de calcular `total`.
        // Opcional; usamos pra anexar tag na descrição da transação E pra popular
        // as colunas estruturadas (subtotal_amount, discount_amount). O total já
        // chega líquido — sem esses campos, comportamento idêntico ao legado.
        discount_percent,
        subtotal_amount,
        discount_amount,
    } = await request.json()

    if (!order_id) {
        return NextResponse.json({ error: 'order_id é obrigatório.' }, { status: 400 })
    }

    // 1. Update OS — finaliza status + persiste campos pendentes do formulário.
    // Só sobrescrevemos campos opcionais quando vieram explicitamente no body,
    // pra não zerar valores salvos quando um client legado chamar sem eles.
    const orderUpdate = {
        status: 'Concluido',
        total,
        created_at: service_date_iso,
    }
    if (client_id !== undefined) orderUpdate.client_id = client_id || null
    if (client_label !== undefined) orderUpdate.client_label = client_label || null
    if (vehicle_brand !== undefined) orderUpdate.vehicle_brand = vehicle_brand || null
    if (vehicle_model !== undefined) orderUpdate.vehicle_model = vehicle_model || null
    if (observation !== undefined) orderUpdate.observation = observation || null
    if (current_km !== undefined) orderUpdate.current_km = current_km ?? null
    if (next_revision_date !== undefined) orderUpdate.next_revision_date = next_revision_date || null
    if (next_revision_km !== undefined) orderUpdate.next_revision_km = next_revision_km ?? null
    // Persiste discount_percent na OS — espelha service_orders e transactions.
    // Sem isso, o desconto editado no form na hora de finalizar não persistia
    // na OS (ficava só na transação criada abaixo).
    if (discount_percent !== undefined) {
        const discNumFinish = Number(discount_percent)
        orderUpdate.discount_percent = Number.isFinite(discNumFinish) && discNumFinish > 0 ? discNumFinish : null
    }

    const { error: osError } = await supabase
        .from('service_orders')
        .update(orderUpdate)
        .eq('id', order_id)
        .eq('tenant_id', tenantId)

    if (osError) return NextResponse.json({ error: osError.message }, { status: 400 })

    // 2. Deduct stock. Regra: OS atual sempre baixa; OS retroativa só baixa
    // quando o usuário marca explicitamente `deduct_stock=true`. Se o campo
    // não veio (cliente legado), preserva comportamento antigo (retroativa
    // não baixa).
    const shouldDeductStock = deduct_stock === true || (deduct_stock === undefined && !is_retroactive)
    if (shouldDeductStock) {
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
    const isSplit = Array.isArray(payments) && payments.length >= 2
    // Anexa o desconto na descrição quando >0 — assim fica rastreável no
    // financeiro sem precisar de coluna nova (mudança aditiva).
    const discNum = Number(discount_percent)
    const discTag = Number.isFinite(discNum) && discNum > 0 ? ` - Desc ${discNum}%` : ''
    const { data: txRow, error: txError } = await supabase
        .from('transactions')
        .insert([{
            tenant_id: tenantId,
            description: `Receita OS #${order_id} - Placa ${plate}${discTag}`,
            type: 'income',
            category: 'Service',
            amount: total,
            related_os_id: order_id,
            status: 'paid',
            payment_method: isSplit ? 'Múltiplo' : (payment_method || 'Dinheiro'),
            date: service_date_iso,
            // Visibilidade do desconto — só popula quando >0; senão fica NULL
            // e relatórios/listagens fazem fallback ao layout antigo.
            subtotal_amount: Number.isFinite(discNum) && discNum > 0 ? Number(subtotal_amount) : null,
            discount_percent: Number.isFinite(discNum) && discNum > 0 ? discNum : null,
            discount_amount: Number.isFinite(discNum) && discNum > 0 ? Number(discount_amount) : null,
        }])
        .select('id')
        .single()

    if (txError) return NextResponse.json({ error: txError.message }, { status: 400 })

    // 4. If split, persist the breakdown
    if (isSplit) {
        const paymentRows = payments.map(p => ({
            transaction_id: txRow.id,
            payment_method: p.method,
            amount: Number(p.amount),
        }))
        const { error: payError } = await supabase
            .from('transaction_payments')
            .insert(paymentRows)
        if (payError) {
            return NextResponse.json({ error: 'Erro ao registrar formas de pagamento: ' + payError.message }, { status: 400 })
        }
    }

    return NextResponse.json({ success: true })
}

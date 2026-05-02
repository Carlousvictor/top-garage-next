import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// Espelha o padrão de /api/service-orders/finish: dual-key lookup do tenant
// pra resolver o bug histórico de profiles.user_id vs .id.
async function getTenantId(supabase, user) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
    if (profile?.tenant_id) return profile.tenant_id

    const { data: profileById } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
    return profileById?.tenant_id ?? null
}

// Checkout do PDV server-side. Antes era tudo no browser (POSForm fazia
// supabase.from(...).insert direto), o que travava silenciosamente quando
// o auth token do client-side expirava no meio do refresh — botão ficava
// em "Processando..." pra sempre porque o await nunca settler. Aqui rodamos
// server-to-server com auth fresco vindo dos cookies.
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

    let body
    try {
        body = await request.json()
    } catch (e) {
        return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const {
        items = [],
        clientLabel = 'Consumidor',
        paymentMethod = 'Dinheiro',
        status = 'paid',
        splitPayment = false,
        payments = null,
        discountPercent = 0,
        total,
    } = body

    if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Carrinho vazio.' }, { status: 400 })
    }
    const totalNum = Number(total)
    if (!Number.isFinite(totalNum) || totalNum < 0) {
        return NextResponse.json({ error: 'Total inválido.' }, { status: 400 })
    }

    const isPending = status === 'pending'
    const isSplit = !!splitPayment && !isPending && Array.isArray(payments) && payments.length === 2

    // 1. Baixa de estoque (em ambos os casos: paid e pending — cliente já saiu com o produto)
    for (const item of items) {
        if (!item?.product_id) continue
        const qty = Number(item.quantity)
        if (!Number.isFinite(qty) || qty <= 0) continue

        const { data: prod, error: prodErr } = await supabase
            .from('products')
            .select('quantity')
            .eq('id', item.product_id)
            .maybeSingle()
        if (prodErr) {
            return NextResponse.json({ error: 'Erro ao consultar produto: ' + prodErr.message }, { status: 400 })
        }
        if (prod) {
            const { error: updErr } = await supabase
                .from('products')
                .update({ quantity: (prod.quantity ?? 0) - qty })
                .eq('id', item.product_id)
            if (updErr) {
                return NextResponse.json({ error: 'Erro ao baixar estoque: ' + updErr.message }, { status: 400 })
            }
        }
    }

    // 2. Monta payload da transação
    const discPctRaw = Number(discountPercent)
    const discPct = Number.isFinite(discPctRaw) && discPctRaw > 0 ? Math.min(discPctRaw, 100) : 0
    const discTag = discPct > 0 ? ` - Desc ${discPct}%` : ''
    const safeClientLabel = (typeof clientLabel === 'string' && clientLabel.trim()) ? clientLabel.trim() : 'Consumidor'
    const description = isPending
        ? `Venda Balcão (PDV) - Em Aberto - ${safeClientLabel}${discTag}`
        : `Venda Balcão (PDV) - ${isSplit ? 'Múltiplo' : paymentMethod} - ${safeClientLabel}${discTag}`
    const txPaymentMethod = isPending
        ? null
        : (isSplit ? 'Múltiplo' : paymentMethod)

    // 3. Insere a transação financeira
    const { data: txRow, error: txError } = await supabase
        .from('transactions')
        .insert([{
            tenant_id: tenantId,
            description,
            type: 'income',
            category: 'Venda de Peças',
            amount: totalNum,
            status,
            date: new Date().toISOString(),
            payment_method: txPaymentMethod,
        }])
        .select('id')
        .single()

    if (txError) {
        return NextResponse.json({ error: 'Erro ao salvar transação: ' + txError.message }, { status: 400 })
    }

    // 4. Se split, persiste o detalhamento das duas formas
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

    return NextResponse.json({ success: true, transaction_id: txRow.id })
}

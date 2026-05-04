import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

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

    const { transaction_id, amount, payment_method, notes } = await request.json()

    if (!transaction_id) {
        return NextResponse.json({ error: 'transaction_id é obrigatório.' }, { status: 400 })
    }
    const valor = Number(amount)
    if (!Number.isFinite(valor) || valor <= 0) {
        return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 })
    }

    // 1. Buscar transação atual (precisa de amount + paid_amount pra validar e decidir status)
    const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .select('id, amount, paid_amount, status, type, tenant_id')
        .eq('id', transaction_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (txErr || !tx) {
        return NextResponse.json({ error: 'Transação não encontrada.' }, { status: 404 })
    }
    if (tx.type !== 'expense') {
        return NextResponse.json({ error: 'Pagamento parcial só é suportado em Contas a Pagar.' }, { status: 400 })
    }
    if (tx.status === 'paid') {
        return NextResponse.json({ error: 'Esta conta já está totalmente paga.' }, { status: 400 })
    }

    const restante = Number(tx.amount) - Number(tx.paid_amount || 0)
    if (valor > restante + 0.001) {
        return NextResponse.json({
            error: `Valor (R$ ${valor.toFixed(2)}) excede o restante (R$ ${restante.toFixed(2)}).`
        }, { status: 400 })
    }

    // 2. Inserir log do parcial
    const { error: logErr } = await supabase
        .from('transaction_partial_payments')
        .insert([{
            transaction_id,
            tenant_id: tenantId,
            amount: valor,
            payment_method: payment_method || 'Dinheiro',
            notes: notes || null,
        }])

    if (logErr) {
        return NextResponse.json({ error: 'Erro ao registrar parcial: ' + logErr.message }, { status: 400 })
    }

    // 3. Atualizar parent: incrementar paid_amount e flipar status se quitou.
    const novoPago = Number(tx.paid_amount || 0) + valor
    const quitou = novoPago + 0.001 >= Number(tx.amount)

    const update = { paid_amount: novoPago }
    if (quitou) {
        update.status = 'paid'
        update.date = new Date().toISOString()
    }

    const { error: updErr } = await supabase
        .from('transactions')
        .update(update)
        .eq('id', transaction_id)
        .eq('tenant_id', tenantId)

    if (updErr) {
        return NextResponse.json({ error: 'Erro ao atualizar transação: ' + updErr.message }, { status: 400 })
    }

    return NextResponse.json({
        success: true,
        paid_amount: novoPago,
        status: quitou ? 'paid' : 'pending',
        remaining: Math.max(0, Number(tx.amount) - novoPago),
    })
}

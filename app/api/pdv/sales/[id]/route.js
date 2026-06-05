import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// Exclusão de venda do PDV, server-side (mesmo motivo do checkout: auth fresco
// via cookie, sem hang de token client-side). Excluir uma venda:
//   1. (opcional) Retorna os itens ao estoque — products.quantity += qtd.
//   2. Remove as formas de pagamento (transaction_payments) da venda, se houver.
//   3. Exclui o lançamento financeiro (a própria transação).
//
// O estorno de estoque é opcional (flag `restock`, default true) porque vendas
// retroativas podem ter sido lançadas SEM baixar estoque (deduct_stock=false no
// checkout) — nesse caso devolver itens inflaria o saldo indevidamente. Como o
// checkout não persiste se baixou ou não, a decisão fica com o operador na UI.

async function getTenantId(supabase, user) {
    const { data: p1 } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
    if (p1?.tenant_id) return p1.tenant_id

    const { data: p2 } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
    return p2?.tenant_id ?? null
}

export async function DELETE(request, { params }) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada para este usuário.' }, { status: 403 })
    }

    const { id } = await params
    if (!id) {
        return NextResponse.json({ error: 'ID da venda ausente.' }, { status: 400 })
    }

    // restock default true; DELETE pode vir sem corpo.
    let restock = true
    try {
        const body = await request.json()
        if (body && body.restock === false) restock = false
    } catch {
        /* sem corpo — mantém default */
    }

    // 1. Carrega a venda e confirma que pertence ao tenant e é venda de PDV.
    const { data: sale, error: saleErr } = await supabase
        .from('transactions')
        .select('id, type, description, items_snapshot, tenant_id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (saleErr) {
        return NextResponse.json({ error: 'Erro ao localizar venda: ' + saleErr.message }, { status: 400 })
    }
    if (!sale) {
        return NextResponse.json({ error: 'Venda não encontrada neste tenant.' }, { status: 404 })
    }
    // Guarda: só permite excluir vendas de balcão (PDV), não qualquer transação.
    const isPdvSale = sale.type === 'income' && /^Venda Balcão \(PDV\)/.test(sale.description || '')
    if (!isPdvSale) {
        return NextResponse.json({ error: 'Esta transação não é uma venda de PDV.' }, { status: 400 })
    }

    // 2. Estorno de estoque (opcional). Devolve a quantidade de cada item.
    let restockedCount = 0
    if (restock && Array.isArray(sale.items_snapshot)) {
        for (const item of sale.items_snapshot) {
            const productId = item?.product_id
            const qty = Number(item?.quantity)
            if (!productId || !Number.isFinite(qty) || qty <= 0) continue

            const { data: prod, error: prodErr } = await supabase
                .from('products')
                .select('quantity')
                .eq('id', productId)
                .eq('tenant_id', tenantId)
                .maybeSingle()
            if (prodErr) {
                return NextResponse.json({ error: 'Erro ao consultar produto para estorno: ' + prodErr.message }, { status: 400 })
            }
            if (prod) {
                const { error: updErr } = await supabase
                    .from('products')
                    .update({ quantity: Number(prod.quantity || 0) + qty })
                    .eq('id', productId)
                    .eq('tenant_id', tenantId)
                if (updErr) {
                    return NextResponse.json({ error: 'Erro ao estornar estoque: ' + updErr.message }, { status: 400 })
                }
                restockedCount += 1
            }
        }
    }

    // 3. Remove as formas de pagamento da venda (split), se houver. Não é fatal
    // se a tabela/linha não existir — segue para excluir a transação.
    const { error: payErr } = await supabase
        .from('transaction_payments')
        .delete()
        .eq('transaction_id', sale.id)
    if (payErr) {
        console.warn('[pdv/sales DELETE] falha ao remover transaction_payments:', payErr.message)
    }

    // 4. Exclui o lançamento financeiro (a venda).
    const { error: delErr } = await supabase
        .from('transactions')
        .delete()
        .eq('id', sale.id)
        .eq('tenant_id', tenantId)
    if (delErr) {
        return NextResponse.json({ error: 'Erro ao excluir venda: ' + delErr.message }, { status: 400 })
    }

    // Invalida o cache SSR das telas que dependem do saldo/lançamentos.
    revalidatePath('/pdv/sales')
    revalidatePath('/stock')
    revalidatePath('/financial')

    return NextResponse.json({ success: true, restocked: restockedCount })
}

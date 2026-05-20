import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// GET: carrega entry + items + transações pra preencher o modal de edição.
// PUT: edita a NF — reverte estoque, troca itens, reaplica estoque e
// regenera as transações financeiras. Idempotente: roda múltiplas vezes
// e converge no mesmo estado final.

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

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const dynamic = 'force-dynamic'

export async function GET(_request, { params }) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 403 })
    }
    const { id } = await params
    const entryId = Number(id)
    if (!Number.isInteger(entryId)) {
        return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
    }

    const { data: entry, error: entryErr } = await supabase
        .from('stock_entries')
        .select('*, suppliers(id, name, cnpj)')
        .eq('id', entryId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
    if (entryErr) {
        return NextResponse.json({ error: entryErr.message }, { status: 500 })
    }
    if (!entry) {
        return NextResponse.json({ error: 'Nota não encontrada.' }, { status: 404 })
    }

    const { data: items, error: itemsErr } = await supabase
        .from('stock_entry_items')
        .select('*')
        .eq('stock_entry_id', entryId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
    if (itemsErr) {
        return NextResponse.json({ error: itemsErr.message }, { status: 500 })
    }

    const { data: txs } = await supabase
        .from('transactions')
        .select('id, description, type, category, amount, due_date, status, payment_method, date')
        .eq('related_stock_entry_id', entryId)
        .eq('tenant_id', tenantId)
        .order('due_date', { ascending: true, nullsFirst: false })

    // Inclui suppliers no payload para o modal não precisar de uma chamada
    // client-side separada — supabase.from(...) no browser trava com token
    // stale, prendendo o Promise.all do modal em "Carregando..." indefinido.
    const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, name, cnpj')
        .eq('tenant_id', tenantId)
        .order('name')

    return NextResponse.json({
        entry,
        items: items || [],
        transactions: txs || [],
        suppliers: suppliers || []
    })
}

export async function PUT(request, { params }) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 403 })
    }
    const { id } = await params
    const entryId = Number(id)
    if (!Number.isInteger(entryId)) {
        return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
    }

    let body
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const {
        supplier,
        invoiceNumber,
        emissionDate,
        items,
        freightAmount = 0,
        discountMode = 'total',
        discountAmount = 0,
        paymentMode,
        upfrontMethod,
        installments = []
    } = body

    if (!supplier || !invoiceNumber || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
    }
    if (!['total', 'per_item'].includes(discountMode)) {
        return NextResponse.json({ error: 'Modo de desconto inválido.' }, { status: 400 })
    }

    try {
        // 0. Confirma posse da nota antes de qualquer escrita.
        const { data: currentEntry, error: curErr } = await supabase
            .from('stock_entries')
            .select('id')
            .eq('id', entryId)
            .eq('tenant_id', tenantId)
            .maybeSingle()
        if (curErr) throw new Error(curErr.message)
        if (!currentEntry) {
            return NextResponse.json({ error: 'Nota não encontrada ou pertence a outro tenant.' }, { status: 404 })
        }

        // 1. Reverter estoque dos itens atuais antes de re-aplicar.
        const { data: oldItems, error: oldErr } = await supabase
            .from('stock_entry_items')
            .select('product_id, quantity')
            .eq('stock_entry_id', entryId)
            .eq('tenant_id', tenantId)
        if (oldErr) throw new Error(`Erro lendo itens atuais: ${oldErr.message}`)

        for (const old of (oldItems || [])) {
            if (!old.product_id) continue
            const { data: prod } = await supabase
                .from('products')
                .select('quantity')
                .eq('id', old.product_id)
                .eq('tenant_id', tenantId)
                .maybeSingle()
            if (!prod) continue
            const reverted = Number(prod.quantity || 0) - Number(old.quantity || 0)
            const { error: revErr } = await supabase
                .from('products')
                .update({ quantity: reverted })
                .eq('id', old.product_id)
                .eq('tenant_id', tenantId)
            if (revErr) throw new Error(`Erro revertendo estoque: ${revErr.message}`)
        }

        // 2. Limpa itens e transações antigas — vamos regerar tudo.
        const { error: delItemsErr } = await supabase
            .from('stock_entry_items')
            .delete()
            .eq('stock_entry_id', entryId)
            .eq('tenant_id', tenantId)
        if (delItemsErr) throw new Error(`Erro removendo itens antigos: ${delItemsErr.message}`)

        const { error: delTxErr } = await supabase
            .from('transactions')
            .delete()
            .eq('related_stock_entry_id', entryId)
            .eq('tenant_id', tenantId)
        if (delTxErr) throw new Error(`Erro removendo transações antigas: ${delTxErr.message}`)

        // 3. Resolve fornecedor (igual ao manual-entry: aceita existing id ou novo).
        let supplierId
        if (supplier.isNew) {
            if (!supplier.cnpj?.trim()) {
                return NextResponse.json({ error: 'CNPJ obrigatório ao cadastrar novo fornecedor.' }, { status: 400 })
            }
            const { data: existing } = await supabase
                .from('suppliers')
                .select('id')
                .eq('cnpj', supplier.cnpj.trim())
                .eq('tenant_id', tenantId)
                .maybeSingle()
            if (existing) {
                supplierId = existing.id
            } else {
                let { data: created, error: createErr } = await supabase
                    .from('suppliers')
                    .insert([{ tenant_id: tenantId, name: supplier.name.trim(), cnpj: supplier.cnpj.trim() }])
                    .select('id')
                    .single()
                if (createErr?.code === '23505') {
                    const { data: retried } = await supabase
                        .from('suppliers')
                        .select('id')
                        .eq('cnpj', supplier.cnpj.trim())
                        .eq('tenant_id', tenantId)
                        .maybeSingle()
                    if (retried) { created = retried; createErr = null }
                }
                if (createErr) throw new Error(`Erro ao criar fornecedor: ${createErr.message}`)
                supplierId = created.id
            }
        } else {
            supplierId = supplier.id
        }

        // 4. Normaliza + cálculo de rateios (cópia da lógica de manual-entry).
        const normalized = items.map(it => {
            const qty = parseFloat(it.quantity) || 0
            const unitCost = parseFloat(it.cost_price) || 0
            const subtotal = round2(qty * unitCost)
            const perItemDisc = discountMode === 'per_item' ? round2(it.discount_amount || 0) : 0
            return { ...it, qty, unitCost, subtotal, perItemDisc }
        })
        const sumSubtotals = normalized.reduce((acc, it) => acc + it.subtotal, 0)
        const freight = round2(freightAmount)
        const totalDiscount = discountMode === 'total' ? round2(discountAmount) : 0
        const perItemDiscTotal = discountMode === 'per_item'
            ? normalized.reduce((acc, it) => acc + it.perItemDisc, 0)
            : 0
        const nfTotal = round2(sumSubtotals + freight - totalDiscount - perItemDiscTotal)
        if (nfTotal < 0) {
            return NextResponse.json({ error: 'Total da NF ficou negativo.' }, { status: 400 })
        }

        // 5. Upsert produtos + monta novas linhas de stock_entry_items.
        const stockEntryItemsRows = []
        for (const it of normalized) {
            const share = sumSubtotals > 0 ? it.subtotal / sumSubtotals : 0
            const freightShare = round2(freight * share)
            const globalDiscShare = round2(totalDiscount * share)
            const lineDiscount = discountMode === 'per_item' ? it.perItemDisc : globalDiscShare
            const lineNet = round2(it.subtotal + freightShare - lineDiscount)
            const finalUnitCost = it.qty > 0 ? round2(lineNet / it.qty) : 0
            const margin = parseFloat(it.margin) || 0
            const finalSellingPrice = round2(finalUnitCost * (1 + margin / 100))

            let existingProd = null
            if (it.product_id) {
                const { data } = await supabase
                    .from('products')
                    .select('id, quantity, ean')
                    .eq('tenant_id', tenantId)
                    .eq('id', it.product_id)
                    .maybeSingle()
                existingProd = data
            }
            if (!existingProd && it.link_product_id) {
                const { data } = await supabase
                    .from('products')
                    .select('id, quantity, ean')
                    .eq('tenant_id', tenantId)
                    .eq('id', it.link_product_id)
                    .maybeSingle()
                existingProd = data
            }
            if (!existingProd && it.ean?.trim()) {
                const { data } = await supabase
                    .from('products')
                    .select('id, quantity, ean')
                    .eq('tenant_id', tenantId)
                    .eq('ean', it.ean.trim())
                    .maybeSingle()
                existingProd = data
            }
            if (!existingProd && it.sku?.trim()) {
                const { data } = await supabase
                    .from('products')
                    .select('id, quantity, ean')
                    .eq('tenant_id', tenantId)
                    .eq('sku', it.sku.trim())
                    .eq('supplier_id', supplierId)
                    .maybeSingle()
                existingProd = data
            }

            let finalProductId
            if (existingProd) {
                const updatePayload = {
                    quantity: Number(existingProd.quantity || 0) + it.qty,
                    cost_price: finalUnitCost,
                    selling_price: finalSellingPrice,
                    profit_margin_percent: margin,
                    supplier_id: supplierId
                }
                if (it.ean?.trim() && !existingProd.ean) updatePayload.ean = it.ean.trim()
                const { data: updated, error: updErr } = await supabase
                    .from('products')
                    .update(updatePayload)
                    .eq('id', existingProd.id)
                    .eq('tenant_id', tenantId)
                    .select('id')
                if (updErr) throw new Error(`Erro atualizar produto: ${updErr.message}`)
                if (!updated || updated.length === 0) {
                    throw new Error(`Falha ao reaplicar quantidade em "${it.name}".`)
                }
                finalProductId = existingProd.id
            } else {
                const { data: newProd, error: insErr } = await supabase
                    .from('products')
                    .insert([{
                        tenant_id: tenantId,
                        sku: it.sku?.trim() || null,
                        ean: it.ean?.trim() || null,
                        name: it.name.trim(),
                        cost_price: finalUnitCost,
                        selling_price: finalSellingPrice,
                        profit_margin_percent: margin,
                        quantity: it.qty,
                        supplier_id: supplierId
                    }])
                    .select('id')
                    .single()
                if (insErr) throw new Error(`Erro inserir produto: ${insErr.message}`)
                finalProductId = newProd.id
            }

            stockEntryItemsRows.push({
                tenant_id: tenantId,
                stock_entry_id: entryId,
                product_id: finalProductId,
                sku: it.sku?.trim() || null,
                ean: it.ean?.trim() || null,
                name: it.name.trim(),
                quantity: it.qty,
                cost_price: finalUnitCost,
                selling_price: finalSellingPrice,
                discount_amount: lineDiscount
            })
        }

        // 6. Atualiza header da NF.
        const supplierLabel = supplier.isNew ? supplier.name.trim() : (supplier.name || 'Fornecedor')
        const { error: headerErr } = await supabase
            .from('stock_entries')
            .update({
                supplier_id: supplierId,
                invoice_number: invoiceNumber ? String(invoiceNumber).trim() : null,
                emission_date: emissionDate || null,
                total_value: nfTotal,
                freight_amount: freight,
                discount_amount: totalDiscount,
                discount_mode: discountMode
            })
            .eq('id', entryId)
            .eq('tenant_id', tenantId)
        if (headerErr) throw new Error(`Erro atualizando NF: ${headerErr.message}`)

        // 7. Re-insere itens.
        const { error: itemsErr } = await supabase.from('stock_entry_items').insert(stockEntryItemsRows)
        if (itemsErr) throw new Error(`Erro inserindo itens novos: ${itemsErr.message}`)

        // 8. Re-cria transações financeiras vinculadas.
        const nowIso = new Date().toISOString()
        let txRows
        if (paymentMode === 'installments') {
            if (!installments.length) throw new Error('Parcelas vazias.')
            txRows = installments.map((p, idx) => ({
                tenant_id: tenantId,
                description: `NF ${invoiceNumber} - ${supplierLabel} (${idx + 1}/${installments.length})`,
                type: 'expense',
                category: 'Fornecedores',
                amount: parseFloat(p.amount),
                due_date: p.dueDate,
                status: p.status === 'paid' ? 'paid' : 'pending',
                payment_method: p.paymentMethod,
                related_stock_entry_id: entryId,
                date: nowIso
            }))
        } else {
            txRows = [{
                tenant_id: tenantId,
                description: `NF ${invoiceNumber} - ${supplierLabel} (à vista)`,
                type: 'expense',
                category: 'Fornecedores',
                amount: nfTotal,
                due_date: null,
                status: 'paid',
                payment_method: upfrontMethod || 'Dinheiro',
                related_stock_entry_id: entryId,
                date: nowIso
            }]
        }
        const { error: txErr } = await supabase.from('transactions').insert(txRows)
        if (txErr) throw new Error(`Erro registrando transações: ${txErr.message}`)

        revalidatePath('/stock')
        revalidatePath('/import')
        revalidatePath('/financial')

        return NextResponse.json({
            success: true,
            entryId,
            total: nfTotal,
            itemCount: items.length,
            transactionCount: txRows.length
        })
    } catch (err) {
        console.error('[stock/entries/:id PUT] failure:', err)
        return NextResponse.json({ error: err.message || 'Falha ao editar NF.' }, { status: 500 })
    }
}

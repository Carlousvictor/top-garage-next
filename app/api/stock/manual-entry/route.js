import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// Entrada manual de NF, server-side. Substitui a versão client-side que
// disparava AbortError ("signal is aborted without reason") quando a sessão
// supabase refreshava mid-call. Mesma estratégia do /api/stock/import (XML).
// Inclui frete e desconto (total ou per-item) — campos novos exclusivos do
// fluxo manual; XML continua igual.

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
    } catch {
        return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const {
        supplier,            // { id?, name, cnpj?, isNew }
        invoiceNumber,
        emissionDate,        // YYYY-MM-DD
        items,               // [{ name, sku, ean, quantity, cost_price, margin, selling_price, discount_amount? }]
        freightAmount = 0,
        discountMode = 'total',  // 'total' | 'per_item'
        discountAmount = 0,      // só usado quando discountMode === 'total'
        paymentMode,             // 'upfront' | 'installments'
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
        // 1. Fornecedor (resolve existente ou cria com retry em unique-violation)
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

        // 2. Cálculos: rateio de frete e desconto-total proporcional ao subtotal de cada item
        const normalized = items.map(it => {
            const qty = parseFloat(it.quantity) || 0
            const unitCost = parseFloat(it.cost_price) || 0
            const subtotal = round2(qty * unitCost)
            const perItemDisc = discountMode === 'per_item' ? round2(it.discount_amount || 0) : 0
            return {
                ...it,
                qty,
                unitCost,
                subtotal,
                perItemDisc
            }
        })

        const sumSubtotals = normalized.reduce((acc, it) => acc + it.subtotal, 0)
        const freight = round2(freightAmount)
        const totalDiscount = discountMode === 'total' ? round2(discountAmount) : 0
        const perItemDiscTotal = discountMode === 'per_item'
            ? normalized.reduce((acc, it) => acc + it.perItemDisc, 0)
            : 0

        const nfTotal = round2(sumSubtotals + freight - totalDiscount - perItemDiscTotal)
        if (nfTotal < 0) {
            return NextResponse.json({ error: 'Total da NF ficou negativo após frete/desconto.' }, { status: 400 })
        }

        // 3. Upsert produtos + monta linhas de stock_entry_items com custo final ajustado
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
            // Quando link_product_id está setado, o operador escolheu
            // EXPLICITAMENTE somar o saldo a esse produto. Se não acharmos
            // a row, falhamos hard — nunca caímos pra fallback nem
            // criamos produto novo (era exatamente isso que gerava
            // duplicidade quando o picker "Adicionar a item existente"
            // era usado).
            const hasExplicitLink = it.link_product_id !== null && it.link_product_id !== undefined && it.link_product_id !== ''

            if (hasExplicitLink) {
                const linkId = typeof it.link_product_id === 'string'
                    ? (/^\d+$/.test(it.link_product_id) ? Number(it.link_product_id) : it.link_product_id)
                    : it.link_product_id
                const { data, error: selErr } = await supabase
                    .from('products')
                    .select('id, quantity, ean')
                    .eq('tenant_id', tenantId)
                    .eq('id', linkId)
                    .maybeSingle()
                if (selErr) throw new Error(`Erro localizando produto vinculado: ${selErr.message}`)
                if (!data) {
                    throw new Error(`Produto vinculado (id=${linkId}) não encontrado neste tenant. Reabra "Adicionar a item existente" e selecione o item novamente.`)
                }
                existingProd = data
            } else {
                // (b) Match automático por EAN (digitado manualmente).
                if (it.ean?.trim()) {
                    const { data } = await supabase
                        .from('products')
                        .select('id, quantity, ean')
                        .eq('tenant_id', tenantId)
                        .eq('ean', it.ean.trim())
                        .maybeSingle()
                    existingProd = data
                }
                // (c) Match automático por SKU + fornecedor.
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
                // .select() + .eq('tenant_id') confirma que o UPDATE de fato
                // tocou a linha do produto. Sem isso, uma RLS bloqueando o
                // WITH CHECK passava silenciosamente (rowCount=0, sem error)
                // e a quantidade do produto ficava congelada no valor antigo —
                // sintoma: "lancei a NF mas as quantidades não constam no
                // estoque". Verificar updated.length permite falhar explícito.
                const { data: updated, error: updErr } = await supabase
                    .from('products')
                    .update(updatePayload)
                    .eq('id', existingProd.id)
                    .eq('tenant_id', tenantId)
                    .select('id, quantity')
                if (updErr) throw new Error(`Erro atualizar produto: ${updErr.message}`)
                if (!updated || updated.length === 0) {
                    throw new Error(`Falha ao atualizar produto "${it.name}" — quantidade não foi gravada. Verifique permissões (RLS) ou se o produto pertence ao tenant correto.`)
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

            // Equivalências: operador escolheu produtos relacionados no picker.
            if (Array.isArray(it.linked_product_ids) && it.linked_product_ids.length > 0) {
                const cleanIds = it.linked_product_ids.filter(Boolean).filter(id => id !== finalProductId)
                if (cleanIds.length > 0) {
                    const { data: cur } = await supabase
                        .from('products')
                        .select('linked_products')
                        .eq('id', finalProductId)
                        .eq('tenant_id', tenantId)
                        .maybeSingle()
                    const existing = Array.isArray(cur?.linked_products) ? cur.linked_products : []
                    const merged = Array.from(new Set([...existing, ...cleanIds]))
                    await supabase
                        .from('products')
                        .update({ linked_products: merged })
                        .eq('id', finalProductId)
                        .eq('tenant_id', tenantId)
                }
            }

            stockEntryItemsRows.push({
                tenant_id: tenantId,
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

        // 4. stock_entries
        const { data: entry, error: entryErr } = await supabase
            .from('stock_entries')
            .insert([{
                tenant_id: tenantId,
                supplier_id: supplierId,
                xml_key: null,
                invoice_number: invoiceNumber ? String(invoiceNumber).trim() : null,
                emission_date: emissionDate || null,
                total_value: nfTotal,
                freight_amount: freight,
                discount_amount: totalDiscount,
                discount_mode: discountMode
            }])
            .select('id')
            .single()
        if (entryErr) throw new Error(`Erro registrar entrada: ${entryErr.message}`)

        // 5. stock_entry_items
        const finalEntryItems = stockEntryItemsRows.map(row => ({ ...row, stock_entry_id: entry.id }))
        const { error: itemsErr } = await supabase.from('stock_entry_items').insert(finalEntryItems)
        if (itemsErr) {
            await supabase.from('stock_entries').delete().eq('id', entry.id)
            throw new Error(`Erro registrar itens: ${itemsErr.message}`)
        }

        // 6. Transactions (mesma lógica do XML)
        const nowIso = new Date().toISOString()
        const supplierLabel = supplier.isNew ? supplier.name.trim() : (supplier.name || 'Fornecedor')
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
                status: 'pending',
                payment_method: p.paymentMethod,
                related_stock_entry_id: entry.id,
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
                related_stock_entry_id: entry.id,
                date: nowIso
            }]
        }

        const { error: txErr } = await supabase.from('transactions').insert(txRows)
        if (txErr) throw new Error(`Erro registrar transação: ${txErr.message}`)

        // Invalida o cache SSR das telas que dependem dos produtos atualizados.
        // Sem isso, os itens entravam no banco mas a tela /stock continuava
        // mostrando o snapshot anterior — sintoma reportado pelo operador
        // como "não está adicionando os itens no estoque".
        revalidatePath('/stock')
        revalidatePath('/import')

        return NextResponse.json({
            success: true,
            entryId: entry.id,
            total: nfTotal,
            itemCount: items.length,
            transactionCount: txRows.length
        })
    } catch (err) {
        console.error('[stock/manual-entry] failure:', err)
        return NextResponse.json({ error: err.message || 'Falha ao registrar entrada manual.' }, { status: 500 })
    }
}

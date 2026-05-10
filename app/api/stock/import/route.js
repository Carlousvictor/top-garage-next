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
        return NextResponse.json({ error: 'Empresa não encontrada para este usuário.' }, { status: 403 })
    }

    let body
    try {
        body = await request.json()
    } catch (e) {
        return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const {
        importData,
        previewItems,
        installments,
        isPaidUpfront,
        upfrontPaymentMethod,
        freightAmount = 0,
        discountMode = 'total',  // 'total' | 'per_item'
        discountAmount = 0       // só usado quando discountMode === 'total'
    } = body

    if (!importData || !previewItems || previewItems.length === 0) {
        return NextResponse.json({ error: 'Dados incompletos para importação.' }, { status: 400 })
    }
    if (!['total', 'per_item'].includes(discountMode)) {
        return NextResponse.json({ error: 'Modo de desconto inválido.' }, { status: 400 })
    }

    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
    const freight = round2(freightAmount)
    const totalDiscount = discountMode === 'total' ? round2(discountAmount) : 0

    try {
        // 1. Get/Create Supplier
        let supplierId;
        const { data: supplier } = await supabase
            .from('suppliers')
            .select('id')
            .eq('cnpj', importData.supplierCNPJ)
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (supplier) {
            supplierId = supplier.id;
        } else {
            let { data: newSupplier, error: createError } = await supabase
                .from('suppliers')
                .insert([{
                    tenant_id: tenantId,
                    name: importData.supplierName,
                    cnpj: importData.supplierCNPJ
                }])
                .select()
                .single();

            // 23505 = unique_violation. Depois da migração que torna o CNPJ único
            // por tenant, a única forma de cair aqui é uma corrida com outra
            // importação concorrente do mesmo fornecedor — basta re-buscar.
            if (createError?.code === '23505') {
                const { data: retried } = await supabase
                    .from('suppliers')
                    .select('id')
                    .eq('cnpj', importData.supplierCNPJ)
                    .eq('tenant_id', tenantId)
                    .maybeSingle();
                if (retried) {
                    newSupplier = retried;
                    createError = null;
                }
            }

            if (createError) throw new Error(`Erro ao criar fornecedor: ${createError.message}`);
            supplierId = newSupplier.id;
        }

        // 2. Process Items — com rateio de frete e desconto-total
        //    (per_item: cada linha carrega seu próprio desconto vindo do payload)
        const normalized = previewItems.map(it => {
            const qty = parseFloat(it.quantity) || 0
            const unitCost = parseFloat(it.cost_price) || 0
            const subtotal = round2(qty * unitCost)
            const perItemDisc = discountMode === 'per_item' ? round2(it.discount_amount || 0) : 0
            return { ...it, qty, unitCost, subtotal, perItemDisc }
        })
        const sumSubtotals = normalized.reduce((acc, it) => acc + it.subtotal, 0)
        const perItemDiscTotal = discountMode === 'per_item'
            ? normalized.reduce((acc, it) => acc + it.perItemDisc, 0)
            : 0

        const stockEntryItemsRows = [];

        for (const item of normalized) {
            const share = sumSubtotals > 0 ? item.subtotal / sumSubtotals : 0
            const freightShare = round2(freight * share)
            const globalDiscShare = round2(totalDiscount * share)
            const lineDiscount = discountMode === 'per_item' ? item.perItemDisc : globalDiscShare
            const lineNet = round2(item.subtotal + freightShare - lineDiscount)
            const finalUnitCost = item.qty > 0 ? round2(lineNet / item.qty) : 0
            const margin = parseFloat(item.margin) || 0
            const finalSellingPrice = round2(finalUnitCost * (1 + margin / 100))

            let existingProd = null;

            if (item.ean) {
                const { data } = await supabase
                    .from('products')
                    .select('id, quantity, ean')
                    .eq('tenant_id', tenantId)
                    .eq('ean', item.ean)
                    .maybeSingle();
                existingProd = data;
            }

            if (!existingProd) {
                const { data } = await supabase
                    .from('products')
                    .select('id, quantity, ean')
                    .eq('sku', item.sku)
                    .eq('supplier_id', supplierId)
                    .eq('tenant_id', tenantId)
                    .maybeSingle();
                existingProd = data;
            }

            let finalProductId;

            if (existingProd) {
                const updatePayload = {
                    quantity: Number(existingProd.quantity || 0) + item.qty,
                    cost_price: finalUnitCost,
                    selling_price: finalSellingPrice,
                    profit_margin_percent: margin,
                    supplier_id: supplierId
                };
                if (item.ean && !existingProd.ean) {
                    updatePayload.ean = item.ean;
                }
                const { error: updErr } = await supabase.from('products').update(updatePayload).eq('id', existingProd.id);
                if (updErr) throw new Error(`Erro atualizar produto: ${updErr.message}`);
                finalProductId = existingProd.id;
            } else {
                const { data: newProd, error: insErr } = await supabase.from('products').insert([{
                    tenant_id: tenantId,
                    sku: item.sku,
                    ean: item.ean,
                    name: item.name,
                    cost_price: finalUnitCost,
                    selling_price: finalSellingPrice,
                    profit_margin_percent: margin,
                    quantity: item.qty,
                    supplier_id: supplierId
                }]).select('id').single();
                if (insErr) throw new Error(`Erro inserir produto: ${insErr.message}`);
                finalProductId = newProd.id;
            }

            stockEntryItemsRows.push({
                tenant_id: tenantId,
                product_id: finalProductId,
                sku: item.sku,
                ean: item.ean,
                name: item.name,
                quantity: item.qty,
                cost_price: finalUnitCost,
                selling_price: finalSellingPrice,
                discount_amount: lineDiscount
            });
        }

        // Total final da NF respeitando frete/desconto. Se o XML original já
        // veio com totalValue alinhado a vFrete/vDesc, preservamos o número da
        // NFe (importData.totalValue); senão, recalculamos.
        const computedTotal = round2(sumSubtotals + freight - totalDiscount - perItemDiscTotal)
        const nfTotal = (Number(importData.totalValue) > 0)
            ? round2(importData.totalValue)
            : computedTotal

        // 3. Register Stock Entry
        const { data: entryData, error: entryError } = await supabase.from('stock_entries').insert([{
            tenant_id: tenantId,
            supplier_id: supplierId,
            xml_key: importData.xmlKey,
            total_value: nfTotal,
            freight_amount: freight,
            discount_amount: totalDiscount,
            discount_mode: discountMode
        }]).select().single();

        if (entryError) throw new Error(`Erro registrar entrada: ${entryError.message}`);

        // 4. Register Stock Entry Items
        const finalEntryItems = stockEntryItemsRows.map(row => ({
            ...row,
            stock_entry_id: entryData.id
        }));
        const { error: itemsError } = await supabase.from('stock_entry_items').insert(finalEntryItems);
        if (itemsError) {
            // Rollback the stock entry to prevent orphaned records
            await supabase.from('stock_entries').delete().eq('id', entryData.id);
            throw new Error(`Erro registrar itens da entrada: ${itemsError.message}`);
        }

        // 5. Register Transactions
        const nowIso = new Date().toISOString();
        let transactionRows;
        if (installments.length > 0) {
            transactionRows = installments.map(p => ({
                tenant_id: tenantId,
                description: p.description,
                type: 'expense',
                category: 'Fornecedores',
                amount: parseFloat(p.amount),
                due_date: p.dueDate,
                status: 'pending',
                payment_method: p.paymentMethod,
                related_stock_entry_id: entryData.id,
                date: nowIso
            }));
        } else {
            const desc = `NFe ${importData.invoiceNumber} - ${importData.supplierName} (à vista)`;
            transactionRows = [isPaidUpfront ? {
                tenant_id: tenantId,
                description: desc,
                type: 'expense',
                category: 'Fornecedores',
                amount: nfTotal,
                due_date: null,
                status: 'paid',
                payment_method: upfrontPaymentMethod,
                related_stock_entry_id: entryData.id,
                date: nowIso
            } : {
                tenant_id: tenantId,
                description: desc,
                type: 'expense',
                category: 'Fornecedores',
                amount: nfTotal,
                due_date: importData.emissionDate,
                status: 'pending',
                payment_method: 'Boleto',
                related_stock_entry_id: entryData.id,
                date: nowIso
            }];
        }

        const { error: txError } = await supabase.from('transactions').insert(transactionRows);
        if (txError) throw new Error(`Erro registrar transação: ${txError.message}`);

        return NextResponse.json({ success: true, transactionCount: transactionRows.length })

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

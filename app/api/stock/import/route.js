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
        upfrontPaymentMethod
    } = body

    if (!importData || !previewItems || previewItems.length === 0) {
        return NextResponse.json({ error: 'Dados incompletos para importação.' }, { status: 400 })
    }

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
            const { data: newSupplier, error: createError } = await supabase
                .from('suppliers')
                .insert([{
                    tenant_id: tenantId,
                    name: importData.supplierName,
                    cnpj: importData.supplierCNPJ
                }])
                .select()
                .single();
            if (createError) throw new Error(`Erro ao criar fornecedor: ${createError.message}`);
            supplierId = newSupplier.id;
        }

        // 2. Process Items
        for (const item of previewItems) {
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

            if (existingProd) {
                const updatePayload = {
                    quantity: Number(existingProd.quantity || 0) + parseFloat(item.quantity),
                    cost_price: item.cost_price,
                    selling_price: item.selling_price,
                    supplier_id: supplierId
                };
                if (item.ean && !existingProd.ean) {
                    updatePayload.ean = item.ean;
                }
                const { error: updErr } = await supabase.from('products').update(updatePayload).eq('id', existingProd.id);
                if (updErr) throw new Error(`Erro atualizar produto: ${updErr.message}`);
            } else {
                const { error: insErr } = await supabase.from('products').insert([{
                    tenant_id: tenantId,
                    sku: item.sku,
                    ean: item.ean,
                    name: item.name,
                    cost_price: item.cost_price,
                    selling_price: item.selling_price,
                    quantity: parseFloat(item.quantity),
                    supplier_id: supplierId
                }]);
                if (insErr) throw new Error(`Erro inserir produto: ${insErr.message}`);
            }
        }

        // 3. Register Stock Entry
        const { data: entryData, error: entryError } = await supabase.from('stock_entries').insert([{
            tenant_id: tenantId,
            supplier_id: supplierId,
            xml_key: importData.xmlKey,
            total_value: importData.totalValue
        }]).select().single();

        if (entryError) throw new Error(`Erro registrar entrada: ${entryError.message}`);

        // 4. Register Transactions
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
                amount: importData.totalValue,
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
                amount: importData.totalValue,
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

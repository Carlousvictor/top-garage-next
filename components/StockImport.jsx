"use client"
import { useState } from 'react';
import { XMLParser } from 'fast-xml-parser';
import { createClient } from '../utils/supabase/client';
import { useAuth } from '../context/AuthContext';

export default function StockImport() {
    const supabase = createClient();
    const { tenantId } = useAuth();

    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [margin, setMargin] = useState(30); // Default margin 30%
    const [previewItems, setPreviewItems] = useState([]); // Items parsed from XML
    const [importData, setImportData] = useState(null); // Metadata (Supplier, Invoice Info)
    const [installments, setInstallments] = useState([]); // Parcelas extraídas de <cobr>/<dup>
    const [isPaidUpfront, setIsPaidUpfront] = useState(false); // UI flag para NFe à vista (sem <cobr>)
    const [upfrontPaymentMethod, setUpfrontPaymentMethod] = useState('Dinheiro');

    const addLog = (message, type = 'info') => {
        setLogs(prev => [...prev, { message, type, time: new Date().toLocaleTimeString() }]);
    };

    // Normaliza cEAN: trata "SEM GTIN", vazio e valores não-numéricos como ausência de EAN.
    // EAN/GTIN válidos têm 8, 12, 13 ou 14 dígitos.
    const normalizeEan = (raw) => {
        if (!raw) return null;
        const str = String(raw).trim();
        if (!str || str.toUpperCase() === 'SEM GTIN') return null;
        if (!/^\d{8,14}$/.test(str)) return null;
        return str;
    };

    const parseInstallments = (infNFe, supplierName, invoiceNumber) => {
        if (!infNFe.cobr || !infNFe.cobr.dup) return [];
        const dups = Array.isArray(infNFe.cobr.dup) ? infNFe.cobr.dup : [infNFe.cobr.dup];
        return dups.map((dup, idx) => ({
            id: idx,
            nDup: dup.nDup,
            dueDate: dup.dVenc,
            amount: parseFloat(dup.vDup),
            paymentMethod: 'Boleto',
            description: `NFe ${invoiceNumber} - ${supplierName} (${idx + 1}/${dups.length})`
        }));
    };

    const checkDuplicateImport = async (xmlKey) => {
        const { data } = await supabase
            .from('stock_entries')
            .select('id, created_at')
            .eq('xml_key', xmlKey)
            .eq('tenant_id', tenantId)
            .maybeSingle();
        return { isDuplicate: !!data, importedAt: data?.created_at || null };
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setLoading(true);
        setLogs([]);
        setPreviewItems([]);
        setImportData(null);
        setInstallments([]);
        setIsPaidUpfront(false);
        setUpfrontPaymentMethod('Dinheiro');
        addLog(`Lendo arquivo: ${file.name}`);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const xmlData = e.target.result;
                const parser = new XMLParser({
                    ignoreAttributes: false,
                    attributeNamePrefix: "@_"
                });

                const jsonObj = parser.parse(xmlData);
                await parseNFeByPreview(jsonObj);
            } catch (error) {
                addLog(`Erro ao ler XML: ${error.message}`, 'error');
                setLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const parseNFeByPreview = async (nfeData) => {
        try {
            const nfeProc = nfeData.nfeProc || nfeData.NFe;
            const infNFe = nfeProc.NFe ? nfeProc.NFe.infNFe : nfeProc.infNFe;
            const emit = infNFe.emit;
            const ide = infNFe.ide;
            const dets = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det];
            const xmlKey = infNFe["@_Id"];

            // Idempotency: bloquear reimport do mesmo XML
            const { isDuplicate, importedAt } = await checkDuplicateImport(xmlKey);
            if (isDuplicate) {
                const dateStr = importedAt ? new Date(importedAt).toLocaleDateString() : 'data desconhecida';
                addLog(`Esta NFe já foi importada em ${dateStr}. Importação abortada.`, 'error');
                setLoading(false);
                return;
            }

            // Extract items for preview
            const items = dets.map((item, index) => {
                const prod = item.prod;
                const costPrice = parseFloat(prod.vUnCom);
                const sellingPrice = costPrice * (1 + (margin / 100));

                return {
                    id: index, // Temporary ID for list key
                    sku: prod.cProd,
                    ean: normalizeEan(prod.cEAN),
                    name: prod.xProd,
                    cost_price: costPrice,
                    selling_price: parseFloat(sellingPrice.toFixed(2)),
                    quantity: parseFloat(prod.qCom),
                    unit: prod.uCom,
                    matchStatus: 'unknown', // 'matched_ean' | 'new' | 'unknown'
                    matchedProductName: null
                };
            });

            // Lookup paralelo por EAN pra pintar status no preview.
            // Match por SKU+supplier_id continua no confirmImport (depende do supplier resolvido).
            const eanLookups = await Promise.all(items.map(async (it) => {
                if (!it.ean) return null;
                const { data } = await supabase
                    .from('products')
                    .select('id, name')
                    .eq('tenant_id', tenantId)
                    .eq('ean', it.ean)
                    .maybeSingle();
                return data;
            }));
            eanLookups.forEach((match, idx) => {
                if (match) {
                    items[idx].matchStatus = 'matched_ean';
                    items[idx].matchedProductName = match.name;
                } else {
                    items[idx].matchStatus = items[idx].ean ? 'new' : 'unknown';
                }
            });

            const emissionDate = ide?.dhEmi ? String(ide.dhEmi).split('T')[0] : new Date().toISOString().split('T')[0];
            const invoiceNumber = ide?.nNF;
            const totalValue = parseFloat(infNFe.total.ICMSTot.vNF);

            const parcels = parseInstallments(infNFe, emit.xNome, invoiceNumber);

            if (parcels.length > 0) {
                const parcelSum = parcels.reduce((acc, p) => acc + p.amount, 0);
                if (Math.abs(parcelSum - totalValue) > 0.01) {
                    addLog(`Aviso: Soma das parcelas (R$ ${parcelSum.toFixed(2)}) difere do total da NFe (R$ ${totalValue.toFixed(2)}).`, 'info');
                }
            }

            setImportData({
                supplierName: emit.xNome,
                supplierCNPJ: emit.CNPJ,
                xmlKey,
                invoiceNumber,
                emissionDate,
                totalValue
            });

            setPreviewItems(items);
            setInstallments(parcels);
            setLoading(false);
            const summary = parcels.length > 0
                ? `${parcels.length} parcela(s) encontrada(s)`
                : 'NFe à vista (sem parcelamento)';
            addLog(`XML lido com sucesso! ${summary}. Revise abaixo antes de importar.`, 'success');

        } catch (error) {
            addLog(`Erro ao processar estrutura do XML: ${error.message}`, 'error');
            setLoading(false);
        }
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...previewItems];
        newItems[index][field] = value;
        setPreviewItems(newItems);
    };

    const handleInstallmentChange = (index, field, value) => {
        const newParcels = [...installments];
        newParcels[index] = { ...newParcels[index], [field]: value };
        setInstallments(newParcels);
    };

    const confirmImport = async () => {
        if (!importData || previewItems.length === 0) return;
        setLoading(true);

        if (!tenantId) {
            addLog('Erro: Empresa não identificada.', 'error');
            setLoading(false);
            return;
        }

        try {
            // 1. Get/Create Supplier
            let supplierId;
            const { data: supplier } = await supabase
                .from('suppliers')
                .select('id')
                .eq('cnpj', importData.supplierCNPJ)
                // Filter by tenant_id if suppliers are possibly shared or private. 
                // Usually suppliers are global or company specific. Assuming company specific per multi-tenant rule.
                .eq('tenant_id', tenantId)
                .maybeSingle(); // Changed to maybeSingle to avoid auto-error if multiple (shouldn't happen) or none

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
                if (createError) throw new Error(`Erro criar fornecedor: ${createError.message}`);
                supplierId = newSupplier.id;
            }

            // 2. Process Items — match em ordem: EAN → SKU+supplier → criar novo.
            for (const item of previewItems) {
                let existingProd = null;

                // (a) Match por EAN se o item tiver
                if (item.ean) {
                    const { data } = await supabase
                        .from('products')
                        .select('id, quantity, ean')
                        .eq('tenant_id', tenantId)
                        .eq('ean', item.ean)
                        .maybeSingle();
                    existingProd = data;
                }

                // (b) Fallback: SKU + fornecedor (comportamento antigo)
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
                        supplier_id: supplierId // fornecedor mais recente vence
                    };
                    // Backfill silencioso: se achamos via SKU e o produto não tinha EAN, grava agora.
                    if (item.ean && !existingProd.ean) {
                        updatePayload.ean = item.ean;
                    }
                    await supabase.from('products').update(updatePayload).eq('id', existingProd.id);
                } else {
                    await supabase.from('products').insert([{
                        tenant_id: tenantId,
                        sku: item.sku,
                        ean: item.ean,
                        name: item.name,
                        cost_price: item.cost_price,
                        selling_price: item.selling_price,
                        quantity: parseFloat(item.quantity),
                        supplier_id: supplierId
                    }]);
                }
            }

            // 3. Register Stock Entry linked to XML
            const { data: entryData, error: entryError } = await supabase.from('stock_entries').insert([{
                tenant_id: tenantId,
                supplier_id: supplierId,
                xml_key: importData.xmlKey,
                total_value: importData.totalValue
            }]).select().single();

            if (entryError) throw entryError;

            // 4. Register Accounts Payable — 1 linha por parcela, ou 1 à vista.
            // Convenção do schema existente: `date` é timestamp de criação no insert
            // e é sobrescrito pro momento do pagamento quando a transação muda pra status='paid'
            // (vide FinancialDashboard.handleMarkAsPaid). NOT NULL na coluna força preenchimento aqui.
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
            if (txError) throw txError;

            addLog(`Importação confirmada! ${transactionRows.length} lançamento(s) financeiro(s) criado(s).`, 'success');
            setPreviewItems([]);
            setImportData(null);
            setInstallments([]);
            setIsPaidUpfront(false);

        } catch (error) {
            addLog(`Erro ao salvar no banco: ${error.message}`, 'error');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="max-w-6xl mx-auto mt-10 p-6 bg-neutral-900 rounded-lg shadow-xl border border-neutral-800">
            <h2 className="text-2xl font-bold text-white mb-6">Importação de XML (NFe)</h2>

            <div className="mb-6 flex items-end gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Arquivo XML da Nota Fiscal</label>
                    <input
                        type="file"
                        accept=".xml"
                        onChange={handleFileUpload}
                        disabled={loading}
                        className="block w-full text-sm text-gray-400
               file:mr-4 file:py-2.5 file:px-4
               file:rounded-lg file:border-0
               file:text-sm file:font-semibold
               file:bg-red-600 file:text-white
               hover:file:bg-red-700
               cursor-pointer bg-neutral-800 rounded-lg border border-neutral-700"
                    />
                </div>
                <div className="w-32">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Margem Padrão (%)</label>
                    <input
                        type="number"
                        value={margin}
                        onChange={(e) => setMargin(parseFloat(e.target.value))}
                        disabled={previewItems.length > 0} // Disable margin change after parse to avoid confusion
                        className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg block w-full p-2.5 disabled:opacity-50"
                    />
                </div>
            </div>

            {/* Log Area — sempre visível pra erros do confirm ficarem aparentes */}
            <div className="bg-black rounded-lg p-4 h-32 overflow-y-auto border border-neutral-800 font-mono text-sm mb-6">
                {logs.length === 0 ? (
                    <p className="text-gray-500 italic">Aguardando arquivo...</p>
                ) : (
                    logs.map((log, index) => (
                        <div key={index} className={`mb-1 ${log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-green-400' : 'text-gray-300'
                            }`}>
                            <span className="text-gray-600 mr-2">[{log.time}]</span>
                            {log.message}
                        </div>
                    ))
                )}
            </div>

            {/* Preview Table */}
            {previewItems.length > 0 && (
                <div className="animate-fade-in">
                    <div className="flex justify-between items-center mb-4 bg-neutral-800 p-3 rounded-lg border border-neutral-700">
                        <div>
                            <p className="text-gray-400 text-sm">Fornecedor</p>
                            <p className="text-white font-bold">{importData?.supplierName}</p>
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">Total da Nota</p>
                            <p className="text-green-400 font-bold">R$ {importData?.totalValue.toFixed(2)}</p>
                        </div>
                        <button
                            onClick={confirmImport}
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-green-900/20 transition-colors"
                        >
                            {loading ? 'Salvando...' : 'Confirmar Importação'}
                        </button>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-neutral-800">
                        <table className="w-full text-sm text-left text-gray-400">
                            <thead className="text-xs text-gray-200 uppercase bg-black">
                                <tr>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">SKU</th>
                                    <th className="px-4 py-3">EAN</th>
                                    <th className="px-4 py-3 w-1/3">Produto</th>
                                    <th className="px-4 py-3">Qtd</th>
                                    <th className="px-4 py-3">Custo (R$)</th>
                                    <th className="px-4 py-3">Venda (R$)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewItems.map((item, index) => (
                                    <tr key={item.id} className="border-b border-neutral-800 hover:bg-neutral-800">
                                        <td className="px-4 py-2">
                                            {item.matchStatus === 'matched_ean' ? (
                                                <span className="inline-block bg-green-900/40 text-green-300 text-xs px-2 py-1 rounded border border-green-800" title={`Já cadastrado como: ${item.matchedProductName}`}>
                                                    ✓ já cadastrado
                                                </span>
                                            ) : item.matchStatus === 'new' ? (
                                                <span className="inline-block bg-blue-900/40 text-blue-300 text-xs px-2 py-1 rounded border border-blue-800">
                                                    + novo
                                                </span>
                                            ) : (
                                                <span className="inline-block bg-neutral-700 text-gray-300 text-xs px-2 py-1 rounded border border-neutral-600" title="Sem EAN — será feito match por SKU+fornecedor no momento da confirmação">
                                                    ? match no confirmar
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{item.ean || '—'}</td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                value={item.name}
                                                onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                                                className="bg-transparent border-b border-transparent focus:border-red-500 w-full outline-none text-white"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                className="bg-neutral-700 rounded px-2 py-1 w-20 text-center text-white"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                value={item.cost_price}
                                                onChange={(e) => handleItemChange(index, 'cost_price', e.target.value)}
                                                className="bg-neutral-700 rounded px-2 py-1 w-24 text-right text-gray-300"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                value={item.selling_price}
                                                onChange={(e) => handleItemChange(index, 'selling_price', e.target.value)}
                                                className="bg-neutral-700 rounded px-2 py-1 w-24 text-right text-green-400 font-bold"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Parcelas (Contas a Pagar) */}
                    {installments.length > 0 && (
                        <div className="mt-6">
                            <div className="flex justify-between items-center mb-3 px-1">
                                <h3 className="text-lg font-bold text-white">
                                    Parcelas ({installments.length})
                                </h3>
                                <p className="text-sm text-gray-400">
                                    Total: <span className="text-orange-400 font-bold">R$ {installments.reduce((acc, p) => acc + Number(p.amount), 0).toFixed(2)}</span>
                                </p>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-neutral-800">
                                <table className="w-full text-sm text-left text-gray-400">
                                    <thead className="text-xs text-gray-200 uppercase bg-black">
                                        <tr>
                                            <th className="px-4 py-3">nº</th>
                                            <th className="px-4 py-3">Vencimento</th>
                                            <th className="px-4 py-3">Valor (R$)</th>
                                            <th className="px-4 py-3">Método</th>
                                            <th className="px-4 py-3 w-1/2">Descrição</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {installments.map((p, index) => (
                                            <tr key={p.id} className="border-b border-neutral-800 hover:bg-neutral-800">
                                                <td className="px-4 py-2 text-white">{p.nDup || index + 1}</td>
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="date"
                                                        value={p.dueDate}
                                                        onChange={(e) => handleInstallmentChange(index, 'dueDate', e.target.value)}
                                                        className="bg-neutral-700 rounded px-2 py-1 text-white"
                                                    />
                                                </td>
                                                <td className="px-4 py-2 text-right text-orange-300 font-bold">
                                                    R$ {Number(p.amount).toFixed(2)}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <select
                                                        value={p.paymentMethod}
                                                        onChange={(e) => handleInstallmentChange(index, 'paymentMethod', e.target.value)}
                                                        className="bg-neutral-700 rounded px-2 py-1 text-white"
                                                    >
                                                        <option>Boleto</option>
                                                        <option>PIX</option>
                                                        <option>Depósito</option>
                                                        <option>Cartão Crédito</option>
                                                        <option>Cartão Débito</option>
                                                        <option>Dinheiro</option>
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2 text-gray-400 italic">{p.description}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* À vista (sem <cobr>) */}
                    {installments.length === 0 && importData && (
                        <div className="mt-6 bg-neutral-800 p-4 rounded-lg border border-neutral-700">
                            <h3 className="text-lg font-bold text-white mb-3">Pagamento</h3>
                            <p className="text-sm text-gray-400 mb-4">
                                NFe à vista (sem parcelamento). Valor: <span className="text-orange-400 font-bold">R$ {importData.totalValue.toFixed(2)}</span>
                            </p>
                            <div className="flex items-center gap-6">
                                <label className="inline-flex items-center gap-2 text-gray-200 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isPaidUpfront}
                                        onChange={(e) => setIsPaidUpfront(e.target.checked)}
                                        className="w-4 h-4 accent-red-600"
                                    />
                                    <span>Já paguei</span>
                                </label>
                                {isPaidUpfront ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-400">Método:</span>
                                        <select
                                            value={upfrontPaymentMethod}
                                            onChange={(e) => setUpfrontPaymentMethod(e.target.value)}
                                            className="bg-neutral-700 rounded px-2 py-1 text-white text-sm"
                                        >
                                            <option>Dinheiro</option>
                                            <option>PIX</option>
                                            <option>Cartão Débito</option>
                                            <option>Cartão Crédito</option>
                                            <option>Boleto</option>
                                        </select>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">
                                        Deixarei como pendente (vencimento: {importData.emissionDate && new Date(importData.emissionDate + 'T12:00:00').toLocaleDateString()})
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

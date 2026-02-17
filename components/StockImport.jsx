"use client"
import { useState } from 'react';
import { XMLParser } from 'fast-xml-parser';
import { createClient } from '../utils/supabase/client';
import { useAuth } from '../context/AuthContext';

export default function StockImport() {
    const supabase = createClient();
    const { companyId } = useAuth();

    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [margin, setMargin] = useState(30); // Default margin 30%
    const [previewItems, setPreviewItems] = useState([]); // Items parsed from XML
    const [importData, setImportData] = useState(null); // Metadata (Supplier, Invoice Info)

    const addLog = (message, type = 'info') => {
        setLogs(prev => [...prev, { message, type, time: new Date().toLocaleTimeString() }]);
    };

    // ... (keep handleFileUpload and parseNFeByPreview as is, just hidden in replacement)

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setLoading(true);
        setLogs([]);
        setPreviewItems([]);
        setImportData(null);
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
                parseNFeByPreview(jsonObj);
            } catch (error) {
                addLog(`Erro ao ler XML: ${error.message}`, 'error');
                setLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const parseNFeByPreview = (nfeData) => {
        try {
            const nfeProc = nfeData.nfeProc || nfeData.NFe;
            const infNFe = nfeProc.NFe ? nfeProc.NFe.infNFe : nfeProc.infNFe;
            const emit = infNFe.emit;
            const dets = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det];

            // Extract items for preview
            const items = dets.map((item, index) => {
                const prod = item.prod;
                const costPrice = parseFloat(prod.vUnCom);
                const sellingPrice = costPrice * (1 + (margin / 100));

                return {
                    id: index, // Temporary ID for list key
                    sku: prod.cProd,
                    name: prod.xProd,
                    cost_price: costPrice,
                    selling_price: parseFloat(sellingPrice.toFixed(2)),
                    quantity: parseFloat(prod.qCom),
                    unit: prod.uCom
                };
            });

            setImportData({
                supplierName: emit.xNome,
                supplierCNPJ: emit.CNPJ,
                xmlKey: infNFe["@_Id"],
                totalValue: parseFloat(infNFe.total.ICMSTot.vNF)
            });

            setPreviewItems(items);
            setLoading(false);
            addLog('XML lido com sucesso! Verifique os itens abaixo antes de importar.', 'success');

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

    const confirmImport = async () => {
        if (!importData || previewItems.length === 0) return;
        setLoading(true);

        if (!companyId) {
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
                // Filter by company_id if suppliers are possibly shared or private. 
                // Usually suppliers are global or company specific. Assuming company specific per multi-tenant rule.
                .eq('company_id', companyId)
                .maybeSingle(); // Changed to maybeSingle to avoid auto-error if multiple (shouldn't happen) or none

            if (supplier) {
                supplierId = supplier.id;
            } else {
                const { data: newSupplier, error: createError } = await supabase
                    .from('suppliers')
                    .insert([{
                        company_id: companyId,
                        name: importData.supplierName,
                        cnpj: importData.supplierCNPJ
                    }])
                    .select()
                    .single();
                if (createError) throw new Error(`Erro criar fornecedor: ${createError.message}`);
                supplierId = newSupplier.id;
            }

            // 2. Process Items
            for (const item of previewItems) {
                // Check if product exists in this company
                const { data: existingProd } = await supabase
                    .from('products')
                    .select('id, quantity')
                    .eq('sku', item.sku)
                    .eq('supplier_id', supplierId)
                    .eq('company_id', companyId)
                    .maybeSingle();

                if (existingProd) {
                    await supabase.from('products').update({
                        quantity: existingProd.quantity + parseFloat(item.quantity),
                        cost_price: item.cost_price,
                        selling_price: item.selling_price
                    }).eq('id', existingProd.id);
                } else {
                    await supabase.from('products').insert([{
                        company_id: companyId,
                        sku: item.sku,
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
                company_id: companyId,
                supplier_id: supplierId,
                xml_key: importData.xmlKey,
                total_value: importData.totalValue
            }]).select().single();

            if (entryError) throw entryError;

            // 4. Register Expense Transaction
            await supabase.from('transactions').insert([{
                company_id: companyId,
                description: `Compra de Estoque - ${importData.supplierName}`,
                type: 'expense',
                category: 'Stock Purchase',
                amount: importData.totalValue,
                related_stock_entry_id: entryData.id,
                date: new Date().toISOString()
            }]);

            addLog('Importação confirmada e salva no banco de dados!', 'success');
            setPreviewItems([]);
            setImportData(null);

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

            {/* Log Area (Only create if no preview) */}
            {previewItems.length === 0 && (
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
            )}

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
                                    <th className="px-4 py-3">Código</th>
                                    <th className="px-4 py-3 w-1/3">Produto</th>
                                    <th className="px-4 py-3">Qtd</th>
                                    <th className="px-4 py-3">Custo (R$)</th>
                                    <th className="px-4 py-3">Venda (R$)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewItems.map((item, index) => (
                                    <tr key={item.id} className="border-b border-neutral-800 hover:bg-neutral-800">
                                        <td className="px-4 py-2">{item.sku}</td>
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
                </div>
            )}
        </div>
    );
}

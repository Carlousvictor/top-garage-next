"use client"

const TG = {
    name: 'TOP GARAGE RJ',
    cnpj: '37.159.925/0001-90',
    ie: '79001252',
    address: 'Duque de Caxias - RJ',
    phone: '(21) 95925-7386',
    email: 'topgaragerj@gmail.com',
}

function formatBRL(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function suggestedQty(p) {
    const min = Number(p.min_quantity || 0)
    const cur = Number(p.quantity || 0)
    return Math.max(min * 2 - cur, min)
}

// Groups products by supplier name (or "Sem fornecedor")
function groupBySupplier(products) {
    const groups = new Map()
    for (const p of products) {
        const key = p.suppliers?.name || 'Sem fornecedor'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(p)
    }
    // Sort: identified suppliers first (alpha), "Sem fornecedor" last
    return Array.from(groups.entries()).sort(([a], [b]) => {
        if (a === 'Sem fornecedor') return 1
        if (b === 'Sem fornecedor') return -1
        return a.localeCompare(b)
    })
}

export default function LowStockReport({ products = [] }) {
    const today = new Date().toLocaleDateString('pt-BR')
    const groups = groupBySupplier(products)

    const grandTotal = products.reduce((acc, p) => {
        return acc + suggestedQty(p) * Number(p.cost_price || 0)
    }, 0)

    return (
        <div className="hidden print:block print:text-black print:bg-white p-8 font-sans text-sm">
            {/* Header */}
            <div className="border-b-2 border-black pb-4 mb-6 flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-black mb-1">{TG.name}</h1>
                    <p className="text-xs">CNPJ: {TG.cnpj} · IE: {TG.ie}</p>
                    <p className="text-xs">{TG.address} · Tel: {TG.phone}</p>
                    <p className="text-xs">{TG.email}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs uppercase tracking-wide">Emissão</p>
                    <p className="font-bold">{today}</p>
                </div>
            </div>

            <h2 className="text-xl font-bold mb-1">Relatório de Itens com Estoque Baixo</h2>
            <p className="text-xs text-gray-700 mb-6">Sugestão de pedido de reposição — agrupado por fornecedor</p>

            {/* Empty state */}
            {products.length === 0 && (
                <p className="text-center py-8 text-gray-600">Nenhum item com estoque abaixo do mínimo.</p>
            )}

            {/* Groups */}
            {groups.map(([supplier, items]) => {
                const subtotal = items.reduce((acc, p) => acc + suggestedQty(p) * Number(p.cost_price || 0), 0)
                return (
                    <div key={supplier} className="mb-6 break-inside-avoid">
                        <h3 className="text-base font-bold bg-gray-200 px-2 py-1 mb-2">{supplier}</h3>
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="border-b-2 border-black">
                                    <th className="text-left py-1 px-2 w-20">SKU</th>
                                    <th className="text-left py-1 px-2">Produto</th>
                                    <th className="text-left py-1 px-2 w-24">Marca</th>
                                    <th className="text-center py-1 px-2 w-16">Qtd Atual</th>
                                    <th className="text-center py-1 px-2 w-16">Qtd Mín</th>
                                    <th className="text-center py-1 px-2 w-20">Sugerido</th>
                                    <th className="text-right py-1 px-2 w-20">Custo Un</th>
                                    <th className="text-right py-1 px-2 w-24">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(p => {
                                    const qty = suggestedQty(p)
                                    const cost = Number(p.cost_price || 0)
                                    return (
                                        <tr key={p.id} className="border-b border-gray-300">
                                            <td className="py-1 px-2 font-mono">{p.sku || '—'}</td>
                                            <td className="py-1 px-2">{p.name}</td>
                                            <td className="py-1 px-2">{p.brands?.name || '—'}</td>
                                            <td className="py-1 px-2 text-center">{p.quantity}</td>
                                            <td className="py-1 px-2 text-center">{p.min_quantity || 0}</td>
                                            <td className="py-1 px-2 text-center font-bold">{qty}</td>
                                            <td className="py-1 px-2 text-right">{formatBRL(cost)}</td>
                                            <td className="py-1 px-2 text-right font-bold">{formatBRL(qty * cost)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-black">
                                    <td colSpan="7" className="py-1 px-2 text-right font-bold">Subtotal {supplier}:</td>
                                    <td className="py-1 px-2 text-right font-bold">{formatBRL(subtotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )
            })}

            {/* Grand total */}
            {products.length > 0 && (
                <div className="border-t-4 border-black pt-3 mt-6 flex justify-between">
                    <p className="font-bold text-base">TOTAL GERAL ESTIMADO</p>
                    <p className="font-black text-base">{formatBRL(grandTotal)}</p>
                </div>
            )}

            <p className="text-[10px] text-gray-600 mt-8">
                Sugestão de quantidade calculada como: 2 × qtd mínima − qtd atual (mínimo de 1× qtd mín).
            </p>

            <div className="mt-12 grid grid-cols-2 gap-12 text-xs">
                <div className="border-t border-black pt-1 text-center">Aprovação / Data</div>
                <div className="border-t border-black pt-1 text-center">Recebimento / Data</div>
            </div>
        </div>
    )
}

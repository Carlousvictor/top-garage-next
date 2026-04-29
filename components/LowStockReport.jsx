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
    return Array.from(groups.entries()).sort(([a], [b]) => {
        if (a === 'Sem fornecedor') return 1
        if (b === 'Sem fornecedor') return -1
        return a.localeCompare(b)
    })
}

// Document number derived from issue date — PED-YYYYMMDD-HHMM
// Lets the report be referenced/filed without a DB sequence.
function buildDocNumber(d) {
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `PED-${y}${mo}${da}-${h}${mi}`
}

export default function LowStockReport({ products = [] }) {
    const now = new Date()
    const issueDate = now.toLocaleDateString('pt-BR')
    const issueTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const docNumber = buildDocNumber(now)
    const groups = groupBySupplier(products)

    const grandTotal = products.reduce((acc, p) => acc + suggestedQty(p) * Number(p.cost_price || 0), 0)
    const totalItems = products.length
    const totalSuppliers = groups.length

    return (
        <div className="hidden print:block print:text-black print:bg-white">
            {/* Print page setup — A4 with comfortable margins */}
            <style>{`
                @page { size: A4; margin: 14mm 12mm 18mm 12mm; }
                @media print {
                    .lsr-root { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; }
                    .lsr-num { font-variant-numeric: tabular-nums; }
                    .lsr-supplier { page-break-inside: avoid; break-inside: avoid; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; break-inside: avoid; }
                    thead { display: table-header-group; }
                    tfoot { display: table-row-group; }
                }
            `}</style>

            <div className="lsr-root text-[11px] leading-snug">
                {/* HEADER — 3 columns: issuer | doc title | doc meta */}
                <header className="flex items-stretch justify-between gap-6 pb-3 mb-4 border-b-[3px] border-black">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-[20px] font-black tracking-tight leading-tight">{TG.name}</h1>
                        <div className="mt-1 space-y-0.5 text-[10px] leading-snug text-gray-800">
                            <p>CNPJ <span className="font-mono">{TG.cnpj}</span> &nbsp;·&nbsp; IE <span className="font-mono">{TG.ie}</span></p>
                            <p>{TG.address}</p>
                            <p>Tel: {TG.phone} &nbsp;·&nbsp; {TG.email}</p>
                        </div>
                    </div>

                    <div className="border-l-2 border-r-2 border-black px-4 flex flex-col items-center justify-center text-center">
                        <p className="text-[9px] uppercase tracking-[0.18em] text-gray-700">Documento</p>
                        <p className="text-[14px] font-black mt-0.5">PEDIDO DE COMPRA</p>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-gray-700 mt-0.5">Reposição de estoque</p>
                    </div>

                    <div className="text-right shrink-0 lsr-num">
                        <p className="text-[9px] uppercase tracking-[0.18em] text-gray-700">Nº do documento</p>
                        <p className="text-[12px] font-mono font-bold">{docNumber}</p>
                        <p className="text-[9px] uppercase tracking-[0.18em] text-gray-700 mt-2">Emissão</p>
                        <p className="text-[12px] font-bold">{issueDate}</p>
                        <p className="text-[10px] text-gray-700">{issueTime}</p>
                    </div>
                </header>

                {/* SUMMARY BOX — totals upfront so the receiver scans this first */}
                <section className="grid grid-cols-3 gap-2 mb-5 border border-black">
                    <div className="px-3 py-2 border-r border-black">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Itens a pedir</p>
                        <p className="text-[16px] font-black lsr-num leading-tight">{totalItems}</p>
                    </div>
                    <div className="px-3 py-2 border-r border-black">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Fornecedores</p>
                        <p className="text-[16px] font-black lsr-num leading-tight">{totalSuppliers}</p>
                    </div>
                    <div className="px-3 py-2">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Valor estimado total</p>
                        <p className="text-[16px] font-black lsr-num leading-tight">{formatBRL(grandTotal)}</p>
                    </div>
                </section>

                {/* Empty state */}
                {totalItems === 0 && (
                    <p className="text-center py-12 text-gray-600 text-sm">
                        Nenhum item com estoque abaixo do mínimo no momento da emissão.
                    </p>
                )}

                {/* SUPPLIER BLOCKS — each is its own bordered "purchase order" section */}
                {groups.map(([supplier, items], gIdx) => {
                    const subtotal = items.reduce((acc, p) => acc + suggestedQty(p) * Number(p.cost_price || 0), 0)
                    const totalUnits = items.reduce((acc, p) => acc + suggestedQty(p), 0)
                    return (
                        <section key={supplier} className="lsr-supplier mb-5 border border-black">
                            {/* Supplier header bar */}
                            <header className="bg-black text-white px-3 py-1.5 flex items-center justify-between">
                                <div className="flex items-baseline gap-3 min-w-0">
                                    <span className="text-[10px] uppercase tracking-[0.18em] opacity-80 shrink-0">
                                        Fornecedor {String(gIdx + 1).padStart(2, '0')}
                                    </span>
                                    <h3 className="text-[13px] font-bold truncate">{supplier}</h3>
                                </div>
                                <div className="text-right text-[10px] lsr-num shrink-0">
                                    <span className="opacity-80">{items.length} item{items.length === 1 ? '' : 's'} · {totalUnits} un</span>
                                    <span className="ml-3 font-bold">{formatBRL(subtotal)}</span>
                                </div>
                            </header>

                            {/* Items table */}
                            <table className="w-full border-collapse text-[10px]">
                                <colgroup>
                                    <col style={{ width: '8%' }} />   {/* # */}
                                    <col style={{ width: '14%' }} />  {/* SKU */}
                                    <col />                             {/* Produto */}
                                    <col style={{ width: '15%' }} />  {/* Marca */}
                                    <col style={{ width: '7%' }} />   {/* Atual */}
                                    <col style={{ width: '7%' }} />   {/* Mín */}
                                    <col style={{ width: '8%' }} />   {/* Pedir */}
                                    <col style={{ width: '11%' }} /> {/* Unit */}
                                    <col style={{ width: '13%' }} /> {/* Subtotal */}
                                </colgroup>
                                <thead>
                                    <tr className="border-b-2 border-black bg-gray-100">
                                        <th className="text-center py-1.5 px-1.5 font-bold uppercase tracking-wide text-[9px]">Item</th>
                                        <th className="text-left py-1.5 px-1.5 font-bold uppercase tracking-wide text-[9px]">SKU</th>
                                        <th className="text-left py-1.5 px-1.5 font-bold uppercase tracking-wide text-[9px]">Descrição do produto</th>
                                        <th className="text-left py-1.5 px-1.5 font-bold uppercase tracking-wide text-[9px]">Marca</th>
                                        <th className="text-center py-1.5 px-1.5 font-bold uppercase tracking-wide text-[9px]">Atual</th>
                                        <th className="text-center py-1.5 px-1.5 font-bold uppercase tracking-wide text-[9px]">Mín</th>
                                        <th className="text-center py-1.5 px-1.5 font-bold uppercase tracking-wide text-[9px]">Pedir</th>
                                        <th className="text-right py-1.5 px-1.5 font-bold uppercase tracking-wide text-[9px]">Unitário</th>
                                        <th className="text-right py-1.5 px-1.5 font-bold uppercase tracking-wide text-[9px]">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((p, i) => {
                                        const qty = suggestedQty(p)
                                        const cost = Number(p.cost_price || 0)
                                        const lineTotal = qty * cost
                                        return (
                                            <tr key={p.id} className="border-b border-gray-400 align-top">
                                                <td className="py-1 px-1.5 text-center lsr-num text-gray-700">{String(i + 1).padStart(2, '0')}</td>
                                                <td className="py-1 px-1.5 font-mono text-[9.5px] tracking-tight">{p.sku || '—'}</td>
                                                <td className="py-1 px-1.5 leading-snug">{p.name}</td>
                                                <td className="py-1 px-1.5 text-gray-800">{p.brands?.name || '—'}</td>
                                                <td className="py-1 px-1.5 text-center lsr-num">{p.quantity}</td>
                                                <td className="py-1 px-1.5 text-center lsr-num text-gray-700">{p.min_quantity || 0}</td>
                                                <td className="py-1 px-1.5 text-center lsr-num font-bold">{qty}</td>
                                                <td className="py-1 px-1.5 text-right lsr-num">{formatBRL(cost)}</td>
                                                <td className="py-1 px-1.5 text-right lsr-num font-bold">{formatBRL(lineTotal)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-black bg-gray-50">
                                        <td colSpan="6" className="py-1.5 px-1.5"></td>
                                        <td className="py-1.5 px-1.5 text-center lsr-num font-bold">{totalUnits}</td>
                                        <td className="py-1.5 px-1.5 text-right text-[10px] uppercase tracking-wide font-bold">Subtotal</td>
                                        <td className="py-1.5 px-1.5 text-right lsr-num font-black">{formatBRL(subtotal)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </section>
                    )
                })}

                {/* GRAND TOTAL — only when there are items */}
                {totalItems > 0 && (
                    <section className="border-[3px] border-black bg-gray-50 mt-5 mb-6 flex items-center justify-between px-4 py-2.5">
                        <div>
                            <p className="text-[9px] uppercase tracking-[0.2em] text-gray-700">Total geral estimado</p>
                            <p className="text-[10px] text-gray-700">
                                Soma de {totalSuppliers} fornecedor{totalSuppliers === 1 ? '' : 'es'} · {totalItems} ite{totalItems === 1 ? 'm' : 'ns'}
                            </p>
                        </div>
                        <p className="text-[22px] font-black tracking-tight lsr-num">{formatBRL(grandTotal)}</p>
                    </section>
                )}

                {/* OBSERVATIONS */}
                {totalItems > 0 && (
                    <section className="border border-gray-400 px-3 py-2 mb-6">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1 text-gray-800">Observações</h4>
                        <ul className="text-[10px] leading-relaxed list-disc pl-4 space-y-0.5 text-gray-800">
                            <li>Quantidade sugerida calculada como <span className="font-mono">2 × qtd mínima − qtd atual</span> (piso de 1× qtd mín).</li>
                            <li>Valores estimados a partir do preço de custo cadastrado no sistema; confirme com o fornecedor antes de fechar o pedido.</li>
                            <li>Verifique disponibilidade e prazo de entrega antes da emissão da nota fiscal.</li>
                            <li>Itens sem fornecedor cadastrado aparecem ao final agrupados como &quot;Sem fornecedor&quot;.</li>
                        </ul>
                    </section>
                )}

                {/* SIGNATURES — 3 blocks */}
                <section className="grid grid-cols-3 gap-6 mt-10 text-[10px]">
                    <div className="border-t border-black pt-1 text-center">
                        <p className="font-bold uppercase tracking-wide">Solicitante</p>
                        <p className="text-gray-700">Nome / Data</p>
                    </div>
                    <div className="border-t border-black pt-1 text-center">
                        <p className="font-bold uppercase tracking-wide">Aprovação</p>
                        <p className="text-gray-700">Nome / Data</p>
                    </div>
                    <div className="border-t border-black pt-1 text-center">
                        <p className="font-bold uppercase tracking-wide">Recebimento</p>
                        <p className="text-gray-700">Nome / Data</p>
                    </div>
                </section>

                {/* FOOTER */}
                <footer className="mt-8 pt-2 border-t border-gray-400 flex items-center justify-between text-[9px] text-gray-600">
                    <span>{TG.name} · {TG.cnpj}</span>
                    <span>Documento {docNumber} · Emitido em {issueDate} {issueTime}</span>
                </footer>
            </div>
        </div>
    )
}

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

function cleanProductName(p) {
    const name = p.name || ''
    const sku = p.sku
    if (!sku) return name
    const prefixes = [`${sku} - `, `${sku} – `, `${sku}—`, `${sku} `]
    for (const pre of prefixes) {
        if (name.startsWith(pre)) return name.slice(pre.length)
    }
    return name
}

function buildDocNumber(d) {
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `EST-${y}${mo}${da}-${h}${mi}`
}

// Listagem completa do estoque para impressão / conferência manual.
// Usa o mesmo CSS root (`lsr-root`) do LowStockReport pra ficar visualmente coerente,
// mas a wrapper externa controla quando entra no print (via prop `visible`).
export default function StockListingReport({ products = [], visible = false }) {
    const now = new Date()
    const issueDate = now.toLocaleDateString('pt-BR')
    const issueTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const docNumber = buildDocNumber(now)

    const sorted = [...products].sort((a, b) => {
        const an = (a.name || '').toLowerCase()
        const bn = (b.name || '').toLowerCase()
        return an.localeCompare(bn)
    })

    const totalItems = sorted.length
    const totalUnits = sorted.reduce((acc, p) => acc + Number(p.quantity || 0), 0)
    const totalValue = sorted.reduce((acc, p) => acc + Number(p.quantity || 0) * Number(p.cost_price || 0), 0)
    const lowCount = sorted.filter(p => Number(p.quantity || 0) <= Number(p.min_quantity || 0)).length

    return (
        <div className={`${visible ? 'block' : 'hidden'} print:block print:text-black print:bg-white`}>
            <style>{`
                @page { size: A4; margin: 14mm 12mm 18mm 12mm; }
                @media print {
                    .slr-root { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; }
                    .slr-num { font-variant-numeric: tabular-nums; }
                    .slr-row { page-break-inside: avoid; break-inside: avoid; }
                }
            `}</style>

            <div className="slr-root text-[10.5px] leading-snug">
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
                        <p className="text-[14px] font-black mt-0.5">LISTAGEM DE ESTOQUE</p>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-gray-700 mt-0.5">Posição em {issueDate} {issueTime}</p>
                    </div>

                    <div className="text-right shrink-0 slr-num">
                        <p className="text-[9px] uppercase tracking-[0.18em] text-gray-700">Nº do documento</p>
                        <p className="text-[12px] font-mono font-bold">{docNumber}</p>
                        <p className="text-[9px] uppercase tracking-[0.18em] text-gray-700 mt-2">Emissão</p>
                        <p className="text-[12px] font-bold">{issueDate}</p>
                        <p className="text-[10px] text-gray-700">{issueTime}</p>
                    </div>
                </header>

                <section className="grid grid-cols-4 gap-2 mb-5 border border-black">
                    <div className="px-3 py-2 border-r border-black">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Itens cadastrados</p>
                        <p className="text-[16px] font-black slr-num leading-tight">{totalItems}</p>
                    </div>
                    <div className="px-3 py-2 border-r border-black">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Unidades em estoque</p>
                        <p className="text-[16px] font-black slr-num leading-tight">{totalUnits}</p>
                    </div>
                    <div className="px-3 py-2 border-r border-black">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Itens em estoque baixo</p>
                        <p className="text-[16px] font-black slr-num leading-tight">{lowCount}</p>
                    </div>
                    <div className="px-3 py-2">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Valor total em estoque</p>
                        <p className="text-[16px] font-black slr-num leading-tight">{formatBRL(totalValue)}</p>
                    </div>
                </section>

                {totalItems === 0 && (
                    <p className="text-center py-12 text-gray-600 text-sm">Nenhum produto cadastrado.</p>
                )}

                {totalItems > 0 && (
                    <section className="border border-black">
                        <header className="grid grid-cols-[28px_70px_1fr_70px_70px_80px_80px_90px] gap-2 bg-black text-white px-3 py-1.5 text-[9.5px] uppercase tracking-[0.12em] font-bold">
                            <span>#</span>
                            <span>SKU</span>
                            <span>Produto</span>
                            <span className="text-right">Atual</span>
                            <span className="text-right">Mín.</span>
                            <span className="text-right">Custo</span>
                            <span className="text-right">Venda</span>
                            <span className="text-right">Total</span>
                        </header>

                        <div role="list">
                            {sorted.map((p, i) => {
                                const qty = Number(p.quantity || 0)
                                const minQ = Number(p.min_quantity || 0)
                                const cost = Number(p.cost_price || 0)
                                const sell = Number(p.selling_price || 0)
                                const low = qty <= minQ && minQ > 0
                                const displayName = cleanProductName(p)
                                return (
                                    <div
                                        key={p.id}
                                        role="listitem"
                                        className={`slr-row grid grid-cols-[28px_70px_1fr_70px_70px_80px_80px_90px] gap-2 px-3 py-1.5 ${i % 2 === 1 ? 'bg-gray-50' : ''} ${i < sorted.length - 1 ? 'border-b border-gray-300' : ''}`}
                                    >
                                        <span className="slr-num text-[9.5px] text-gray-600">{String(i + 1).padStart(3, '0')}</span>
                                        <span className="font-mono text-[9.5px] text-gray-800 break-all">{p.sku || '—'}</span>
                                        <div className="min-w-0 leading-tight">
                                            <p className="text-[10.5px] font-semibold break-words">{displayName}</p>
                                            {p.brands?.name && (
                                                <p className="text-[8.5px] uppercase tracking-wide text-gray-600">{p.brands.name}</p>
                                            )}
                                        </div>
                                        <span className={`slr-num text-right text-[11px] font-bold ${low ? 'text-red-700' : ''}`}>{qty}</span>
                                        <span className="slr-num text-right text-[10px] text-gray-700">{minQ}</span>
                                        <span className="slr-num text-right text-[10px]">{formatBRL(cost)}</span>
                                        <span className="slr-num text-right text-[10px]">{formatBRL(sell)}</span>
                                        <span className="slr-num text-right text-[10.5px] font-bold">{formatBRL(qty * cost)}</span>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="grid grid-cols-[28px_70px_1fr_70px_70px_80px_80px_90px] gap-2 bg-gray-100 border-t-2 border-black px-3 py-2 text-[10px] font-bold">
                            <span></span>
                            <span></span>
                            <span className="uppercase tracking-[0.12em]">Total geral</span>
                            <span className="slr-num text-right">{totalUnits}</span>
                            <span></span>
                            <span></span>
                            <span></span>
                            <span className="slr-num text-right text-[12px]">{formatBRL(totalValue)}</span>
                        </div>
                    </section>
                )}

                <footer className="mt-8 pt-2 border-t border-gray-400 flex items-center justify-between text-[9px] text-gray-600">
                    <span>{TG.name} · {TG.cnpj}</span>
                    <span>Documento {docNumber} · Emitido em {issueDate} {issueTime}</span>
                </footer>
            </div>
        </div>
    )
}

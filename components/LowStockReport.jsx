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

// Pedido de compra só faz sentido pra item que precisa ser comprado de verdade.
// Exclui ruído de produtos sem mínimo configurado e sem estoque negativo
// (caso clássico: produto cadastrado mas sem reposição definida).
function isOrderable(p) {
    return suggestedQty(p) > 0
}

// Alguns produtos têm o SKU prefixado no nome no cadastro
// (ex: "EAFB007 - FILTRO DE ÓLEO"). No relatório isso fica redundante
// porque a coluna SKU já mostra o código. Remove o prefixo "<sku> - " ou "<sku> "
// pra liberar espaço pro nome real do produto.
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

    // Filtra itens "ruidosos" — só mostra o que realmente precisa de pedido (qtd sugerida > 0).
    // Itens com min=0 e atual=0 ficam de fora porque não geram demanda de compra.
    const orderable = products.filter(isOrderable)
    const groups = groupBySupplier(orderable)

    const grandTotal = orderable.reduce((acc, p) => acc + suggestedQty(p) * Number(p.cost_price || 0), 0)
    const totalItems = orderable.length
    const totalSuppliers = groups.length
    // Quantos foram ocultados — informa o operador no rodapé pra ele saber que existe ruído filtrado.
    const skippedCount = products.length - orderable.length

    return (
        <div className="hidden print:block print:text-black print:bg-white">
            <style>{`
                @page { size: A4; margin: 14mm 12mm 18mm 12mm; }
                @media print {
                    .lsr-root { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; }
                    .lsr-num { font-variant-numeric: tabular-nums; }
                    /* NÃO use page-break-inside: avoid no .lsr-supplier — quando o bloco é grande,
                       o navegador empurra ele inteiro pra próxima página, deixando a página
                       atual em branco. Cada linha de item já tem proteção própria. */
                    .lsr-row { page-break-inside: avoid; break-inside: avoid; }
                    .lsr-keep-together { page-break-inside: avoid; break-inside: avoid; }
                }
            `}</style>

            <div className="lsr-root text-[11px] leading-snug">
                {/* HEADER */}
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

                {/* SUMMARY BOX */}
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
                        {products.length === 0
                            ? 'Nenhum item com estoque abaixo do mínimo no momento da emissão.'
                            : `${products.length} item(ns) marcados como estoque baixo no sistema, mas nenhum gera necessidade de pedido (atual ≥ 0 e mínimo = 0).`}
                    </p>
                )}

                {/* SUPPLIER BLOCKS — list of rows, no <table> */}
                {groups.map(([supplier, items], gIdx) => {
                    const subtotal = items.reduce((acc, p) => acc + suggestedQty(p) * Number(p.cost_price || 0), 0)
                    const totalUnits = items.reduce((acc, p) => acc + suggestedQty(p), 0)
                    return (
                        <section key={supplier} className="mb-5 border border-black">
                            {/* Supplier bar */}
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

                            {/* Item rows — line by line, no table */}
                            <div role="list">
                                {items.map((p, i) => {
                                    const qty = suggestedQty(p)
                                    const cost = Number(p.cost_price || 0)
                                    const lineTotal = qty * cost
                                    const displayName = cleanProductName(p)
                                    return (
                                        <div
                                            key={p.id}
                                            role="listitem"
                                            className={`lsr-row flex items-start gap-3 px-3 py-2 ${i % 2 === 1 ? 'bg-gray-50' : ''} ${i < items.length - 1 ? 'border-b border-gray-300' : ''}`}
                                        >
                                            {/* # */}
                                            <span className="lsr-num text-[10px] text-gray-600 w-6 text-center shrink-0 pt-0.5">
                                                {String(i + 1).padStart(2, '0')}
                                            </span>

                                            {/* SKU */}
                                            <span className="font-mono text-[10px] tracking-tight w-20 shrink-0 text-gray-800 pt-0.5 break-all">
                                                {p.sku || '—'}
                                            </span>

                                            {/* Produto + marca — nome completo (sem truncate, quebra em 2 linhas se precisar) */}
                                            <div className="flex-1 min-w-0 leading-tight">
                                                <p className="text-[11.5px] font-semibold break-words">{displayName}</p>
                                                {p.brands?.name && (
                                                    <p className="text-[9px] uppercase tracking-wide text-gray-600 mt-0.5">
                                                        {p.brands.name}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Pedir — destaque (o número que importa pro fornecedor) */}
                                            <div className="text-center w-16 shrink-0 leading-tight pt-0.5">
                                                <p className="text-[8.5px] uppercase tracking-wider text-gray-600">Pedir</p>
                                                <p className="lsr-num text-[15px] font-black leading-none mt-0.5">{qty}</p>
                                                <p className="text-[8px] text-gray-600 mt-0.5">unidades</p>
                                            </div>

                                            {/* Atual / Mín — referência secundária, 1 linha compacta */}
                                            <div className="text-[9px] lsr-num text-gray-700 w-20 shrink-0 leading-snug pt-0.5">
                                                <p>Atual: <strong className="text-gray-900">{p.quantity}</strong></p>
                                                <p>Mínimo: <strong className="text-gray-900">{p.min_quantity || 0}</strong></p>
                                            </div>

                                            {/* Último valor de compra */}
                                            <div className="text-right w-24 shrink-0 leading-tight pt-0.5">
                                                <p className="text-[8.5px] uppercase tracking-wider text-gray-600">Últ. compra</p>
                                                <p className="lsr-num text-[11px] font-semibold">{formatBRL(cost)}</p>
                                            </div>

                                            {/* Subtotal da linha */}
                                            <div className="text-right w-24 shrink-0 leading-tight pt-0.5 border-l border-gray-300 pl-3">
                                                <p className="text-[8.5px] uppercase tracking-wider text-gray-600">Subtotal</p>
                                                <p className="lsr-num text-[12px] font-black">{formatBRL(lineTotal)}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Supplier subtotal footer */}
                            <div className="flex items-center justify-between bg-gray-100 border-t-2 border-black px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-800">
                                    Subtotal {supplier}
                                </p>
                                <p className="lsr-num text-[14px] font-black">{formatBRL(subtotal)}</p>
                            </div>
                        </section>
                    )
                })}

                {/* GRAND TOTAL */}
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
                            <li><strong>Último valor de compra</strong> = valor pago na última nota fiscal lançada para o item (campo <span className="font-mono">cost_price</span>).</li>
                            <li>Confirme valores e disponibilidade com o fornecedor antes de fechar o pedido — preços podem ter variado.</li>
                            <li>Itens sem fornecedor cadastrado aparecem ao final agrupados como &quot;Sem fornecedor&quot;.</li>
                            {skippedCount > 0 && (
                                <li className="text-gray-700">
                                    {skippedCount} item(ns) com estoque baixo foram <strong>omitidos</strong> deste pedido por terem qtd sugerida zero (sem mínimo configurado e sem estoque negativo). Verifique cadastros se algum deveria estar aqui.
                                </li>
                            )}
                        </ul>
                    </section>
                )}

                {/* SIGNATURES */}
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

                <footer className="mt-8 pt-2 border-t border-gray-400 flex items-center justify-between text-[9px] text-gray-600">
                    <span>{TG.name} · {TG.cnpj}</span>
                    <span>Documento {docNumber} · Emitido em {issueDate} {issueTime}</span>
                </footer>
            </div>
        </div>
    )
}

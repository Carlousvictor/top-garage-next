"use client"

const TG = {
    name: 'TOP GARAGE RJ',
    cnpj: '37.159.925/0001-90',
    ie: '79001252',
    address: 'Duque de Caxias - RJ',
    phone: '(21) 95925-7386',
    email: 'topgaragerj@gmail.com',
}

// Folha de inventário para contagem física manual.
// Espelha o layout do StockListingReport, mas troca colunas de preço por uma
// coluna EM BRANCO ("Contagem física") onde o operador anota à mão. A ordem das
// linhas (por `position`) é a MESMA da tela — papel linha N = tela linha N.
export default function InventoryCountSheet({ inventory, items = [], visible = false }) {
    const now = new Date()
    const issueDate = now.toLocaleDateString('pt-BR')
    const issueTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const docNumber = `INV-${String(inventory?.id ?? '').padStart(5, '0')}`
    const ordered = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const totalItems = ordered.length

    return (
        <div className={`${visible ? 'block' : 'hidden'} print:block print:text-black print:bg-white`}>
            <style>{`
                @page { size: A4; margin: 14mm 12mm 18mm 12mm; }
                @media print {
                    .inv-root { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; }
                    .inv-num { font-variant-numeric: tabular-nums; }
                    .inv-row { page-break-inside: avoid; break-inside: avoid; }
                }
            `}</style>

            <div className="inv-root text-[10.5px] leading-snug">
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
                        <p className="text-[14px] font-black mt-0.5">FOLHA DE INVENTÁRIO</p>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-gray-700 mt-0.5">Contagem física</p>
                    </div>

                    <div className="text-right shrink-0 inv-num">
                        <p className="text-[9px] uppercase tracking-[0.18em] text-gray-700">Nº do inventário</p>
                        <p className="text-[12px] font-mono font-bold">{docNumber}</p>
                        <p className="text-[9px] uppercase tracking-[0.18em] text-gray-700 mt-2">Emissão</p>
                        <p className="text-[12px] font-bold">{issueDate}</p>
                        <p className="text-[10px] text-gray-700">{issueTime}</p>
                    </div>
                </header>

                <section className="grid grid-cols-3 gap-2 mb-5 border border-black">
                    <div className="px-3 py-2 border-r border-black">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Itens a contar</p>
                        <p className="text-[16px] font-black inv-num leading-tight">{totalItems}</p>
                    </div>
                    <div className="px-3 py-2 border-r border-black">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Contado por</p>
                        <p className="text-[12px] leading-tight mt-2 border-b border-gray-400">&nbsp;</p>
                    </div>
                    <div className="px-3 py-2">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-gray-700">Data da contagem</p>
                        <p className="text-[12px] leading-tight mt-2 border-b border-gray-400">&nbsp;</p>
                    </div>
                </section>

                {totalItems === 0 ? (
                    <p className="text-center py-12 text-gray-600 text-sm">Nenhum item neste inventário.</p>
                ) : (
                    <section className="border border-black">
                        <header className="grid grid-cols-[28px_80px_1fr_70px_90px] gap-2 bg-black text-white px-3 py-1.5 text-[9.5px] uppercase tracking-[0.12em] font-bold">
                            <span>#</span>
                            <span>SKU</span>
                            <span>Produto</span>
                            <span className="text-right">Sistema</span>
                            <span className="text-center">Contagem física</span>
                        </header>

                        <div role="list">
                            {ordered.map((it, i) => (
                                <div
                                    key={it.id ?? i}
                                    role="listitem"
                                    className={`inv-row grid grid-cols-[28px_80px_1fr_70px_90px] gap-2 px-3 py-2 items-center ${i % 2 === 1 ? 'bg-gray-50' : ''} ${i < ordered.length - 1 ? 'border-b border-gray-300' : ''}`}
                                >
                                    <span className="inv-num text-[9.5px] text-gray-600">{String(it.position + 1).padStart(3, '0')}</span>
                                    <span className="font-mono text-[9.5px] text-gray-800 break-all">{it.sku || '—'}</span>
                                    <span className="text-[10.5px] font-semibold break-words min-w-0 leading-tight">{it.product_name}</span>
                                    <span className="inv-num text-right text-[11px] font-bold">{Number(it.system_quantity) || 0}</span>
                                    {/* Caixa em branco pra anotar a contagem à mão */}
                                    <span className="border border-gray-500 rounded-sm h-6 block" />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <footer className="mt-8 pt-2 border-t border-gray-400 flex items-center justify-between text-[9px] text-gray-600">
                    <span>{TG.name} · {TG.cnpj}</span>
                    <span>{docNumber} · Emitido em {issueDate} {issueTime}</span>
                </footer>
            </div>
        </div>
    )
}

import React from 'react'

// Relatório consolidado de pendências de um cliente no PDV — demonstrativo do
// que o cliente está devendo. Cabeçalho institucional espelha o PDVSalePrint/
// ServiceOrderPrint pra consistência visual.
//
// Dois modos:
//   - 'synthetic' (sintético): 1 linha por venda (Nº · Data · Valor) + total.
//   - 'analytic' (analítico): cada venda com seus itens detalhados + subtotal,
//     e o total devendo no final.
const TOP_GARAGE_CNPJ_DIGITS = '37159925000190'
const TOP_GARAGE_INFO = {
    addressLine1: 'RUA A, 32 - JARDIM PRIMAVERA',
    addressLine2: 'DUQUE DE CAXIAS - RJ - CEP: 25211-457',
    phone: 'TEL: (21) 95925-7386',
    fiscal: 'CNPJ: 37.159.925/0001-90 — IE: 79001252',
    email: 'E-MAIL: topgaragerj@gmail.com',
}

const onlyDigits = (s) => (s || '').replace(/\D/g, '')

const fmtBRL = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const formatDate = (input) => {
    if (!input) return '—'
    const d = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)
        ? new Date(`${input}T12:00:00`)
        : new Date(input)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// `sales`: [{ id, client, date, total, items:[{name,quantity,unit_price}], observation }]
// `reportType`: 'synthetic' | 'analytic'
export default function PDVConsolidatedPrint({ sales = [], reportType = 'synthetic', tenant }) {
    if (!sales || sales.length === 0) return null

    const isTopGarageByDoc = onlyDigits(tenant?.document) === TOP_GARAGE_CNPJ_DIGITS
    const isTopGarageByName = ((tenant?.name || '').trim().toUpperCase()).includes('TOP GARAGE')
    const isTopGarage = isTopGarageByDoc || isTopGarageByName
    const customLogoUrl = !isTopGarage && tenant?.logo_url ? tenant.logo_url : null

    // Nome do cliente no cabeçalho: se todas as vendas selecionadas são do mesmo
    // cliente, mostra o nome; senão sinaliza múltiplos.
    const uniqueClients = Array.from(new Set(sales.map(s => (s.client || 'Consumidor').trim())))
    const clientName = uniqueClients.length === 1 ? uniqueClients[0] : 'Múltiplos clientes'

    const grandTotal = sales.reduce((acc, s) => acc + (Number(s.total) || 0), 0)
    const emittedAt = new Date().toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    const isAnalytic = reportType === 'analytic'

    return (
        <div className="hidden print:flex print:flex-col font-sans text-black bg-white p-8 w-full print:m-0 print:min-h-screen">
            <div className="flex-grow">
                {/* Header institucional */}
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-2 mb-4">
                    <div className="flex flex-col justify-center">
                        {isTopGarage ? (
                            <img src="/logo.png" alt="Top Garage" className="h-32 object-contain mb-2 self-start" />
                        ) : customLogoUrl ? (
                            <img src={customLogoUrl} alt={tenant?.name || 'Logo'} className="h-32 object-contain mb-2 self-start" />
                        ) : (
                            <span className="text-3xl font-black text-gray-700 tracking-tight self-start mb-2">garaje.io</span>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-2xl font-black uppercase text-gray-800 tracking-wide">Demonstrativo de Débitos</h2>
                        <p className="text-lg font-bold text-red-600">{isAnalytic ? 'Analítico' : 'Sintético'}</p>
                        {isTopGarage && (
                            <div className="mt-2 text-xs text-gray-500 font-medium">
                                <p>{TOP_GARAGE_INFO.addressLine1}</p>
                                <p>{TOP_GARAGE_INFO.addressLine2}</p>
                                <p>{TOP_GARAGE_INFO.phone}</p>
                                <p>{TOP_GARAGE_INFO.fiscal}</p>
                                <p>{TOP_GARAGE_INFO.email}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Cliente + meta */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-xs border border-gray-300">
                    <div className="p-2 border-r border-gray-300">
                        <h3 className="font-bold uppercase bg-gray-100 px-1 py-0.5 mb-2">Cliente</h3>
                        <div className="grid grid-cols-[80px_1fr] gap-1">
                            <span className="font-bold">Nome:</span>
                            <span>{clientName.toUpperCase()}</span>
                        </div>
                    </div>
                    <div className="p-2">
                        <h3 className="font-bold uppercase bg-gray-100 px-1 py-0.5 mb-2">Relatório</h3>
                        <div className="grid grid-cols-[110px_1fr] gap-1">
                            <span className="font-bold">Emitido em:</span>
                            <span>{emittedAt}</span>
                            <span className="font-bold">Vendas:</span>
                            <span>{sales.length} em aberto</span>
                        </div>
                    </div>
                </div>

                {/* Corpo — sintético */}
                {!isAnalytic && (
                    <div className="mb-4">
                        <table className="w-full text-xs box-border border-collapse border border-gray-800">
                            <thead>
                                <tr className="bg-gray-200 text-black uppercase font-bold text-[10px]">
                                    <th className="border border-gray-400 py-1.5 pl-2 text-left w-16">Nº</th>
                                    <th className="border border-gray-400 py-1.5 pl-2 text-left">Data</th>
                                    <th className="border border-gray-400 py-1.5 px-2 text-right w-32">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map((s) => (
                                    <tr key={s.id} className="border-b border-gray-300">
                                        <td className="border-r border-gray-300 py-1.5 pl-2 font-medium">#{s.id}</td>
                                        <td className="border-r border-gray-300 py-1.5 pl-2">{formatDate(s.date)}</td>
                                        <td className="py-1.5 px-2 text-right font-bold">{fmtBRL(s.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Corpo — analítico */}
                {isAnalytic && (
                    <div className="mb-4 space-y-4">
                        {sales.map((s) => {
                            const items = Array.isArray(s.items) ? s.items : []
                            return (
                                <div key={s.id} className="border border-gray-400 print:break-inside-avoid">
                                    <div className="flex justify-between items-center bg-gray-100 px-2 py-1 border-b border-gray-400 text-xs">
                                        <span className="font-bold uppercase">Venda #{s.id} · {formatDate(s.date)}</span>
                                        <span className="font-bold">{fmtBRL(s.total)}</span>
                                    </div>
                                    {items.length === 0 ? (
                                        <p className="text-[11px] italic text-gray-500 px-2 py-1.5">Itens não registrados nesta venda.</p>
                                    ) : (
                                        <table className="w-full text-xs box-border border-collapse">
                                            <thead>
                                                <tr className="text-black uppercase font-bold text-[10px] border-b border-gray-300">
                                                    <th className="py-1 pl-2 text-left w-12">Qtd</th>
                                                    <th className="py-1 pl-2 text-left">Descrição</th>
                                                    <th className="py-1 px-2 text-right w-24">V. Unit</th>
                                                    <th className="py-1 px-2 text-right w-24">V. Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map((it, idx) => {
                                                    const qty = Number(it.quantity) || 0
                                                    const price = Number(it.unit_price) || 0
                                                    return (
                                                        <tr key={idx} className="border-b border-gray-200">
                                                            <td className="py-1 text-center">{qty}</td>
                                                            <td className="py-1 pl-2 uppercase">{it.name || it.description || 'Item'}</td>
                                                            <td className="py-1 px-2 text-right">{price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1 px-2 text-right font-bold">{(qty * price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                    {s.observation && String(s.observation).trim() && (
                                        <p className="text-[11px] px-2 py-1 border-t border-gray-300 whitespace-pre-wrap">
                                            <span className="font-bold uppercase">Obs: </span>{s.observation}
                                        </p>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Total devendo */}
                <div className="flex justify-end mb-6 print:break-inside-avoid">
                    <div className="w-1/2 border border-black">
                        <div className="flex justify-between items-center bg-black text-white p-2">
                            <span className="text-sm uppercase font-black">Total em Aberto</span>
                            <span className="text-xl font-black">{fmtBRL(grandTotal)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Rodapé / assinatura */}
            <div className="mt-8 pt-4 border-t-2 border-black">
                <div className="grid grid-cols-2 gap-12 text-center text-[10px] uppercase font-bold tracking-tight">
                    <div className="flex flex-col items-center">
                        <div className="mb-8 w-full border-b border-black"></div>
                        <span>RESPONSÁVEL</span>
                        <span className="text-[8px] font-normal mt-1 text-gray-500">___/___/______</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="mb-8 w-full border-b border-black"></div>
                        <span>CLIENTE</span>
                        <span className="text-[8px] font-normal mt-1 text-gray-500">___/___/______</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

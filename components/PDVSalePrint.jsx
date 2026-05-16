import React from 'react'

// Recibo de venda do PDV — espelha o cabeçalho/layout institucional do
// ServiceOrderPrint pra ter consistência visual entre OS e venda.
// Mesma lógica de detecção de tenant (CNPJ + nome) e logo customizada.
const TOP_GARAGE_CNPJ_DIGITS = '37159925000190'
const TOP_GARAGE_INFO = {
    addressLine1: 'RUA A, 32 - JARDIM PRIMAVERA',
    addressLine2: 'DUQUE DE CAXIAS - RJ - CEP: 25211-457',
    phone: 'TEL: (21) 95925-7386',
    fiscal: 'CNPJ: 37.159.925/0001-90 — IE: 79001252',
    email: 'E-MAIL: topgaragerj@gmail.com',
}

const onlyDigits = (s) => (s || '').replace(/\D/g, '')

export default function PDVSalePrint({
    items = [],
    clientLabel,
    paymentMethod,
    splitPayment,
    payment1,
    payment2,
    subtotal,
    discountPercent,
    discountAmount,
    total,
    serviceDate,
    tenant,
}) {
    if (!items || items.length === 0) return null

    const isTopGarageByDoc = onlyDigits(tenant?.document) === TOP_GARAGE_CNPJ_DIGITS
    const isTopGarageByName = ((tenant?.name || '').trim().toUpperCase()).includes('TOP GARAGE')
    const isTopGarage = isTopGarageByDoc || isTopGarageByName
    const customLogoUrl = !isTopGarage && tenant?.logo_url ? tenant.logo_url : null

    const formatDate = (input) => {
        if (!input) return ''
        // serviceDate vem como "YYYY-MM-DD" (input do form). Adiciona hora pra
        // evitar shift de fuso ao formatar (Date "2026-05-08" interpreta como UTC).
        const d = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)
            ? new Date(`${input}T12:00:00`)
            : new Date(input)
        return d.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
    }

    const formatTime = () => {
        return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }

    const safeNumber = (v) => {
        const n = Number(v)
        return Number.isFinite(n) ? n : 0
    }

    const subtotalSafe = safeNumber(subtotal)
    const discPct = (() => {
        const n = Number(discountPercent)
        return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 0
    })()
    const discAmt = safeNumber(discountAmount)
    const totalSafe = safeNumber(total)

    return (
        <div className="hidden print:flex print:flex-col font-sans text-black bg-white p-8 w-full print:m-0 print:min-h-screen">

            <div className="flex-grow">
                {/* Header — mesmo layout da OS */}
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
                        <h2 className="text-3xl font-black uppercase text-gray-800 tracking-wide">Recibo de Venda</h2>
                        <p className="text-2xl font-bold text-red-600">PDV</p>
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

                {/* Info do cliente + data */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-xs border border-gray-300">
                    <div className="p-2 border-r border-gray-300">
                        <h3 className="font-bold uppercase bg-gray-100 px-1 py-0.5 mb-2">Cliente</h3>
                        <div className="grid grid-cols-[80px_1fr] gap-1">
                            <span className="font-bold">Nome:</span>
                            <span>{(clientLabel || 'Consumidor').toUpperCase()}</span>
                        </div>
                    </div>

                    <div className="p-2">
                        <h3 className="font-bold uppercase bg-gray-100 px-1 py-0.5 mb-2">Venda</h3>
                        <div className="grid grid-cols-[80px_1fr] gap-1">
                            <span className="font-bold">Data:</span>
                            <span>{formatDate(serviceDate)} {formatTime()}</span>
                            <span className="font-bold">Itens:</span>
                            <span>{items.length}</span>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="mb-4">
                    <table className="w-full text-xs box-border border-collapse border border-gray-800">
                        <thead>
                            <tr className="bg-gray-200 text-black uppercase font-bold text-[10px]">
                                <th className="border border-gray-400 py-1.5 pl-2 text-left w-12">Qtd</th>
                                <th className="border border-gray-400 py-1.5 pl-2 text-left">Descrição (Produto)</th>
                                <th className="border border-gray-400 py-1.5 px-2 text-right w-24">V. Unit</th>
                                <th className="border border-gray-400 py-1.5 px-2 text-right w-24">V. Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => {
                                const qty = safeNumber(item.quantity ?? 1)
                                const price = safeNumber(item.unit_price ?? 0)
                                return (
                                    <tr key={idx} className="border-b border-gray-300">
                                        <td className="border-r border-gray-300 py-1.5 text-center font-medium">{qty}</td>
                                        <td className="border-r border-gray-300 py-1.5 pl-2 uppercase">{item.name || item.description}</td>
                                        <td className="border-r border-gray-300 py-1.5 px-2 text-right">
                                            {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-bold">
                                            {(qty * price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Totais + Pagamento — break-inside-avoid mantém o bloco
                    inteiro na mesma página para acompanhar a listagem mesmo
                    quando há muitos itens. */}
                <div className="flex justify-end mb-6 print:break-inside-avoid">
                    <div className="w-1/2 border border-black p-0.5">
                        {discPct > 0 && (
                            <>
                                <div className="flex justify-between items-center bg-gray-100 p-1 border-b border-gray-300">
                                    <span className="text-xs uppercase font-bold">Subtotal</span>
                                    <span className="text-sm font-medium">R$ {subtotalSafe.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center bg-gray-100 p-1 border-b border-gray-300">
                                    <span className="text-xs uppercase font-bold">Desconto ({discPct}%)</span>
                                    <span className="text-sm font-medium">- R$ {discAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </>
                        )}
                        {splitPayment ? (
                            <>
                                <div className="flex justify-between items-center bg-gray-50 p-1 border-b border-gray-300">
                                    <span className="text-xs uppercase font-bold">{payment1?.method}</span>
                                    <span className="text-sm font-bold">R$ {safeNumber(payment1?.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center bg-gray-50 p-1 border-b border-gray-300">
                                    <span className="text-xs uppercase font-bold">{payment2?.method}</span>
                                    <span className="text-sm font-bold">R$ {safeNumber(payment2?.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </>
                        ) : paymentMethod ? (
                            <div className="flex justify-between items-center bg-gray-50 p-1 border-b border-gray-300">
                                <span className="text-xs uppercase font-bold">Forma de Pagamento</span>
                                <span className="text-sm font-bold">{paymentMethod}</span>
                            </div>
                        ) : null}
                        <div className="flex justify-between items-center bg-black text-white p-2">
                            <span className="text-sm uppercase font-black">Total Geral</span>
                            <span className="text-xl font-black">R$ {totalSafe.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer / Assinatura */}
            <div className="mt-8 pt-4 border-t-2 border-black">
                <div className="grid grid-cols-2 gap-12 text-center text-[10px] uppercase font-bold tracking-tight">
                    <div className="flex flex-col items-center">
                        <div className="mb-8 w-full border-b border-black"></div>
                        <span>RECEBIDO POR</span>
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

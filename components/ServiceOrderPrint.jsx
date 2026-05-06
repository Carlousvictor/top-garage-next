import React from 'react'

// Cabeçalho do PDF: hoje só o Top Garage tem dados institucionais reais
// cadastrados (endereço, IE, etc não estão na tabela `tenants` ainda — só
// `document/phone/email`). Quando mais tenants reais entrarem, migrar esses
// campos pra DB e ler do `tenant` em vez de hardcodar.
const TOP_GARAGE_CNPJ_DIGITS = '37159925000190'
const TOP_GARAGE_INFO = {
    addressLine1: 'RUA A, 32 - JARDIM PRIMAVERA',
    addressLine2: 'DUQUE DE CAXIAS - RJ - CEP: 25211-457',
    phone: 'TEL: (21) 95925-7386',
    fiscal: 'CNPJ: 37.159.925/0001-90 — IE: 79001252',
    email: 'E-MAIL: topgaragerj@gmail.com',
}

const onlyDigits = (s) => (s || '').replace(/\D/g, '')

export default function ServiceOrderPrint({ order, items, client, vehicle, paymentMethod, tenant, discountPercent, currentKm }) {
    if (!order) return null

    // KM resolvido: prop currentKm (digitada no form, mesmo sem salvar) tem
    // prioridade sobre order.current_km (já persistido). Sem a prop, lê do
    // order — comportamento idêntico ao legado.
    const resolvedCurrentKm = (() => {
        if (currentKm !== undefined && currentKm !== null && currentKm !== '') {
            const n = Number(String(currentKm).replace(/\D/g, ''))
            if (Number.isFinite(n) && n > 0) return n
        }
        return order.current_km || null
    })()

    // Match por CNPJ (não por nome) — nomes mudam, CNPJ é estável.
    // Fallback seguro: tenant indefinido → cabeçalho genérico, nunca vaza
    // dados do Top Garage pra outro tenant.
    const isTopGarage = onlyDigits(tenant?.document) === TOP_GARAGE_CNPJ_DIGITS

    const formatDate = (dateString) => {
        if (!dateString) return ''
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const products = items.filter(i => i.type === 'product')
    const services = items.filter(i => i.type !== 'product')

    // Number() coercion explícita: numeric do Postgres pode chegar como string
    // via Supabase JS, e string + number = concatenação ("0" + 100 = "0100").
    const safeSum = (list) => list.reduce((acc, i) => {
        const qty = Number(i.quantity ?? 1)
        const price = Number(i.unit_price ?? 0)
        return acc + (qty * price)
    }, 0)
    const totalProducts = safeSum(products)
    const totalServices = safeSum(services)
    // Subtotal é a soma das duas linhas que aparecem acima dele no PDF —
    // garante que "Total Geral" = "Total Peças" + "Total Serviços" sempre.
    const subtotalAll = totalProducts + totalServices

    // Desconto opcional — quando >0, mostra a linha de desconto e ajusta o
    // "Total Geral" pra refletir o líquido (que é o que foi salvo na OS).
    // Sem discountPercent (legado) → totalAll = subtotal, comportamento idêntico.
    const discPct = (() => {
        const n = Number(discountPercent)
        return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 0
    })()
    const discountValue = subtotalAll * (discPct / 100)
    const totalAll = subtotalAll - discountValue

    const formatKm = (km) => km ? `${Number(km).toLocaleString('pt-BR')} km` : ''

    // A próxima revisão só aparece se o operador EXPLICITAMENTE preencheu data ou KM.
    // Sem cálculo automático: dado inferido em documento impresso pode confundir o cliente.
    const hasNextRevision = !!(order.next_revision_date || order.next_revision_km)
    const nextRevisionDateFmt = order.next_revision_date
        ? new Date(`${order.next_revision_date}T12:00:00`).toLocaleDateString('pt-BR')
        : ''

    return (
        <div className="hidden print:flex flex-col font-sans text-black bg-white p-8 w-full h-full fixed top-0 left-0 z-[9999] print:m-0">

            {/* Main Content Wrapper */}
            <div className="flex-grow">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-2 mb-4">
                    <div className="flex flex-col justify-center">
                        {isTopGarage ? (
                            <img src="/logo.png" alt="Top Garage" className="h-32 object-contain mb-2 self-start" />
                        ) : (
                            <span className="text-3xl font-black text-gray-700 tracking-tight self-start mb-2">garaje.io</span>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-3xl font-black uppercase text-gray-800 tracking-wide">Ordem de Serviço</h2>
                        <p className="text-4xl font-black text-red-600">#{order.id}</p>
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

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-xs border border-gray-300">
                    {/* Client Info */}
                    <div className="p-2 border-r border-gray-300">
                        <h3 className="font-bold uppercase bg-gray-100 px-1 py-0.5 mb-2">Cliente</h3>
                        <div className="grid grid-cols-[70px_1fr] gap-1">
                            <span className="font-bold">Nome:</span>
                            <span>{client?.name?.toUpperCase() || 'CONSUMIDOR FINAL'}</span>
                            <span className="font-bold">Tel:</span>
                            <span>{client?.phone || '—'}</span>
                            <span className="font-bold">E-mail:</span>
                            <span>{client?.email || '—'}</span>
                            <span className="font-bold">CPF/CNPJ:</span>
                            <span>{client?.document || '—'}</span>
                        </div>
                    </div>

                    {/* Vehicle Info — usa o objeto `vehicle` quando disponível para
                        mostrar info enriquecida (combustível, ano, cor, etc); cai pra
                        order.vehicle_* quando vehicle não existe (ex: OS antiga). */}
                    <div className="p-2">
                        <h3 className="font-bold uppercase bg-gray-100 px-1 py-0.5 mb-2">Veículo / OS</h3>
                        <div className="grid grid-cols-[70px_1fr] gap-1">
                            <span className="font-bold">Placa:</span>
                            <span className="font-bold text-sm bg-gray-100 px-1 border border-gray-300 w-max">{vehicle?.plate || order.vehicle_plate || '—'}</span>
                            <span className="font-bold">Veículo:</span>
                            <span>{[vehicle?.brand || order.vehicle_brand, vehicle?.model || order.vehicle_model].filter(Boolean).join(' ') || '—'}</span>
                            {vehicle?.submodel && (
                                <>
                                    <span className="font-bold">Versão:</span>
                                    <span>{vehicle.submodel}</span>
                                </>
                            )}
                            <span className="font-bold">Ano / Cor:</span>
                            <span>{[vehicle?.year, vehicle?.color].filter(Boolean).join(' · ') || '—'}</span>
                            {(vehicle?.fuel_type || vehicle?.engine_displacement || vehicle?.transmission) && (
                                <>
                                    <span className="font-bold">Motor:</span>
                                    <span>{[vehicle?.fuel_type, vehicle?.engine_displacement, vehicle?.transmission].filter(Boolean).join(' · ')}</span>
                                </>
                            )}
                            <span className="font-bold">Data OS:</span>
                            <span>{formatDate(order.created_at || new Date())}</span>
                            {resolvedCurrentKm && (
                                <>
                                    <span className="font-bold">KM atual:</span>
                                    <span className="font-bold">{formatKm(resolvedCurrentKm)}</span>
                                </>
                            )}
                            <span className="font-bold">Status:</span>
                            <span className="uppercase">{order.status}</span>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="mb-4">
                    <table className="w-full text-xs box-border border-collapse border border-gray-800">
                        <thead>
                            <tr className="bg-gray-200 text-black uppercase font-bold text-[10px]">
                                <th className="border border-gray-400 py-1.5 pl-2 text-left w-12">Qtd</th>
                                <th className="border border-gray-400 py-1.5 pl-2 text-left">Descrição (Peça / Serviço)</th>
                                <th className="border border-gray-400 py-1.5 px-2 text-right w-24">V. Unit</th>
                                <th className="border border-gray-400 py-1.5 px-2 text-right w-24">V. Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => {
                                const qty = item.quantity ?? 1
                                const price = item.unit_price ?? 0
                                return (
                                <tr key={idx} className="border-b border-gray-300">
                                    <td className="border-r border-gray-300 py-1.5 text-center font-medium">{qty}</td>
                                    <td className="border-r border-gray-300 py-1.5 pl-2 uppercase">{item.description} <span className="text-[10px] text-gray-500 ml-1">({item.type === 'product' ? 'P' : 'S'})</span></td>
                                    <td className="border-r border-gray-300 py-1.5 px-2 text-right">
                                        {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-1.5 px-2 text-right font-bold">
                                        {(qty * price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                                )
                            })}
                            {/* Empty rows filler if needed for fixed height, skipped for dynamic content */}
                        </tbody>
                    </table>
                </div>

                {/* Totals + Pagamento */}
                <div className="flex justify-end mb-6">
                    <div className="w-1/2 border border-black p-0.5">
                        {/* Breakdown só aparece quando o lado tem valor > 0 — evita
                            "R$ 0,00" pendurado em OS que só tem serviços (caso típico
                            de OS Terceiros) ou só peças. */}
                        {totalServices > 0 && (
                            <div className="flex justify-between items-center bg-gray-100 p-1 border-b border-gray-300">
                                <span className="text-xs uppercase font-bold">Total Serviços</span>
                                <span className="text-sm font-medium">R$ {totalServices.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        )}
                        {totalProducts > 0 && (
                            <div className="flex justify-between items-center bg-gray-100 p-1 border-b border-gray-300">
                                <span className="text-xs uppercase font-bold">Total Peças</span>
                                <span className="text-sm font-medium">R$ {totalProducts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        )}
                        {discPct > 0 && (
                            <>
                                <div className="flex justify-between items-center bg-gray-100 p-1 border-b border-gray-300">
                                    <span className="text-xs uppercase font-bold">Subtotal</span>
                                    <span className="text-sm font-medium">R$ {subtotalAll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center bg-gray-100 p-1 border-b border-gray-300">
                                    <span className="text-xs uppercase font-bold">Desconto ({discPct}%)</span>
                                    <span className="text-sm font-medium">- R$ {discountValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </>
                        )}
                        {paymentMethod && (
                            <div className="flex justify-between items-center bg-gray-50 p-1 border-b border-gray-300">
                                <span className="text-xs uppercase font-bold">Forma de Pagamento</span>
                                <span className="text-sm font-bold">{paymentMethod}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center bg-black text-white p-2">
                            <span className="text-sm uppercase font-black">Total Geral</span>
                            <span className="text-xl font-black">R$ {totalAll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>

                {/* Observations */}
                {order.observation && (
                    <div className="mb-4 border border-gray-300 p-2 text-xs">
                        <span className="font-bold uppercase block mb-1 underline">Observações Técnicas:</span>
                        <p className="whitespace-pre-wrap">{order.observation}</p>
                    </div>
                )}

                {/* Next Revision Highlight — só aparece quando data ou KM foram explicitamente preenchidos */}
                {hasNextRevision && (
                    <div className="mb-4 border-2 border-dashed border-red-600 bg-red-50 p-3 text-center rounded">
                        <h3 className="text-red-800 font-bold uppercase text-sm mb-2">Próxima Revisão Programada</h3>
                        <div className="flex justify-center items-center gap-6">
                            {nextRevisionDateFmt && (
                                <div>
                                    <p className="text-[10px] uppercase text-red-700 font-bold tracking-wide">Data</p>
                                    <p className="text-red-900 font-black text-lg">{nextRevisionDateFmt}</p>
                                </div>
                            )}
                            {order.next_revision_km && (
                                <div>
                                    <p className="text-[10px] uppercase text-red-700 font-bold tracking-wide">Quilometragem</p>
                                    <p className="text-red-900 font-black text-lg">{formatKm(order.next_revision_km)}</p>
                                </div>
                            )}
                        </div>
                        {nextRevisionDateFmt && order.next_revision_km && (
                            <p className="text-red-700 text-[10px] mt-2 uppercase font-bold">O que ocorrer primeiro</p>
                        )}
                    </div>
                )}
            </div>

            {/* Footer / Signatures — 2 colunas: Entregue + Programado */}
            <div className="mt-8 pt-4 border-t-2 border-black">
                <div className="grid grid-cols-2 gap-12 text-center text-[10px] uppercase font-bold tracking-tight">
                    <div className="flex flex-col items-center">
                        <div className="mb-8 w-full border-b border-black"></div>
                        <span>ENTREGUE</span>
                        <span className="text-[8px] font-normal mt-1 text-gray-500">___/___/______</span>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="mb-8 w-full border-b border-black"></div>
                        <span>PROGRAMADO</span>
                        <span className="text-[8px] font-normal mt-1 text-gray-500">___/___/______</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

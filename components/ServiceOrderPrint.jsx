import React from 'react'

export default function ServiceOrderPrint({ order, items, client }) {
    if (!order) return null

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
    const services = items.filter(i => i.type === 'service')

    const totalProducts = products.reduce((acc, i) => acc + (i.quantity * i.unit_price), 0)
    const totalServices = services.reduce((acc, i) => acc + (i.quantity * i.unit_price), 0)

    return (
        <div className="hidden print:flex flex-col font-sans text-black bg-white p-8 w-full h-full fixed top-0 left-0 z-[9999] print:m-0">

            {/* Main Content Wrapper */}
            <div className="flex-grow">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-2 mb-4">
                    <div className="flex flex-col justify-center">
                        <img src="/logo.png" alt="Top Garage" className="h-32 object-contain mb-2 self-start" />
                    </div>
                    <div className="text-right">
                        <h2 className="text-3xl font-black uppercase text-gray-800 tracking-wide">Ordem de Serviço</h2>
                        <p className="text-4xl font-black text-red-600">#{order.id}</p>
                        <div className="mt-2 text-xs text-gray-500 font-medium">
                            <p>RUA EXEMPLO, 123 - BAIRRO</p>
                            <p>RIO DE JANEIRO - RJ - CEP: 00000-000</p>
                            <p>CNPJ: 00.000.000/0001-00</p>
                            <p>TEL: (21) 99999-9999</p>
                        </div>
                    </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-xs border border-gray-300">
                    {/* Client Info */}
                    <div className="p-2 border-r border-gray-300">
                        <h3 className="font-bold uppercase bg-gray-100 px-1 py-0.5 mb-2">Cliente</h3>
                        <div className="grid grid-cols-[60px_1fr] gap-1">
                            <span className="font-bold">Nome:</span>
                            <span>{client?.name?.toUpperCase() || 'CONSUMIDOR FINAL'}</span>
                            <span className="font-bold">Endereço:</span>
                            <span>{client?.address?.toUpperCase() || ''}</span>
                            <span className="font-bold">Tel:</span>
                            <span>{client?.phone || ''}</span>
                            <span className="font-bold">CNPJ/CPF:</span>
                            <span>{client?.cpf_cnpj || ''}</span>
                        </div>
                    </div>

                    {/* Vehicle Info */}
                    <div className="p-2">
                        <h3 className="font-bold uppercase bg-gray-100 px-1 py-0.5 mb-2">Veículo / OS</h3>
                        <div className="grid grid-cols-[70px_1fr] gap-1">
                            <span className="font-bold">Veículo:</span>
                            <span>{order.vehicle_brand} {order.vehicle_model}</span>
                            <span className="font-bold">Placa:</span>
                            <span className="font-bold text-sm bg-gray-100 px-1 border border-gray-300 w-max">{order.vehicle_plate}</span>
                            <span className="font-bold">Data:</span>
                            <span>{formatDate(order.created_at || new Date())}</span>
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
                            {items.map((item, idx) => (
                                <tr key={idx} className="border-b border-gray-300">
                                    <td className="border-r border-gray-300 py-1.5 text-center font-medium">{item.quantity}</td>
                                    <td className="border-r border-gray-300 py-1.5 pl-2 uppercase">{item.description} <span className="text-[10px] text-gray-500 ml-1">({item.type === 'product' ? 'P' : 'S'})</span></td>
                                    <td className="border-r border-gray-300 py-1.5 px-2 text-right">
                                        {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-1.5 px-2 text-right font-bold">
                                        {(item.quantity * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                            {/* Empty rows filler if needed for fixed height, skipped for dynamic content */}
                        </tbody>
                    </table>
                </div>

                {/* Totals Section */}
                <div className="flex justify-end mb-6">
                    <div className="w-1/2 border border-black p-0.5">
                        <div className="flex justify-between items-center bg-gray-100 p-1 border-b border-gray-300">
                            <span className="text-xs uppercase font-bold">Total Serviços</span>
                            <span className="text-sm font-medium">R$ {totalServices.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-100 p-1 border-b border-gray-300">
                            <span className="text-xs uppercase font-bold">Total Peças</span>
                            <span className="text-sm font-medium">R$ {totalProducts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center bg-black text-white p-2">
                            <span className="text-sm uppercase font-black">Total Geral</span>
                            <span className="text-xl font-black">R$ {(totalProducts + totalServices).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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
            </div>

            {/* Footer / Signatures - 4 Columns as specificed */}
            <div className="mt-8 pt-4 border-t-2 border-black">
                <div className="grid grid-cols-4 gap-4 text-center text-[10px] uppercase font-bold tracking-tight">

                    {/* Column 1: Vistoriado */}
                    <div className="flex flex-col items-center">
                        <div className="mb-8 w-full border-b border-black"></div>
                        <span>VISTORIADO</span>
                        <span className="text-[8px] font-normal mt-1 text-gray-500">___/___/______</span>
                    </div>

                    {/* Column 2: Autorizado */}
                    <div className="flex flex-col items-center">
                        <div className="mb-8 w-full border-b border-black"></div>
                        <span>AUTORIZADO</span>
                        <span className="text-[8px] font-normal mt-1 text-gray-500">___/___/______</span>
                    </div>

                    {/* Column 3: Entregue */}
                    <div className="flex flex-col items-center">
                        <div className="mb-8 w-full border-b border-black"></div>
                        <span>ENTREGUE</span>
                        <span className="text-[8px] font-normal mt-1 text-gray-500">___/___/______</span>
                    </div>

                    {/* Column 4: Programado */}
                    <div className="flex flex-col items-center">
                        <div className="mb-8 w-full border-b border-black"></div>
                        <span>PROGRAMADO</span>
                        <span className="text-[8px] font-normal mt-1 text-gray-500">___/___/______</span>
                    </div>

                </div>

                <div className="mt-4 text-[9px] text-center text-gray-400">
                    <p>Serviço realizado por Top Garage - Documento sem valor fiscal</p>
                </div>
            </div>
        </div>
    )
}

// src/services/vehicleApi.js
//
// Chama a rota interna `/api/vehicles/lookup` que, no servidor, proxia pra
// APIBrasil usando o token guardado em `process.env.APIBRASIL_TOKEN`.
// Nunca exponha o token diretamente aqui — este arquivo é bundled no browser.

export const fetchVehicleByPlate = async (placa) => {
    const cleanPlaca = String(placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

    const res = await fetch(`/api/vehicles/lookup?placa=${encodeURIComponent(cleanPlaca)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
        throw new Error(body?.error || `Falha na consulta (${res.status})`)
    }

    // Contrato da rota: `{ source: 'cache' | 'api', data: { marca, modelo, ano, cor, combustivel, chassi } }`
    return body.data
}

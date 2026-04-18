import { NextResponse } from 'next/server'
import { createClient } from '../../../../utils/supabase/server'

const PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
const APIBRASIL_URL = 'https://cluster.apigratis.com/api/v2/vehicles/dados'

function normalizePlate(raw) {
    return String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

function mapApiBrasilResponse(payload) {
    const r = payload?.response || payload || {}
    const extra = r.extra || {}
    return {
        marca: r.MARCA || r.marca || r.brand || '',
        modelo: r.MODELO || r.modelo || r.model || '',
        submodelo: r.SUBMODELO || r.submodelo || r.VERSAO || r.versao || '',
        ano: r.anoModelo || r.ano || r.year || '',
        anoFabricacao: r.anoFabricacao || r.ANO_FABRICACAO || r.ano || '',
        cor: r.cor || r.COR || r.color || '',
        combustivel: extra.combustivel || r.combustivel || r.fuel || '',
        chassi: extra.chassi || r.chassi || r.CHASSI || '',
        renavam: extra.renavam || r.renavam || r.RENAVAM || '',
        cilindrada: extra.cilindrada || r.cilindrada || '',
        cidade: extra.municipio || r.municipio || r.cidade || '',
        uf: extra.uf || r.uf || r.UF || '',
    }
}

// Cache por tenant: respeita RLS (Supabase anon key) e evita vazar
// dados entre oficinas. Consultas subsequentes da mesma placa no mesmo
// tenant não chamam a APIBrasil.
async function findCachedVehicle(supabase, plate, tenantId) {
    const { data } = await supabase
        .from('vehicles')
        .select('brand, model, submodel, year, manufacture_year, color, fuel_type, chassi, renavam, engine_displacement, city, state')
        .eq('plate', plate)
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle()
    if (!data) return null
    return {
        marca: data.brand || '',
        modelo: data.model || '',
        submodelo: data.submodel || '',
        ano: data.year || '',
        anoFabricacao: data.manufacture_year || '',
        cor: data.color || '',
        combustivel: data.fuel_type || '',
        chassi: data.chassi || '',
        renavam: data.renavam || '',
        cilindrada: data.engine_displacement || '',
        cidade: data.city || '',
        uf: data.state || '',
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const plate = normalizePlate(searchParams.get('placa'))

    if (!PLATE_REGEX.test(plate)) {
        return NextResponse.json(
            { error: 'Placa inválida. Use formato ABC1D23 ou ABC1234.' },
            { status: 400 },
        )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()
    const tenantId = profile?.tenant_id
    if (!tenantId) {
        return NextResponse.json({ error: 'Tenant não identificado' }, { status: 403 })
    }

    const cached = await findCachedVehicle(supabase, plate, tenantId)
    if (cached) {
        return NextResponse.json({ source: 'cache', data: cached })
    }

    const bearer = process.env.APIBRASIL_TOKEN
    const deviceToken = process.env.APIBRASIL_DEVICE_TOKEN || bearer
    if (!bearer) {
        return NextResponse.json(
            { error: 'APIBRASIL_TOKEN não configurado no servidor' },
            { status: 500 },
        )
    }

    let res
    try {
        res = await fetch(APIBRASIL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                DeviceToken: deviceToken,
                Authorization: `Bearer ${bearer}`,
            },
            body: JSON.stringify({ placa: plate }),
        })
    } catch (err) {
        return NextResponse.json(
            { error: `Falha de rede ao chamar APIBrasil: ${err.message}` },
            { status: 502 },
        )
    }

    const json = await res.json().catch(() => ({}))

    if (!res.ok || json?.error) {
        const message = json?.message || json?.error || `APIBrasil retornou ${res.status}`
        const status = res.status === 404 ? 404 : 502
        return NextResponse.json({ error: message }, { status })
    }

    return NextResponse.json({ source: 'api', data: mapApiBrasilResponse(json) })
}

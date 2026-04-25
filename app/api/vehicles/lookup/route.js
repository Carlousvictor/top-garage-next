import { NextResponse } from 'next/server'
import { createClient } from '../../../../utils/supabase/server'

const PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
// Nova API: https://wdapi2.com.br
// Formato: GET https://wdapi2.com.br/consulta/{placa}/{token}
const APIPLACAS_BASE = 'https://wdapi2.com.br/consulta'

function normalizePlate(raw) {
    return String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

// O campo `fipe.dados` pode trazer múltiplas entradas. A documentação recomenda
// escolher a com maior `score` (melhor casamento entre marca/modelo).
function pickBestFipe(dados) {
    if (!Array.isArray(dados) || dados.length === 0) return null
    return dados.reduce((best, cur) => {
        if (!best) return cur
        return (Number(cur.score) || 0) > (Number(best.score) || 0) ? cur : best
    }, null)
}

// Tenta extrair cilindrada de uma string tipo "CROSSFOX 1.6 Mi Total Flex 8V 5p".
// Captura o primeiro número decimal entre 0.5 e 9.9 — cobre 99% dos motores civis.
// Aceita ponto e vírgula como separador. Retorna a primeira ocorrência ou string vazia.
function extractCilindradaFromText(text) {
    if (!text) return ''
    const match = String(text).match(/\b([0-9][.,][0-9])\b/)
    return match ? match[1].replace(',', '.') : ''
}

// Mapeia o payload da API Placas para o shape canônico que o front consome.
// O campo `extra` pode estar ausente ou incompleto — sempre tratamos como objeto vazio.
// Para combustível e cilindrada, fazemos fallback pra FIPE quando `extra` não traz.
function mapApiPlacasResponse(payload) {
    const r = payload || {}
    const extra = r.extra || {}
    const bestFipe = pickBestFipe(r.fipe?.dados)
    const fipeText = bestFipe?.texto_modelo || ''

    return {
        marca: r.MARCA || r.marca || '',
        modelo: r.MODELO || r.modelo || '',
        // Prioriza texto_modelo da FIPE (ex: "CROSSFOX 1.6 Mi Total Flex 8V 5p") porque
        // é muito mais rico que SUBMODELO/VERSAO (que costumam repetir o MODELO base).
        // Fallback pra SUBMODELO/VERSAO quando a FIPE não estiver disponível na consulta.
        submodelo: fipeText || r.SUBMODELO || r.submodelo || r.VERSAO || r.versao || '',
        ano: r.anoModelo || r.ano || '',
        anoFabricacao: extra.ano_fabricacao || r.ano || '',
        cor: r.cor || '',
        // Combustível: extra → FIPE como fallback (a FIPE quase sempre traz).
        combustivel: extra.combustivel || bestFipe?.combustivel || '',
        chassi: r.chassi || '',
        // Cilindrada: extra → extraída do texto_modelo da FIPE como fallback.
        cilindrada: extra.cilindradas || extractCilindradaFromText(fipeText),
        // Câmbio: só vem em `extra`. Não há fallback na API — fica vazio se ausente.
        cambio: extra.caixa_cambio || '',
        cidade: r.municipio || extra.municipio || '',
        uf: r.uf || extra.uf || '',
        // Extras úteis pra exibição (não persistidos no cache, podem variar entre consultas)
        fipeValor: bestFipe?.texto_valor || '',
        logoMarca: r.logo || '',
    }
}

// Cache por tenant: respeita RLS (Supabase anon key) e evita vazar
// dados entre oficinas. Consultas subsequentes da mesma placa no mesmo
// tenant não chamam a API externa.
async function findCachedVehicle(supabase, plate, tenantId) {
    const { data } = await supabase
        .from('vehicles')
        .select('brand, model, submodel, year, manufacture_year, color, fuel_type, chassi, engine_displacement, transmission, city, state')
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
        cilindrada: data.engine_displacement || '',
        cambio: data.transmission || '',
        cidade: data.city || '',
        uf: data.state || '',
        fipeValor: '',
        logoMarca: '',
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

    const token = process.env.APIPLACAS_TOKEN
    if (!token) {
        return NextResponse.json(
            { error: 'APIPLACAS_TOKEN não configurado no servidor' },
            { status: 500 },
        )
    }

    const url = `${APIPLACAS_BASE}/${encodeURIComponent(plate)}/${encodeURIComponent(token)}`

    let res
    try {
        res = await fetch(url, { method: 'GET' })
    } catch (err) {
        return NextResponse.json(
            { error: `Falha de rede ao chamar API Placas: ${err.message}` },
            { status: 502 },
        )
    }

    const json = await res.json().catch(() => ({}))

    // A API retorna 200 com `mensagemRetorno` mesmo em erro lógico (ex: placa inexistente).
    // Tratamos: status HTTP de erro OU placa não retornada no body.
    if (!res.ok) {
        const message = json?.mensagemRetorno || json?.error || `API Placas retornou ${res.status}`
        const status = res.status === 404 ? 404 : 502
        return NextResponse.json({ error: message }, { status })
    }

    if (!json?.MARCA && !json?.marca) {
        const message = json?.mensagemRetorno || 'Placa não encontrada na base.'
        return NextResponse.json({ error: message }, { status: 404 })
    }

    return NextResponse.json({ source: 'api', data: mapApiPlacasResponse(json) })
}

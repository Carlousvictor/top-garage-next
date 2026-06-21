import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { buildSaleReceiptOps, buildTestOps, printOps, ThermalError } from '@/lib/thermalPrinter'

// Precisa do runtime Node (não Edge): usa child_process + fs pra falar com a porta serial.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function mapError(e) {
    if (e instanceof ThermalError) {
        // NOT_PAIRED = 409 (pré-condição do ambiente); falha de acesso = 502.
        const status = e.code === 'NOT_PAIRED' ? 409 : 502
        return NextResponse.json({ error: e.message, code: e.code }, { status })
    }
    return NextResponse.json({ error: 'Erro inesperado na impressão: ' + (e?.message || e), code: 'UNKNOWN' }, { status: 500 })
}

// POST -> imprime o recibo de uma venda. Body = mesma forma do PDVSalePrint
// (items, clientLabel, paymentMethod, splitPayment, payments, subtotal,
//  discountPercent, discountAmount, total, serviceDate, observation, tenant).
// A impressão é independente do checkout: falhar aqui NÃO desfaz a venda.
export async function POST(request) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    let body
    try {
        body = await request.json()
    } catch {
        body = {}
    }

    try {
        const ops = body?.test
            ? buildTestOps()
            : buildSaleReceiptOps(body)

        if (!body?.test && (!Array.isArray(body.items) || body.items.length === 0)) {
            return NextResponse.json({ error: 'Nada para imprimir (carrinho vazio).' }, { status: 400 })
        }

        const result = await printOps(ops)
        return NextResponse.json({ success: true, ...result })
    } catch (e) {
        return mapError(e)
    }
}

// GET -> dispara uma página de teste (validar porta, corte e acentos).
export async function GET() {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    try {
        const result = await printOps(buildTestOps())
        return NextResponse.json({ success: true, ...result })
    } catch (e) {
        return mapError(e)
    }
}

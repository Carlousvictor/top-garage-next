import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// Preview server-side da importação de XML.
// Por que existe: o caminho client-side anterior fazia supabase.from(...).select(...)
// direto do browser pra (a) checar duplicidade do xml_key e (b) bater EAN
// contra products. Quando o auth-token do supabase-js precisava refresh, a
// Promise não settlava — o componente ficava em "Lendo arquivo..." pra sempre
// e o usuário precisava deslogar/relogar pra liberar. Mesmo bug que afetava
// /api/pdv/checkout antes da migração pra server-side.
//
// Aqui o cookie httpOnly é resolvido pelo helper de server e auth está sempre
// fresca dentro da request — sem hang. O client adiciona AbortController/timeout
// pra qualquer falha virar erro visível.

async function getTenantId(supabase, user) {
    // dual-key: user_id é canônico; .id é legacy (mesmo padrão dos outros endpoints)
    const { data: p1 } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
    if (p1?.tenant_id) return p1.tenant_id

    const { data: p2 } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
    return p2?.tenant_id ?? null
}

export async function POST(request) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada para este usuário.' }, { status: 403 })
    }

    let body
    try {
        body = await request.json()
    } catch (e) {
        return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const { xmlKey, eans } = body
    if (!xmlKey) {
        return NextResponse.json({ error: 'xmlKey ausente.' }, { status: 400 })
    }

    try {
        // 1. Duplicate check
        const { data: dup } = await supabase
            .from('stock_entries')
            .select('id, created_at')
            .eq('xml_key', xmlKey)
            .eq('tenant_id', tenantId)
            .maybeSingle()

        // 2. EAN lookups — IN clause única em vez de N queries paralelas.
        // Reduz round-trips e elimina a chance de uma das N queries pendurar.
        const eanList = Array.isArray(eans) ? eans.filter(Boolean) : []
        let matchesByEan = {}
        if (eanList.length > 0) {
            const { data: rows } = await supabase
                .from('products')
                .select('id, name, ean')
                .eq('tenant_id', tenantId)
                .in('ean', eanList)
            if (Array.isArray(rows)) {
                for (const r of rows) {
                    if (r.ean) matchesByEan[r.ean] = { id: r.id, name: r.name }
                }
            }
        }

        return NextResponse.json({
            isDuplicate: !!dup,
            importedAt: dup?.created_at || null,
            matchesByEan,
        })
    } catch (err) {
        console.error('[stock/import/preview] failure:', err)
        return NextResponse.json({ error: 'Falha ao validar XML.' }, { status: 500 })
    }
}

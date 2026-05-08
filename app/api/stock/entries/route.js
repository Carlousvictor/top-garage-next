import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// Lista de stock_entries server-side. Substitui supabase.from(...) client-side
// que retornava lista cacheada/empty quando o auth-token estava stale —
// sintoma reportado: "depois de dar entrada, só aparece no histórico após
// deslogar e logar". Cookie httpOnly garante auth fresh em toda request.

async function getTenantId(supabase, user) {
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

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) {
        return NextResponse.json({ error: 'Empresa não encontrada para este usuário.' }, { status: 403 })
    }

    try {
        const { data, error } = await supabase
            .from('stock_entries')
            .select(`*, suppliers(name)`)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[stock/entries] supabase error:', error)
            return NextResponse.json({ error: error.message || 'Falha ao carregar histórico.' }, { status: 500 })
        }

        return NextResponse.json({ entries: data || [] })
    } catch (err) {
        console.error('[stock/entries] failure:', err)
        return NextResponse.json({ error: 'Falha ao carregar histórico.' }, { status: 500 })
    }
}

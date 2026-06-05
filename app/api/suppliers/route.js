import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// Lista de fornecedores do tenant — server-side de propósito. A query
// client-side equivalente em ManualStockEntry travava silenciosamente quando
// o auth-token do supabase-js precisava refresh mid-call (Promise nunca
// settlava → dropdown de fornecedor ficava vazio). Cookie httpOnly resolvido
// pelo helper server-side elimina o hang. Mesmo padrão de products-search.

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
            .from('suppliers')
            .select('id, name, cnpj')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true })

        if (error) {
            console.error('[suppliers] supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ suppliers: data || [] })
    } catch (err) {
        console.error('[suppliers] failure:', err)
        return NextResponse.json({ error: 'Falha ao buscar fornecedores.' }, { status: 500 })
    }
}

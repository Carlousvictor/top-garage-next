import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantAndUser(supabase) {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { user: null, tenantId: null }

    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).single()
    if (profile?.tenant_id) return { user, tenantId: profile.tenant_id }

    const { data: profileById } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    return { user, tenantId: profileById?.tenant_id ?? null }
}

// POST /api/financial/closure  — cria ou atualiza fechamento do dia
export async function POST(request) {
    const supabase = await createClient()
    const { user, tenantId } = await getTenantAndUser(supabase)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 403 })

    const { closure_date, total_income, total_expense, net_balance, breakdown_by_method, observation } = await request.json()

    const { error } = await supabase.from('daily_closures').upsert({
        tenant_id: tenantId,
        closure_date,
        total_income,
        total_expense,
        net_balance,
        breakdown_by_method,
        status: 'closed',
        observation: observation || null,
        closed_at: new Date().toISOString(),
        closed_by: user.id
    }, { onConflict: 'tenant_id,closure_date' })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}

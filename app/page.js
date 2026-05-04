import { createClient } from '@/utils/supabase/server'
import DashboardHome from '@/components/DashboardHome'
import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth-cache'

// Garante render dinâmico — sem cache de página entre requests.
// Sem isso, o Next 16 pode tratar a home como cacheável e congelar as
// metrics num snapshot antigo. Dashboard tem dados sempre frescos.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Extrai a data de "hoje" no fuso de Brasília (BRT, UTC-3) — servidor roda
// em UTC na Vercel. Sem essa conversão, depois das 21h BRT o `new Date()` já
// virou pro próximo dia UTC e os filtros `gte/lte date` zerariam a Receita
// de Hoje silenciosamente.
function brtTodayBoundaries() {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now)
    const y = parts.find(p => p.type === 'year').value
    const m = parts.find(p => p.type === 'month').value
    const d = parts.find(p => p.type === 'day').value
    const todayDateStr = `${y}-${m}-${d}`
    const startOfDay = new Date(`${todayDateStr}T00:00:00.000-03:00`).toISOString()
    const endOfDay = new Date(`${todayDateStr}T23:59:59.999-03:00`).toISOString()
    return { todayDateStr, startOfDay, endOfDay }
}

export default async function Home() {
    // Reusa o auth context cacheado — mesma chamada que o layout faz,
    // mas via React cache() vira no-op no segundo call dentro do request.
    // Antes: 2 queries Supabase por page load (layout + page); agora: 1.
    const { user, tenantId } = await getAuthContext()

    if (!user) {
        redirect('/login')
    }

    const supabase = await createClient()

    const metrics = {
        activeOS: 0,
        lowStock: 0,
        todayIncome: 0,
        todayNet: 0,
        todayClosed: false,
        pendingClosuresCount: 0,
        upcomingRevisions: 0,
        pendingExpenses: []
    }

    if (tenantId) {
        const { count: activeCount } = await supabase
            .from('service_orders')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .in('status', ['Aberto', 'Em Andamento'])

        metrics.activeOS = activeCount || 0

        const { data: prods } = await supabase
            .from('products')
            .select('quantity, min_quantity')
            .eq('tenant_id', tenantId)

        metrics.lowStock = prods?.filter(p => p.quantity <= (p.min_quantity || 0)).length || 0

        const { todayDateStr, startOfDay, endOfDay } = brtTodayBoundaries()

        const { data: txs } = await supabase
            .from('transactions')
            .select('amount, type, status')
            .eq('tenant_id', tenantId)
            .eq('status', 'paid')
            .gte('date', startOfDay)
            .lte('date', endOfDay)

        if (txs) {
            metrics.todayIncome = txs
                .filter(t => t.type === 'income')
                .reduce((acc, t) => acc + Number(t.amount), 0)

            const todayExpense = txs
                .filter(t => t.type === 'expense')
                .reduce((acc, t) => acc + Number(t.amount), 0)

            metrics.todayNet = metrics.todayIncome - todayExpense
        }

        const { data: todayClosure } = await supabase
            .from('daily_closures')
            .select('status')
            .eq('tenant_id', tenantId)
            .eq('closure_date', todayDateStr)
            .maybeSingle()

        metrics.todayClosed = todayClosure?.status === 'closed'

        const now = new Date()
        const lookbackDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60).toISOString()

        const { data: pastTxs } = await supabase
            .from('transactions')
            .select('date')
            .eq('tenant_id', tenantId)
            .gte('date', lookbackDate)
            .lt('date', startOfDay)

        const { data: closures } = await supabase
            .from('daily_closures')
            .select('closure_date')
            .eq('tenant_id', tenantId)
            .gte('closure_date', lookbackDate.substring(0, 10))
            .eq('status', 'closed')

        const closedSet = new Set((closures || []).map(c => c.closure_date))
        const movementDays = new Set(
            (pastTxs || []).map(t => {
                const d = new Date(t.date)
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            })
        )

        metrics.pendingClosuresCount = Array.from(movementDays).filter(d => !closedSet.has(d)).length

        const weekAhead = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
        const weekAheadStr = `${weekAhead.getFullYear()}-${String(weekAhead.getMonth() + 1).padStart(2, '0')}-${String(weekAhead.getDate()).padStart(2, '0')}`

        const { data: upcomingRevs } = await supabase
            .from('service_orders')
            .select('client_id')
            .eq('tenant_id', tenantId)
            .not('next_revision_date', 'is', null)
            .gte('next_revision_date', todayDateStr)
            .lte('next_revision_date', weekAheadStr)

        metrics.upcomingRevisions = new Set(
            (upcomingRevs || []).map(r => r.client_id).filter(Boolean)
        ).size

        // ---------------------------------------------------------
        // CONTAS A PAGAR (Próximos Vencimentos)
        // ---------------------------------------------------------
        const { data: pendingExpenses } = await supabase
            .from('transactions')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('type', 'expense')
            .eq('status', 'pending')
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(10)

        metrics.pendingExpenses = pendingExpenses || []
    }

    return (
        <div className="w-full flex justify-center mt-2 md:mt-6">
            <DashboardHome metrics={metrics} />
        </div>
    )
}

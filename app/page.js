import { createClient } from '@/utils/supabase/server'
import DashboardHome from '@/components/DashboardHome'
import { redirect } from 'next/navigation'

export default async function Home() {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (!user || userError) {
        redirect('/login')
    }

    // profiles.user_id é a coluna canônica (moderna). Mantemos fallback por
    // .eq('id', ...) pra rows antigas inseridas antes do refactor de schema —
    // mesmo padrão usado em todos os outros pontos de auth do app (api routes,
    // server actions). Sem o user_id-first o tenantId vinha undefined no home,
    // zerando todas as metrics — incluindo Receita de Hoje.
    let tenantId = null
    const { data: profileByUserId } = await supabase
        .from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle()
    tenantId = profileByUserId?.tenant_id ?? null
    if (!tenantId) {
        const { data: profileById } = await supabase
            .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
        tenantId = profileById?.tenant_id ?? null
    }

    let activeOS = 0
    let lowStock = 0
    let todayIncome = 0
    let todayNet = 0
    let todayClosed = false
    let pendingClosuresCount = 0
    let upcomingRevisions = 0

    if (tenantId) {
        const { count: activeCount } = await supabase
            .from('service_orders')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .in('status', ['Aberto', 'Em Andamento'])

        activeOS = activeCount || 0

        const { data: prods } = await supabase
            .from('products')
            .select('quantity, min_quantity')
            .eq('tenant_id', tenantId)

        lowStock = prods?.filter(p => p.quantity <= (p.min_quantity || 0)).length || 0

        const now = new Date()
        const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

        const { data: txs } = await supabase
            .from('transactions')
            .select('amount, type, status')
            .eq('tenant_id', tenantId)
            .eq('status', 'paid')
            .gte('date', startOfDay)
            .lte('date', endOfDay)

        if (txs) {
            todayIncome = txs
                .filter(t => t.type === 'income')
                .reduce((acc, t) => acc + Number(t.amount), 0)

            const todayExpense = txs
                .filter(t => t.type === 'expense')
                .reduce((acc, t) => acc + Number(t.amount), 0)

            todayNet = todayIncome - todayExpense
        }

        const { data: todayClosure } = await supabase
            .from('daily_closures')
            .select('status')
            .eq('tenant_id', tenantId)
            .eq('closure_date', todayDateStr)
            .maybeSingle()

        todayClosed = todayClosure?.status === 'closed'

        // Pending days = days with movement in the past that aren't closed yet.
        // Look back up to 60 days to keep it bounded.
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

        pendingClosuresCount = Array.from(movementDays).filter(d => !closedSet.has(d)).length

        // Próximas revisões agendadas vencendo nos próximos 7 dias (incluindo hoje).
        // Dedup por client_id — interessa "quantas pessoas pra contatar", não quantas
        // OS. Clientes nulos (OS de terceiros) são descartados.
        const weekAhead = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
        const weekAheadStr = `${weekAhead.getFullYear()}-${String(weekAhead.getMonth() + 1).padStart(2, '0')}-${String(weekAhead.getDate()).padStart(2, '0')}`

        const { data: upcomingRevs } = await supabase
            .from('service_orders')
            .select('client_id')
            .eq('tenant_id', tenantId)
            .not('next_revision_date', 'is', null)
            .gte('next_revision_date', todayDateStr)
            .lte('next_revision_date', weekAheadStr)

        upcomingRevisions = new Set(
            (upcomingRevs || []).map(r => r.client_id).filter(Boolean)
        ).size
    }

    const metrics = {
        activeOS,
        lowStock,
        todayIncome,
        todayNet,
        todayClosed,
        pendingClosuresCount,
        upcomingRevisions
    }

    return (
        <div className="w-full flex justify-center mt-2 md:mt-6">
            <DashboardHome metrics={metrics} />
        </div>
    )
}

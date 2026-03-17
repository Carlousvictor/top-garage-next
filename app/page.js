import { createClient } from '@/utils/supabase/server'
import DashboardHome from '@/components/DashboardHome'
import { redirect } from 'next/navigation'

export default async function Home() {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (!user || userError) {
        redirect('/login')
    }

    // Attempt to get user's tenant_id loosely to avoid hard crashes if not immediately available
    // For a deeper implementation, we use AuthContext, but here we can do a quick check via profiles
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    const tenantId = profile?.tenant_id

    let activeOS = 0
    let lowStock = 0
    let todayIncome = 0

    if (tenantId) {
        // 1. Get active OS count
        const { count: activeCount } = await supabase
            .from('service_orders')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .in('status', ['Aberto', 'Em Andamento'])

        activeOS = activeCount || 0

        // 2. Get low stock count directly via SQL view equivalent logic or crude count (requires fetching min_quantity and comparing, doing a rough check here)
        // Since we can't do column comparison easily in basic PostgREST without a view, 
        // we'll fetch products and filter in JS. Not ideal for huge DBs, but fine for local scale.
        const { data: prods } = await supabase
            .from('products')
            .select('quantity, min_quantity')
            .eq('tenant_id', tenantId)
        
        lowStock = prods?.filter(p => p.quantity <= (p.min_quantity || 0)).length || 0

        // 3. Today's income
        const now = new Date()
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

        const { data: txs } = await supabase
            .from('transactions')
            .select('amount')
            .eq('tenant_id', tenantId)
            .eq('type', 'income')
            .eq('status', 'paid')
            .gte('date', startOfDay)
            .lte('date', endOfDay)

        todayIncome = txs?.reduce((acc, t) => acc + Number(t.amount), 0) || 0
    }

    const metrics = {
        activeOS,
        lowStock,
        todayIncome
    }

    return (
        <div className="w-full flex justify-center mt-2 md:mt-6">
            <DashboardHome metrics={metrics} />
        </div>
    )
}

import { createClient } from '@/utils/supabase/server'
import FinancialDashboard from '@/components/FinancialDashboard'

export default async function FinancialPage() {
    const supabase = await createClient()

    // 1. Transactions (Overview)
    const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'paid')
        .order('date', { ascending: false })
        .limit(50)

    // 2. Summary Stats (Parallel Fetch)
    const getSum = async (type, status) => {
        const { data } = await supabase.from('transactions').select('amount').eq('type', type).eq('status', status)
        return data?.reduce((acc, t) => acc + Number(t.amount), 0) || 0
    }

    const [income, expense, pendingPayable, pendingReceivable] = await Promise.all([
        getSum('income', 'paid'),
        getSum('expense', 'paid'),
        getSum('expense', 'pending'),
        getSum('income', 'pending')
    ])

    const initialSummary = {
        income,
        expense,
        balance: income - expense,
        pendingPayable,
        pendingReceivable
    }

    return <FinancialDashboard initialTransactions={transactions || []} initialSummary={initialSummary} />
}

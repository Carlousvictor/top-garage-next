import { createClient } from '@/utils/supabase/server'
import InventoryList from '@/components/InventoryList'

export const dynamic = 'force-dynamic'

async function getTenantId(supabase, user) {
    const { data: p } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle()
    if (p?.tenant_id) return p.tenant_id
    const { data: p2 } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    return p2?.tenant_id ?? null
}

export default async function InventoryListPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const tenantId = user ? await getTenantId(supabase, user) : null

    // Carrega as sessões + agrega progresso (contados/total) por sessão.
    // Se as tabelas ainda não existem (migration não rodada), sinaliza pra UI
    // mostrar o aviso em vez de estourar erro.
    let inventories = []
    let tablesMissing = false
    if (tenantId) {
        const { data, error } = await supabase
            .from('inventories')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
        if (error) {
            tablesMissing = true
        } else {
            inventories = data || []
            const ids = inventories.map(i => i.id)
            if (ids.length > 0) {
                const { data: items } = await supabase
                    .from('inventory_items')
                    .select('inventory_id, counted_quantity')
                    .in('inventory_id', ids)
                const agg = {}
                for (const it of (items || [])) {
                    const a = agg[it.inventory_id] || (agg[it.inventory_id] = { total: 0, counted: 0 })
                    a.total++
                    if (it.counted_quantity !== null && it.counted_quantity !== undefined) a.counted++
                }
                inventories = inventories.map(i => ({
                    ...i,
                    _total: agg[i.id]?.total ?? 0,
                    _counted: agg[i.id]?.counted ?? 0,
                }))
            }
        }
    }

    return <InventoryList initialInventories={inventories} tablesMissing={tablesMissing} />
}

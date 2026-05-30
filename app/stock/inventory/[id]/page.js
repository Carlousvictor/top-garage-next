import { createClient } from '@/utils/supabase/server'
import InventoryCount from '@/components/InventoryCount'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function InventoryCountPage({ params }) {
    const { id } = await params
    const supabase = await createClient()

    const [{ data: inventory, error }, { data: items }] = await Promise.all([
        supabase.from('inventories').select('*').eq('id', id).single(),
        supabase.from('inventory_items').select('*').eq('inventory_id', id).order('position', { ascending: true }),
    ])

    if (error || !inventory) notFound()

    // Saldo AO VIVO: o inventário não congela o estoque. A coluna "Sistema" mostra
    // o products.quantity atual (refletindo vendas feitas durante a contagem).
    // Buscamos o saldo corrente dos produtos e mesclamos como current_quantity.
    // Fallback p/ o snapshot do início (system_quantity) se o produto foi removido.
    const productIds = [...new Set((items || []).map(it => it.product_id).filter(v => v != null))]
    const qtyMap = {}
    if (productIds.length > 0) {
        const { data: prods } = await supabase.from('products').select('id, quantity').in('id', productIds)
        for (const p of (prods || [])) qtyMap[p.id] = p.quantity
    }
    const merged = (items || []).map(it => ({
        ...it,
        current_quantity: (it.product_id != null && qtyMap[it.product_id] != null)
            ? qtyMap[it.product_id]
            : it.system_quantity,
    }))

    return <InventoryCount inventory={inventory} initialItems={merged} />
}

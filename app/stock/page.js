import { Suspense } from 'react'
import { createClient } from '@/utils/supabase/server'
import ProductList from '@/components/ProductList'

// Render server-side em toda visita: sem isso, depois de lançar uma NF
// (XML ou manual) os produtos recém-inseridos não apareciam porque o
// Next servia o snapshot SSR cacheado. revalidatePath('/stock') no
// final do POST de entrada complementa, mas force-dynamic é o que
// garante consistência também quando o operador navega por links.
export const dynamic = 'force-dynamic'

async function getTenantId(supabase, user) {
    const { data: p } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle()
    if (p?.tenant_id) return p.tenant_id
    const { data: p2 } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    return p2?.tenant_id ?? null
}

export default async function StockPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const tenantId = user ? await getTenantId(supabase, user) : null

    const [productsRes, suppliersRes, categoriesRes, brandsRes] = await Promise.all([
        tenantId
            ? supabase.from('products')
                .select('*, suppliers(name), categories(name), brands(name)')
                .eq('tenant_id', tenantId)
                .order('name')
            : supabase.from('products')
                .select('*, suppliers(name), categories(name), brands(name)')
                .order('name'),
        supabase.from('suppliers').select('*').order('name'),
        tenantId
            ? supabase.from('categories').select('*').eq('tenant_id', tenantId).order('name')
            : Promise.resolve({ data: [] }),
        tenantId
            ? supabase.from('brands').select('*').eq('tenant_id', tenantId).order('name')
            : Promise.resolve({ data: [] }),
    ])

    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-400 animate-pulse">Carregando estoque...</div>}>
            <ProductList
                initialProducts={productsRes.data || []}
                initialSuppliers={suppliersRes.data || []}
                initialCategories={categoriesRes.data || []}
                initialBrands={brandsRes.data || []}
            />
        </Suspense>
    )
}

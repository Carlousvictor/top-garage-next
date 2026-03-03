import { createClient } from '@/utils/supabase/server'
import ProductList from '@/components/ProductList'

export default async function StockPage() {
    const supabase = await createClient()

    const { data: products } = await supabase
        .from('products')
        .select(`
            *,
            suppliers (name),
            categories (name),
            brands (name)
        `)
        .order('name')

    const { data: suppliers } = await supabase
        .from('suppliers')
        .select('*')
        .order('name')

    const { data: categories } = await supabase
        .from('categories')
        .select('*')
        .order('name')

    const { data: brands } = await supabase
        .from('brands')
        .select('*')
        .order('name')

    return <ProductList
        initialProducts={products || []}
        initialSuppliers={suppliers || []}
        initialCategories={categories || []}
        initialBrands={brands || []}
    />
}

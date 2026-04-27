import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...fields } = body

    if (id) {
        // UPDATE
        const { tenant_id: _tid, ...updatePayload } = fields
        const { error } = await supabase
            .from('products')
            .update(updatePayload)
            .eq('id', id)

        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
        // INSERT
        const { error } = await supabase
            .from('products')
            .insert([fields])

        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Retorna lista atualizada com joins
    const { data: products, error: listError } = await supabase
        .from('products')
        .select('*, suppliers(name), categories(name), brands(name)')
        .order('name')

    if (listError) return NextResponse.json({ error: listError.message }, { status: 400 })

    return NextResponse.json({ products })
}

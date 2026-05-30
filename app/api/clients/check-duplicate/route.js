import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantId(supabase, user) {
    const { data: p } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle()
    if (p?.tenant_id) return p.tenant_id
    const { data: p2 } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    return p2?.tenant_id ?? null
}

const normalizeDocument = (d) => (d ? String(d).replace(/\D/g, '') || null : null)
const normalizePhone = (p) => (p ? String(p).replace(/\D/g, '') || null : null)
const normalizeName = (n) => (n ? String(n).trim().toLowerCase().replace(/\s+/g, ' ') : null)

// Check live para o formulário de cliente. Retorna o duplicado se houver,
// sem bloquear nada — quem decide é o frontend.
// Aceita ?name=&phone=&document=&excludeId=
export async function GET(request) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ duplicate: null })

    const { searchParams } = new URL(request.url)
    const name = normalizeName(searchParams.get('name'))
    const phone = normalizePhone(searchParams.get('phone'))
    const document = normalizeDocument(searchParams.get('document'))
    const excludeId = searchParams.get('excludeId')

    // 1) Documento primeiro
    if (document) {
        let q = supabase
            .from('clients')
            .select('id, client_number, name, phone, document')
            .eq('tenant_id', tenantId)
            .eq('document', document)
        if (excludeId) q = q.neq('id', excludeId)
        const { data } = await q.maybeSingle()
        if (data) return NextResponse.json({ duplicate: data, reason: 'document' })
    }

    // 2) Nome + telefone (ambos preenchidos)
    if (name && phone) {
        let q = supabase
            .from('clients')
            .select('id, client_number, name, phone, document')
            .eq('tenant_id', tenantId)
            .ilike('name', name)
        if (excludeId) q = q.neq('id', excludeId)
        const { data: rows } = await q
        const match = (rows || []).find(r => normalizePhone(r.phone) === phone)
        if (match) return NextResponse.json({ duplicate: match, reason: 'name_phone' })
    }

    return NextResponse.json({ duplicate: null })
}

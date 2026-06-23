import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantId(supabase, user) {
    const { data: p } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle()
    if (p?.tenant_id) return p.tenant_id
    const { data: p2 } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    return p2?.tenant_id ?? null
}

function normalizeDocument(doc) {
    if (!doc) return null
    const digits = String(doc).replace(/\D/g, '')
    return digits || null
}

function normalizePhone(phone) {
    if (!phone) return null
    const digits = String(phone).replace(/\D/g, '')
    return digits || null
}

function normalizeName(name) {
    if (!name) return null
    return String(name).trim().toLowerCase().replace(/\s+/g, ' ')
}

// Procura cliente duplicado por nome+telefone (normalizados) ou por documento.
// Retorna o primeiro match encontrado, ou null.
async function findDuplicate(supabase, tenantId, { name, phone, document, excludeId }) {
    const nameNorm = normalizeName(name)
    const phoneNorm = normalizePhone(phone)
    const docNorm = normalizeDocument(document)

    // 1) Documento sempre tem prioridade (mais confiável)
    if (docNorm) {
        let q = supabase
            .from('clients')
            .select('id, client_number, name, phone, document')
            .eq('tenant_id', tenantId)
            .eq('document', docNorm)
        if (excludeId) q = q.neq('id', excludeId)
        const { data } = await q.maybeSingle()
        if (data) return { match: data, reason: 'document' }
    }

    // 2) Nome + telefone (ambos preenchidos)
    if (nameNorm && phoneNorm) {
        let q = supabase
            .from('clients')
            .select('id, client_number, name, phone, document')
            .eq('tenant_id', tenantId)
            .ilike('name', nameNorm)
        if (excludeId) q = q.neq('id', excludeId)
        const { data: rows } = await q
        const match = (rows || []).find(r => normalizePhone(r.phone) === phoneNorm)
        if (match) return { match, reason: 'name_phone' }
    }

    return null
}

async function nextClientNumber(supabase, tenantId) {
    const { data, error } = await supabase
        .from('clients')
        .select('client_number')
        .eq('tenant_id', tenantId)
        .order('client_number', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
    if (error) throw new Error(error.message)
    const current = Number(data?.client_number) || 0
    return current + 1
}

export async function GET() {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ clients: [] })

    const { data, error } = await supabase
        .from('clients')
        .select('*, vehicles(plate)')
        .eq('tenant_id', tenantId)
        .order('client_number', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ clients: data || [] })
}

export async function POST(request) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 403 })

    const body = await request.json()
    const { id, name, email, phone, document, vehicles = [] } = body

    if (!name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })

    const docNorm = normalizeDocument(document)

    if (id) {
        // Atualização — bloqueia duplicate por (document) ou (nome+telefone)
        const dup = await findDuplicate(supabase, tenantId, { name, phone, document, excludeId: id })
        if (dup) {
            const label = dup.reason === 'document' ? 'CPF/CNPJ' : 'nome + telefone'
            return NextResponse.json(
                { error: `${label} já cadastrado para o cliente #${dup.match.client_number ?? '?'} (${dup.match.name}).`, duplicate: dup.match },
                { status: 409 }
            )
        }

        const { error } = await supabase
            .from('clients')
            .update({
                name: name.trim(),
                email: email || null,
                phone: phone || null,
                document: docNorm,
            })
            .eq('id', id)
            .eq('tenant_id', tenantId)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
        // Criação — bloqueia duplicate por (document) ou (nome+telefone)
        const dup = await findDuplicate(supabase, tenantId, { name, phone, document })
        if (dup) {
            const label = dup.reason === 'document' ? 'CPF/CNPJ' : 'nome + telefone'
            return NextResponse.json(
                { error: `${label} já cadastrado para o cliente #${dup.match.client_number ?? '?'} (${dup.match.name}).`, duplicate: dup.match },
                { status: 409 }
            )
        }

        let attempt = 0
        let inserted = null
        let lastError = null
        while (attempt < 3 && !inserted) {
            const nextNum = await nextClientNumber(supabase, tenantId)
            const { data, error } = await supabase
                .from('clients')
                .insert([{
                    tenant_id: tenantId,
                    client_number: nextNum,
                    name: name.trim(),
                    email: email || null,
                    phone: phone || null,
                    document: docNorm,
                }])
                .select()
                .single()
            if (!error) { inserted = data; break }
            lastError = error
            // Conflito de unique(tenant_id, client_number) → tenta o próximo
            if (error.code === '23505') { attempt++; continue }
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        if (!inserted) {
            return NextResponse.json({ error: lastError?.message || 'Não foi possível gerar número de cliente.' }, { status: 400 })
        }

        if (vehicles.length > 0) {
            const vehiclesPayload = vehicles.map(v => ({
                tenant_id: tenantId,
                client_id: inserted.id,
                plate: v.plate?.toUpperCase() || null,
                brand: v.brand || null,
                model: v.model || null,
                year: v.year || null,
                color: v.color || null,
                submodel: v.submodel || null,
                manufacture_year: v.manufacture_year || null,
                fuel_type: v.fuel_type || null,
                chassi: v.chassi || null,
                engine_displacement: v.engine_displacement || null,
                transmission: v.transmission || null,
                city: v.city || null,
                state: v.state || null,
                observations: v.observations || null,
            }))
            await supabase.from('vehicles').insert(vehiclesPayload)
        }
    }

    const { data: clients } = await supabase
        .from('clients')
        .select('*, vehicles(plate)')
        .eq('tenant_id', tenantId)
        .order('client_number', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true })
    return NextResponse.json({ clients: clients || [] })
}

export async function DELETE(request) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const force = searchParams.get('force') === '1'
    if (!id) return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 403 })

    // Confirma que o cliente existe e pertence ao tenant
    const { data: client } = await supabase
        .from('clients')
        .select('id, client_number, name')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (!client) {
        return NextResponse.json({ error: 'Cliente não encontrado ou já excluído.' }, { status: 404 })
    }

    // Pre-check dependências.
    // "Movimentação" = ter ordens de serviço. Veículos NÃO contam: são dados
    // cadastrais (em cadastros duplicados costumam ser cópias dos mesmos carros).
    // Transações se vinculam à OS (related_os_id), não ao cliente — logo a OS já
    // representa a movimentação financeira. Cadastro sem OS pode ser excluído
    // direto, levando seus veículos-cópia junto.
    const [{ count: vehiclesCount }, { count: ordersCount }] = await Promise.all([
        supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('client_id', id),
        supabase.from('service_orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('client_id', id),
    ])

    const hasMovement = (ordersCount || 0) > 0

    // Com movimentação e sem force → bloqueia e oferece mesclagem (preserva dados).
    if (hasMovement && !force) {
        return NextResponse.json({
            error: `Cliente #${client.client_number ?? '?'} (${client.name}) possui ${ordersCount} ordem(ns) de serviço com movimentação. Para não perder o histórico, mescle este cadastro com outro cliente.`,
            dependencies: { vehicles: vehiclesCount || 0, service_orders: ordersCount || 0 },
        }, { status: 409 })
    }

    // Sem movimentação (ou force): remove os veículos-cópia do cadastro antes de excluí-lo,
    // evitando órfãos e o bloqueio da FK vehicles.client_id.
    if ((vehiclesCount || 0) > 0) {
        const { error: vErr } = await supabase
            .from('vehicles')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('client_id', id)
        if (vErr) return NextResponse.json({ error: 'Erro ao remover veículos do cliente: ' + vErr.message }, { status: 400 })
    }

    const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}

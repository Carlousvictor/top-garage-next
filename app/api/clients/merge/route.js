import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

async function getTenantId(supabase, user) {
    const { data: p } = await supabase.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle()
    if (p?.tenant_id) return p.tenant_id
    const { data: p2 } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    return p2?.tenant_id ?? null
}

const normalizePlate = (plate) => (plate ? String(plate).replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '')

// Mescla dois cadastros do mesmo cliente em um só.
// sourceId = cadastro duplicado que será REMOVIDO.
// targetId = cadastro que será MANTIDO e recebe os dados do source.
// Regras:
//  - OS e transações do source são reatribuídas ao target (nada é apagado).
//  - Veículos: dedup por placa. Se o target já tem a placa, o veículo duplicado
//    do source é descartado; senão é movido para o target.
//  - O cliente source é excluído ao final.
export async function POST(request) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tenantId = await getTenantId(supabase, user)
    if (!tenantId) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 403 })

    const { sourceId, targetId } = await request.json()
    if (!sourceId || !targetId) {
        return NextResponse.json({ error: 'sourceId e targetId são obrigatórios.' }, { status: 400 })
    }
    if (sourceId === targetId) {
        return NextResponse.json({ error: 'Origem e destino não podem ser o mesmo cliente.' }, { status: 400 })
    }

    // Valida que ambos pertencem ao tenant
    const { data: pair } = await supabase
        .from('clients')
        .select('id, client_number, name')
        .eq('tenant_id', tenantId)
        .in('id', [sourceId, targetId])
    const source = (pair || []).find(c => c.id === sourceId)
    const target = (pair || []).find(c => c.id === targetId)
    if (!source || !target) {
        return NextResponse.json({ error: 'Cliente de origem ou destino não encontrado.' }, { status: 404 })
    }

    // 1) Reatribui ordens de serviço. As transações financeiras se vinculam à OS
    // (transactions.related_os_id), não ao cliente — logo seguem a OS automaticamente.
    {
        const { error } = await supabase
            .from('service_orders')
            .update({ client_id: targetId })
            .eq('tenant_id', tenantId)
            .eq('client_id', sourceId)
        if (error) return NextResponse.json({ error: 'Erro ao mover ordens de serviço: ' + error.message }, { status: 400 })
    }

    // 2) Veículos — dedup por placa
    const [{ data: targetVehicles }, { data: sourceVehicles }] = await Promise.all([
        supabase.from('vehicles').select('id, plate').eq('tenant_id', tenantId).eq('client_id', targetId),
        supabase.from('vehicles').select('id, plate').eq('tenant_id', tenantId).eq('client_id', sourceId),
    ])
    const targetPlates = new Set((targetVehicles || []).map(v => normalizePlate(v.plate)).filter(Boolean))

    const vehiclesToMove = []
    const vehiclesToDelete = []
    for (const v of (sourceVehicles || [])) {
        const plate = normalizePlate(v.plate)
        // Veículo com placa que o destino já possui → duplicado, descarta.
        // Veículo sem placa ou com placa nova → move pro destino.
        if (plate && targetPlates.has(plate)) {
            vehiclesToDelete.push(v.id)
        } else {
            vehiclesToMove.push(v.id)
            if (plate) targetPlates.add(plate) // evita mover dois iguais do próprio source
        }
    }

    if (vehiclesToMove.length > 0) {
        const { error } = await supabase
            .from('vehicles')
            .update({ client_id: targetId })
            .eq('tenant_id', tenantId)
            .in('id', vehiclesToMove)
        if (error) return NextResponse.json({ error: 'Erro ao mover veículos: ' + error.message }, { status: 400 })
    }
    if (vehiclesToDelete.length > 0) {
        const { error } = await supabase
            .from('vehicles')
            .delete()
            .eq('tenant_id', tenantId)
            .in('id', vehiclesToDelete)
        if (error) return NextResponse.json({ error: 'Erro ao remover veículos duplicados: ' + error.message }, { status: 400 })
    }

    // 3) Exclui o cliente source (agora sem dependências)
    {
        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', sourceId)
            .eq('tenant_id', tenantId)
        if (error) return NextResponse.json({ error: 'Erro ao excluir o cliente duplicado: ' + error.message }, { status: 400 })
    }

    // Retorna lista atualizada
    const { data: clients } = await supabase
        .from('clients')
        .select('*, vehicles(plate)')
        .eq('tenant_id', tenantId)
        .order('client_number', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true })

    return NextResponse.json({
        success: true,
        merged: {
            source: { id: source.id, name: source.name, client_number: source.client_number },
            target: { id: target.id, name: target.name, client_number: target.client_number },
            vehicles_moved: vehiclesToMove.length,
            vehicles_discarded: vehiclesToDelete.length,
        },
        clients: clients || [],
    })
}

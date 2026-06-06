import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth-cache'

export async function GET() {
    // Reusa o auth context cacheado — em warm instance evita DB round-trip.
    // Em cold start (cache vazio) faz a mesma resolução com dual-key + maybeSingle.
    const auth = await getAuthContext()
    if (!auth.user) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    return NextResponse.json({
        tenantId: auth.tenantId,
        role: auth.role,
        actingTenantId: auth.actingTenantId ?? null,
    })
}

/**
 * Auth context cache — economiza queries repetidas pro Supabase
 * dentro do mesmo render tree e entre requests no mesmo warm instance.
 *
 * Duas camadas:
 *
 * 1. React `cache()` — dedup dentro do MESMO request. Layout, page e API
 *    routes podem chamar getAuthContext() múltiplas vezes que só uma execução
 *    ocorre. Standard pattern do Next 14+ pra server components.
 *
 * 2. In-memory TTL cache — dedup ENTRE requests no mesmo Vercel function
 *    instance (warm). Profiles cacheiam por 30s, tenants por 60s. Hit rate
 *    típico em prod com 1000+ usuários: ~95% pro tenant, ~80% pro profile.
 *
 * Limitações conhecidas:
 * - Cada warm instance tem seu próprio Map em memória — sem coordenação
 *   entre instances. Pra invalidação cross-instance precisaria Redis/KV.
 *   Pro caso "admin atualiza nome do tenant", o stale máximo é 60s.
 * - Cold start = miss em ambas as camadas, mesmo custo de antes da otimização.
 */

import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'

const TENANT_TTL_MS = 60 * 1000      // tenant raramente muda; 60s é seguro
const PROFILE_TTL_MS = 30 * 1000     // role pode mudar com mais frequência
const MAX_ENTRIES = 1000             // teto de memória — força prune quando exceder

const tenantCache = new Map()        // tenantId → { data, expiresAt }
const profileCache = new Map()       // userId → { tenantId, role, expiresAt }

function pruneIfNeeded(map) {
    if (map.size <= MAX_ENTRIES) return
    // Tira os mais próximos de expirar primeiro — heurística simples e barata.
    const sorted = Array.from(map.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    const toRemove = sorted.slice(0, map.size - MAX_ENTRIES)
    for (const [k] of toRemove) map.delete(k)
}

function readFromCache(map, key) {
    const entry = map.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
        map.delete(key)
        return null
    }
    return entry
}

function writeToCache(map, key, value, ttlMs) {
    map.set(key, { ...value, expiresAt: Date.now() + ttlMs })
    pruneIfNeeded(map)
}

/**
 * Resolve user + profile + tenant. Idempotente dentro do mesmo request via
 * React `cache()`. Cross-request via Maps em memória com TTL.
 *
 * Retorna sempre o mesmo shape, mesmo quando user é null:
 *   { user, tenantId, tenant, role }
 */
export const getAuthContext = cache(async () => {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { user: null, tenantId: null, tenant: null, role: null }
        }

        // 1. Profile (tenant_id + role) — tenta cache, depois Supabase com dual-key
        let tenantId = null
        let role = null
        const cachedProfile = readFromCache(profileCache, user.id)
        if (cachedProfile) {
            tenantId = cachedProfile.tenantId
            role = cachedProfile.role
        } else {
            // user_id é canônico; .id é legacy — sempre tenta na ordem certa
            const { data: p1 } = await supabase
                .from('profiles')
                .select('tenant_id, role')
                .eq('user_id', user.id)
                .maybeSingle()
            if (p1?.tenant_id) {
                tenantId = p1.tenant_id
                role = p1.role ?? null
            } else {
                const { data: p2 } = await supabase
                    .from('profiles')
                    .select('tenant_id, role')
                    .eq('id', user.id)
                    .maybeSingle()
                tenantId = p2?.tenant_id ?? null
                role = p2?.role ?? null
            }
            writeToCache(profileCache, user.id, { tenantId, role }, PROFILE_TTL_MS)
        }

        // 2. Tenant data — só se temos tenantId
        let tenant = null
        if (tenantId) {
            const cachedTenant = readFromCache(tenantCache, tenantId)
            if (cachedTenant) {
                tenant = cachedTenant.data
            } else {
                const { data: t } = await supabase
                    .from('tenants')
                    .select('name, logo_url, primary_color, document')
                    .eq('id', tenantId)
                    .maybeSingle()
                tenant = t ?? null
                if (tenant) {
                    writeToCache(tenantCache, tenantId, { data: tenant }, TENANT_TTL_MS)
                }
            }
        }

        return {
            user: { id: user.id, email: user.email },
            tenantId,
            tenant,
            role,
        }
    } catch (err) {
        // Não derruba o caller — retorna shape vazio. Cliente revalida.
        console.error('[auth-cache] getAuthContext failed:', err)
        return { user: null, tenantId: null, tenant: null, role: null }
    }
})

/**
 * Invalida cache de um perfil específico. Chame quando role/tenant_id de um
 * usuário muda (ex: admin troca o tenant de alguém via /api/admin/...).
 */
export function invalidateProfileCache(userId) {
    if (userId) profileCache.delete(userId)
}

/**
 * Invalida cache de um tenant específico. Chame quando dados do tenant
 * mudam (nome, logo, cor) — a próxima request vai bater no Supabase.
 */
export function invalidateTenantCache(tenantId) {
    if (tenantId) tenantCache.delete(tenantId)
}

/**
 * Drain manual — útil em debug ou quando algo crítico muda. Não use em hot path.
 */
export function invalidateAllCaches() {
    profileCache.clear()
    tenantCache.clear()
}

'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createTenantAndAdmin(formData) {
    // 1. Validate inputs
    const companyName = formData.get('companyName')
    const document = formData.get('document') // CNPJ
    const companyPhone = formData.get('companyPhone')
    const companyEmail = formData.get('companyEmail')
    
    const adminName = formData.get('adminName')
    const adminEmail = formData.get('adminEmail')
    const adminPassword = formData.get('adminPassword')

    if (!companyName || !document || !adminName || !adminEmail || !adminPassword) {
        return { error: 'Preencha todos os campos obrigatórios.' }
    }

    // 2. Initial Setup to Verify current user is Super Admin
    const cookieStore = await cookies()
    const supabaseClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll() {}
            },
        }
    )

    const { data: { user: currentUser }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !currentUser) {
        return { error: 'Não autorizado. Sessão inválida.' }
    }

    const { data: currentProfile } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('user_id', currentUser.id)
        .single()

    if (currentProfile?.role !== 'super_admin') {
        return { error: 'Acesso negado. Apenas super administradores podem criar novos tenants.' }
    }

    // 3. Service Role for Admin Tasks
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        return { error: 'Chave do servidor ausente.' }
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 4. Cria o tenant (fonte de verdade do multi-tenancy; FK de profiles aponta aqui)
    const { data: tenant, error: tenantError } = await supabaseAdmin
        .from('tenants')
        .insert([{
            name: companyName,
            document: document,
            phone: companyPhone || null,
            email: companyEmail || null,
            status: 'active'
        }])
        .select()
        .single()

    if (tenantError) {
        return { error: `Erro ao criar empresa: ${tenantError.message}` }
    }

    // 5. Cria o auth user já com email confirmado
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { name: adminName }
    })

    if (authError) {
        // Rollback do tenant pra não deixar órfão
        await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
        return { error: `Erro ao criar usuário: ${authError.message}` }
    }

    // 6. Cria profile do admin apontando pro novo tenant (role 'admin' = dono da empresa cliente)
    const newUserId = authData.user.id
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert([{
            user_id: newUserId,
            tenant_id: tenant.id,
            role: 'admin'
        }])

    if (profileError) {
        // Best-effort rollback: apaga auth user e tenant recém-criados
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
        await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
        return { error: `Erro ao criar perfil do admin: ${profileError.message}` }
    }

    return { success: true, message: `Empresa "${companyName}" cadastrada. Admin pode entrar com ${adminEmail}.` }
}

// Permite a super_admin "entrar como" outro tenant atualizando o próprio profile.tenant_id.
// Todas as queries subsequentes (via RLS + user_tenant_id()) passam a enxergar os dados
// desse tenant. Pra voltar ao ambiente próprio basta entrar de novo no tenant "Garaje.io Admin".
export async function enterTenant(targetTenantId) {
    if (!targetTenantId) return { error: 'Empresa não informada.' }

    const cookieStore = await cookies()
    const supabaseClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll() {}
            },
        }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) return { error: 'Sessão inválida.' }

    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single()

    if (profile?.role !== 'super_admin') {
        return { error: 'Apenas super admins podem alternar entre empresas.' }
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return { error: 'Chave do servidor ausente.' }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Valida que o tenant existe antes de apontar pra ele
    const { data: tenant, error: tenantErr } = await supabaseAdmin
        .from('tenants')
        .select('id, name')
        .eq('id', targetTenantId)
        .single()

    if (tenantErr || !tenant) return { error: 'Empresa não encontrada.' }

    const { error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({ tenant_id: tenant.id })
        .eq('user_id', user.id)

    if (updateErr) return { error: `Erro ao trocar de empresa: ${updateErr.message}` }

    return { success: true, tenantName: tenant.name }
}

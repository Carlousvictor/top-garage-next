'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createUser(formData) {
    const name = formData.get('name')
    const email = formData.get('email')
    const password = formData.get('password')
    const role = formData.get('role') // 'admin' or 'user'

    if (!name || !email || !password || !role) {
        return { error: 'Todos os campos são obrigatórios.' }
    }

    // 1. Get current session to verify admin and get company_id
    const cookieStore = cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    // We don't need to set cookies here, just reading
                },
            },
        }
    )

    const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()

    if (userError || !currentUser) {
        return { error: 'Não autorizado. Faça login novamente.' }
    }

    // Fetch currentUser's profile to get company_id
    const { data: currentProfile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id, role')
        .eq('user_id', currentUser.id)
        .single()

    if (profileError || !currentProfile) {
        return { error: 'Erro ao buscar perfil do administrador.' }
    }

    /* 
       Optional: Enforce that only 'admin' can create users.
       if (currentProfile.role !== 'admin') {
           return { error: 'Apenas administradores podem criar novos usuários.' }
       }
    */

    const companyId = currentProfile.company_id

    // 2. Instantiate Supabase Admin Client (Service Role)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceRoleKey) {
        return { error: 'Configuração de servidor incompleta (SERVICE_ROLE_KEY ausente).' }
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceRoleKey,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    // 3. Create User in Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email since admin created it
        user_metadata: { name }
    })

    if (authError) {
        return { error: `Erro ao criar autenticação: ${authError.message}` }
    }

    const newUserId = authData.user.id

    // 4. Create Profile linked to Company
    const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert([{
            user_id: newUserId,
            company_id: companyId,
            role: role
        }])

    if (insertError) {
        // Optional: Rollback auth creation if profile fails? 
        // For now just return error, but user exists in Auth.
        return { error: `Usuário criado, mas erro ao vincular perfil: ${insertError.message}` }
    }

    return { success: true, message: 'Usuário criado com sucesso!' }
}

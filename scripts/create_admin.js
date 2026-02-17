const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function createAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY // Should ideally be SERVICE_ROLE key for admin tasks, but let's try with anon or require service role

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing env vars. Ensure .env.local exists and has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
        process.exit(1)
    }

    // Note: Creating a user usually requires service_role key to bypass email confirmation or assign specific metadata without login
    // However, with anon key we can just signUp. 
    // If the user wants to "Force" create an admin, we might need the service role key.
    // Assuming the user has the credentials in .env.local

    // Check if we have a service role key for proper admin creation, otherwise fall back to signUp
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const supabase = createClient(supabaseUrl, serviceRoleKey || supabaseKey)

    const email = 'admin@topgarage.com'
    const targetPassword = 'topG326'
    const oldPassword = 'toP326'

    console.log(`Checking status for user: ${email}`)

    // 1. Try to login with NEW password
    let { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password: targetPassword
    })

    if (loginData.session) {
        console.log('Success! User already exists with the new password.')
        return
    }

    // 2. If failed, try header login with OLD password
    console.log('New password login failed. Trying old password...')
    let { data: oldLoginData, error: oldLoginError } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword
    })

    if (oldLoginData.session) {
        console.log('Logged in with old password. Updating to new password...')
        const { error: updateError } = await supabase.auth.updateUser({
            password: targetPassword
        })

        if (updateError) {
            console.error('Failed to update password:', updateError.message)
        } else {
            console.log('Password successfully updated to: topG326')
        }
        return
    }

    // 3. If both failed, try creating the user
    console.log('User does not exist or passwords do not match. Attempting creation...')
    let { data, error } = await supabase.auth.signUp({
        email,
        password: targetPassword,
    })

    if (error) {
        console.error('Error creating user:', error.message)
    } else {
        console.log('User created:', data.user?.email)
    }
}

createAdmin()

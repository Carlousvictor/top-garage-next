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
    const password = 'toP326'

    console.log(`Attempting to create user: ${email}`)

    let { data, error } = await supabase.auth.signUp({
        email,
        password,
    })

    if (error) {
        console.error('Error creating user:', error.message)
    } else {
        console.log('User created/in-process:', data)
        const user = data.user

        if (user) {
            // Create Company and Profile if they don't exist
            // This might fail with RLS if using Anon key and not logged in.
            // But since we are likely using Anon key in this script, we can't easily insert into 'companies' without being logged in AS that user.
            // Actually, signUp auto-logs in.

            // To properly seed, we should ideally use the Service Role Key.
            // If we don't have it, we can't easily guarantee profile creation without a running app context.
            // But let's try.

            console.log("User created. Use the Signup page instead if this doesn't fully set up the company profile.")
        }
    }
}

createAdmin()

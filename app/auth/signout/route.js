import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// Route handler server-side pra logout.
// Motivo: supabase.auth.signOut() do browser client nem sempre limpa os cookies
// httpOnly a tempo da navegação pra /login; o middleware ainda lê o user e rebate
// pra /. Chamando daqui garantimos que o cookie é limpo antes do redirect.
export async function POST(request) {
    const supabase = await createClient()
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}

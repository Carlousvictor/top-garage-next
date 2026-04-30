import "./globals.css";
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { createClient } from '@/utils/supabase/server';

export const metadata = {
  title: "Top Garage RJ",
  description: "Sistema de Gerenciamento Top Garage",
};

// Layout sempre dinâmico — depende de cookies de auth.
export const dynamic = 'force-dynamic';

// Resolve sessão + tenant SERVER-SIDE pra evitar o flash de "Garaje.io"
// que aparecia logo depois de cada deploy/refresh enquanto o AuthContext
// fazia o fetch client-side. Com isso, o HTML já chega com o nome certo
// e o React hidrata sem janela de loading visível.
async function getInitialAuth() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { user: null, tenantId: null, tenant: null, role: null };

    // Dual-key (user_id canônico, .id legacy) — .maybeSingle pra não 500 com 0 rows
    let tenantId = null;
    let role = null;
    const { data: p1 } = await supabase
      .from('profiles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (p1?.tenant_id) {
      tenantId = p1.tenant_id;
      role = p1.role ?? null;
    } else {
      const { data: p2 } = await supabase
        .from('profiles')
        .select('tenant_id, role')
        .eq('id', user.id)
        .maybeSingle();
      tenantId = p2?.tenant_id ?? null;
      role = p2?.role ?? null;
    }

    let tenant = null;
    if (tenantId) {
      const { data: t } = await supabase
        .from('tenants')
        .select('name, logo_url, primary_color, document')
        .eq('id', tenantId)
        .maybeSingle();
      tenant = t ?? null;
    }

    return {
      user: { id: user.id, email: user.email },
      tenantId,
      tenant,
      role,
    };
  } catch (err) {
    // Não derrubar o layout se a query falhar — cliente revalida client-side.
    console.error('getInitialAuth failed:', err);
    return { user: null, tenantId: null, tenant: null, role: null };
  }
}

export default async function RootLayout({ children }) {
  const initialAuth = await getInitialAuth();

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-black text-gray-100 flex flex-col items-center p-4 md:p-6 antialiased print:p-0 print:bg-white print:text-black">
        <AuthProvider initialAuth={initialAuth}>
          <ToastProvider>
            <ConfirmProvider>
              {/* Chrome do app (Header + Navbar) — escondido no print pra que
                  componentes com layout print-only (LowStockReport, ServiceOrderPrint)
                  apareçam sozinhos na folha. */}
              <div className="w-full max-w-screen-2xl flex flex-col xl:flex-row items-center justify-start gap-4 mb-6 print:hidden">
                <Header />
                <Navbar />
              </div>

              <main className="w-full max-w-screen-2xl flex-grow flex flex-col">
                {children}
              </main>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

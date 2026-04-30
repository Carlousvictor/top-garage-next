import "./globals.css";
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { getAuthContext } from '@/lib/auth-cache';

export const metadata = {
  title: "Top Garage RJ",
  description: "Sistema de Gerenciamento Top Garage",
};

// Layout sempre dinâmico — depende de cookies de auth.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  // getAuthContext é cacheado: dedup por request via React cache() +
  // TTL em memória entre requests. No request inicial paga a query,
  // depois reusa por 30-60s. Eliminou o flash de "Garaje.io" + reduz
  // queries pro Supabase em ~95% no caminho feliz.
  const initialAuth = await getAuthContext();

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

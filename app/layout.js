import "./globals.css";
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import { AuthProvider } from '@/context/AuthContext';
import Image from 'next/image';

export const metadata = {
  title: "Top Garage RJ",
  description: "Sistema de Gerenciamento Top Garage",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-black text-gray-100 flex flex-col items-center py-10 px-4 antialiased">
        <AuthProvider>

          <div className="w-full max-w-6xl flex flex-col items-start gap-4 mb-4">
            <Header />
            <Navbar />
          </div>

          <main className="w-full max-w-6xl">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}

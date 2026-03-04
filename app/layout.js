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
      <body className="min-h-screen bg-black text-gray-100 flex flex-col items-center p-4 md:p-6 antialiased">
        <AuthProvider>

          <div className="w-full max-w-screen-2xl flex flex-col xl:flex-row items-center justify-start gap-4 mb-6">
            <Header />
            <Navbar />
          </div>

          <main className="w-full max-w-screen-2xl flex-grow flex flex-col">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}

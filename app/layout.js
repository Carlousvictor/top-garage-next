import "./globals.css";
import Navbar from '../components/Navbar';
import Image from 'next/image';

export const metadata = {
  title: "Top Garage RJ",
  description: "Sistema de Gerenciamento Top Garage",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-black text-gray-100 flex flex-col items-center py-10 px-4 antialiased">
        <header className="mb-10 text-center">
          {/* Using standard img tag for simplicity or Next Image if configured */}
          <img src="/logo.png" alt="Top Garage" className="h-48 mx-auto object-contain" />
        </header>

        <Navbar />

        <main className="w-full max-w-6xl">
          {children}
        </main>
      </body>
    </html>
  );
}


import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ventex App",
  description: "Sistema POS multifuncional",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/*
          Aplica el tema guardado antes de que se pinte nada (evita el flash de
          tema claro). Va como primer hijo de <body> y NO en <head>: React trata
          los hijos de <head> como hoistables, y un script inline no lo es, así
          que lo recrearía en cliente ("scripts inside React components are never
          executed"). En <body> la hidratación reclama el nodo que ya vino en el
          HTML, que es el que de hecho ejecutó el navegador al parsear.
        */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';var d=document.documentElement;d.setAttribute('data-theme',t);d.classList.toggle('dark',t==='dark');}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
          {children}
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

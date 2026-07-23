import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PWAProvider } from "@/components/PWAProvider";
import { Toaster } from "sonner";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ventex App",
  description: "Sistema POS multifuncional",
  applicationName: "Ventex",
  // iOS no lee el manifiesto: la instalación depende de estas metaetiquetas.
  appleWebApp: {
    capable: true,
    title: "Ventex",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: {
    // Next emite el nombre estándar `mobile-web-app-capable`, que iOS solo
    // entiende desde 17.4. El alias con prefijo cubre los iPhone anteriores.
    "apple-mobile-web-app-capable": "yes",
  },
};

/**
 * `viewportFit: "cover"` habilita las variables `env(safe-area-inset-*)`, de las
 * que dependen las barras fijas del POS para no quedar bajo el gesto de inicio
 * del iPhone. Sin `maximumScale`: el zoom del navegador es accesibilidad.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Tiñe la barra del sistema en móvil y la de título de la app instalada.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e19" },
  ],
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
          <PWAProvider />
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

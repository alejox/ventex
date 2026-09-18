import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/site";
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
  /**
   * `metadataBase` es el que convierte en absolutas las canónicas y las
   * imágenes de OpenGraph. Sin él, Next emite rutas relativas: los buscadores
   * las toleran, pero las redes sociales NO — una og:image relativa no se
   * previsualiza en ningún lado.
   */
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Ventex — Sistema POS, inventario y facturación",
    /**
     * La plantilla ahorra repetir la marca en cada página. La landing NO la usa
     * (declara `title.absolute`) porque ahí los ~60 caracteres que muestra
     * Google valen más para las palabras clave que para el nombre repetido.
     */
    template: "%s | Ventex",
  },
  description:
    "Sistema POS para tiendas, salones, lava-autos y servicios: punto de venta, inventario, facturación y finanzas en una sola plataforma.",
  applicationName: "Ventex",
  // Sin `keywords`: Google la ignora desde 2009 y las demás que la leen le dan
  // peso nulo. Ocupa bytes y no compra nada.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Sin estos, Google recorta la descripción y limita la vista previa de
      // imagen y video en los resultados enriquecidos.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Ventex",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
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
      lang="es"
      className={`${plusJakartaSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/*
          Aplica el tema guardado antes de que se pinte nada (evita el flash de
          tema claro). Tiene que ser un <script> a mano, NO next/script: con
          `beforeInteractive` Next no inlinea el código, emite un
          `self.__next_s.push([...])` que solo corre cuando arranca el bundle —
          o sea, después del primer pintado, que es justo lo que queremos evitar.

          React avisa por consola ("scripts inside React components are never
          executed") cuando le toca RE-crear este nodo en cliente, cosa que solo
          pasa si antes falló una hidratación. Si ves ese warning, el bug real
          está en otro lado del árbol, no acá.
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

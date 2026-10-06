import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PWAProvider } from "@/components/PWAProvider";
import { ThemedToaster } from "@/components/ui/ThemedToaster";

export const metadata: Metadata = {
  /**
   * `metadataBase` es el que convierte en absolutas las canónicas y las
   * imágenes de OpenGraph. Sin él, Next emite rutas relativas: los buscadores
   * las toleran, pero las redes sociales NO — una og:image relativa no se
   * previsualiza en ningún lado.
   */
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Ventex — Gestión especializada para tu negocio",
    /**
     * La plantilla ahorra repetir la marca en cada página. La landing NO la usa
     * (declara `title.absolute`) porque ahí los ~60 caracteres que muestra
     * Google valen más para las palabras clave que para el nombre repetido.
     */
    template: "%s | Ventex",
  },
  description:
    "Ventex se adapta a la operación de tu negocio con herramientas de gestión especializadas en una misma plataforma.",
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
  // Sin `themeColor` a propósito (A21): con las dos variantes por
  // `prefers-color-scheme`, la barra del sistema seguía al SO aunque la persona
  // hubiera elegido el otro tema en Ventex. El <meta name="theme-color"> lo
  // crea el script `theme-init` de abajo con el color del tema REAL, y
  // `toggleTheme` (components/ThemeProvider.tsx) lo actualiza al cambiarlo.
};

/**
 * Tema inicial, antes del primer pintado:
 * 1. la preferencia guardada (`localStorage.theme`), si es válida;
 * 2. si no hay, la del sistema (`prefers-color-scheme`) — antes forzaba oscuro;
 * 3. sin `matchMedia`, oscuro (el default histórico).
 *
 * El color de la barra se LEE de `--background` ya resuelto: el script corre
 * después de que cargó globals.css (un script inline espera a las hojas de
 * estilo anteriores), así que el hex vive en un solo lugar.
 */
const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var s=null;try{s=localStorage.getItem('theme');}catch(e){}var t=(s==='light'||s==='dark')?s:((window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark');d.setAttribute('data-theme',t);d.classList.toggle('dark',t==='dark');var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',getComputedStyle(d).getPropertyValue('--background').trim()||(t==='dark'?'#17171c':'#fafafa'));}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
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
            __html: THEME_INIT_SCRIPT,
          }}
        />
        <ThemeProvider>
          {children}
          <PWAProvider />
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

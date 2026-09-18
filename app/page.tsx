import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { LogoHorizontal } from "@/components/Logo";
import {
  IconShoppingCart,
  IconBox,
  IconUsers,
  IconCar,
} from "@/app/assets/icons/DashboardIcons";
import styles from "./page.module.css";
import { PricingSection } from "@/components/PricingSection";
import { WhatsappFab } from "@/components/WhatsappFab";
import { RotatingBusinessWord } from "@/components/RotatingBusinessWord";
import { HeroVideo } from "@/components/HeroVideo";
import { ThemedShot } from "@/components/ThemedShot";
import { LandingHeader } from "@/components/LandingHeader";
import { fetchPublicPlans, fetchPublicPlanPeriods } from "@/services/plans.server";
import { REGISTRABLE_BUSINESS_TYPES, type BusinessType } from "@/config/business";
import { absoluteUrl } from "@/lib/site";
import { LandingJsonLd } from "@/components/LandingJsonLd";

/**
 * El título va con la palabra clave ADELANTE y la marca al final, y usa
 * `absolute` para saltarse la plantilla del layout.
 *
 * El anterior —"Ventex — El sistema operativo para tu negocio"— no contenía
 * ninguna de las consultas por las que alguien busca esto: ni "POS", ni "punto
 * de venta", ni "facturación". Un título de marca solo posiciona para la marca,
 * y quien ya busca "Ventex" no es a quien hay que capturar.
 *
 * Los ~60 caracteres que muestra Google son el espacio más caro del sitio: la
 * marca va al final porque si se corta, se corta lo que el usuario ya conoce y
 * no la palabra por la que llegó.
 */
export const metadata: Metadata = {
  title: {
    absolute: "Sistema POS y punto de venta para tu negocio | Ventex",
  },
  description:
    "Software POS con punto de venta, inventario, facturación y finanzas en una sola plataforma. Controla ventas y stock en tiempo real. Empieza gratis.",
  // Canónica explícita: la landing es alcanzable con parámetros de campaña
  // (?utm_...), y sin esto cada variante compite consigo misma.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    // `locale` y `siteName` se repiten aunque estén en el layout: Next NO
    // fusiona el bloque openGraph, lo REEMPLAZA en cuanto la página declara el
    // suyo. Verificado en el HTML servido — sin esto se perdían las dos.
    locale: "es_CO",
    siteName: "Ventex",
    url: absoluteUrl("/"),
    title: "Sistema POS y punto de venta para tu negocio",
    description:
      "Punto de venta, inventario, facturación y finanzas en una sola plataforma. Empieza gratis, sin tarjeta.",
    images: [
      {
        url: "/landing/og.jpg",
        width: 1200,
        height: 630,
        alt: "Ventex — sistema POS para tiendas, salones y servicios",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sistema POS y punto de venta para tu negocio",
    description:
      "Punto de venta, inventario, facturación y finanzas en una sola plataforma.",
    images: ["/landing/og.jpg"],
  },
};

const BUSINESS_TYPES = ["Tiendas", "Salones", "Lava-autos", "Servicios", "Proveedoras"];

const SUCCESS_STORIES = [
  {
    image: "/landing/fotos/avatar-mariana.webp",
    name: "Mariana C.",
    business: "Tienda de productos",
    quote: "Ahora encuentro todo en un solo lugar y puedo cerrar el día con mucha más tranquilidad.",
    result: "Más control del inventario",
    tone: "bg-primary/15 text-primary",
  },
  {
    image: "/landing/fotos/avatar-diego.webp",
    name: "Diego R.",
    business: "Barbería independiente",
    quote: "Registrar una venta es rápido y el equipo sabe exactamente qué se vendió y qué queda.",
    result: "Ventas y stock conectados",
    tone: "bg-[#0fdff3]/15 text-[#0fdff3]",
  },
  {
    image: "/landing/fotos/avatar-valentina.webp",
    name: "Valentina C.",
    business: "Servicios profesionales",
    quote: "Por fin puedo entender mis ingresos sin depender de varias hojas de cálculo.",
    result: "Finanzas más claras",
    tone: "bg-[#10b981]/15 text-[#10b981]",
  },
];

/* ---------------- Marco de ventana ---------------- */

function MockFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container rounded-3xl border border-outline-variant/15 shadow-2xl overflow-hidden text-on-surface">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant/10 bg-surface-container-low">
        <span className="w-3 h-3 rounded-full bg-error/60" />
        <span className="w-3 h-3 rounded-full bg-[#f59e0b]/60" />
        <span className="w-3 h-3 rounded-full bg-[#10b981]/60" />
        <span className="ml-3 text-xs font-medium text-on-surface-variant">{label}</span>
      </div>
      {children}
    </div>
  );
}

/* ---------------- Mocks por sección ---------------- */

function PosMock() {
  return (
    <MockFrame label="Ventex · Punto de Venta">
      <ThemedShot
        dark="/landing/pos.png"
        light="/landing/pos-light.png"
        alt="Punto de venta de Ventex con catálogo y factura"
        sizes="(max-width: 1024px) 92vw, 560px"
      />
    </MockFrame>
  );
}

function InventoryMock() {
  return (
    <MockFrame label="Ventex · Inventario">
      <ThemedShot
        dark="/landing/catalogo.png"
        light="/landing/catalogo-light.png"
        alt="Catálogo de Ventex con productos, servicios y stock"
        sizes="(max-width: 1024px) 92vw, 560px"
      />
    </MockFrame>
  );
}

function FinanceMock() {
  return (
    <MockFrame label="Ventex · Finanzas">
      <ThemedShot
        dark="/landing/dashboard.png"
        light="/landing/dashboard-light.png"
        alt="Resumen financiero de Ventex con ingresos y beneficio neto"
        sizes="(max-width: 1024px) 92vw, 560px"
      />
    </MockFrame>
  );
}

/* ---------------- Página ---------------- */

const FEATURES = [
  {
    tag: "Punto de Venta",
    title: "Cobra en segundos, sin fricción",
    desc: "Arma el carrito, aplica impuestos y descuentos, y registra la venta. El stock se descuenta solo en una operación atómica.",
    accentText: "text-accent-pos",
    accentChip: "bg-accent-pos/15 text-accent-pos",
    bullets: ["Cliente exento → IVA 0% automático", "Efectivo, tarjeta o transferencia"],
    mock: <PosMock />,
    flip: false,
  },
  {
    tag: "Inventario",
    title: "Tu stock siempre al día",
    desc: "Productos, categorías y niveles de stock con alertas de bajo inventario. Cada venta actualiza las existencias al instante.",
    accentText: "text-accent-inv",
    accentChip: "bg-accent-inv/15 text-accent-inv",
    bullets: ["Alertas de stock bajo", "Categorías y SKUs"],
    mock: <InventoryMock />,
    flip: true,
  },
  {
    tag: "Finanzas",
    title: "Ingresos y gastos, claros",
    desc: "KPIs reales, ingresos contra gastos y beneficio neto, con gráficas que se entienden de un vistazo.",
    accentText: "text-accent-fin",
    accentChip: "bg-accent-fin/15 text-accent-fin",
    bullets: ["Beneficio neto en tiempo real", "Gastos por categoría"],
    mock: <FinanceMock />,
    flip: false,
  },
];


/**
 * Verticales con foto del negocio de verdad, no un mockup flotando.
 *
 * Los bullets salen de los módulos que cada tipo realmente habilita en
 * `config/business.ts` — no de adjetivos. "Historial por placa" es una pantalla
 * que existe; "solución integral" no significa nada.
 *
 * `foto` admite null: una tarjeta sin foto renderiza el icono del vertical en
 * vez de rellenar con una imagen genérica que no muestre ese negocio. Hoy las
 * cuatro tienen foto propia.
 */
const VERTICALES: Array<{
  id: BusinessType;
  label: string;
  foto: string | null;
  alt: string;
  bullets: string[];
}> = [
  {
    id: "tienda",
    label: "Tiendas",
    foto: "/landing/fotos/pago-con-datafono.webp",
    alt: "Cajero cobrando con datáfono en el mostrador de una tienda",
    bullets: ["Inventario y categorías", "Compras y distribuidores", "Pedidos por encargo"],
  },
  {
    id: "salon",
    label: "Salones y barberías",
    foto: "/landing/fotos/barberia-tablet.webp",
    alt: "Barbero revisando su agenda en una tablet dentro de la barbería",
    bullets: ["Citas y agenda", "Comisiones por barbero", "Promoción de cortes"],
  },
  {
    id: "lavaautos",
    label: "Lava-autos",
    foto: "/landing/fotos/lavaautos.webp",
    alt: "Operario lavando un auto a presión en una estación de lavado",
    bullets: ["Turnos de lavado", "Historial por placa", "Insumos y detailing"],
  },
  {
    id: "servicios",
    label: "Servicios profesionales",
    // Foto propia y no la de la oficina: esa última se usa recortada como
    // avatar en los testimonios, y repetir la misma cara en dos secciones
    // delata el banco de imágenes.
    foto: "/landing/fotos/servicios-profesional.webp",
    alt: "Profesional de servicios sonriendo en su oficina",
    bullets: ["Agenda de consultas", "Catálogo de honorarios", "Clientes y seguimiento"],
  },
];

/**
 * Los precios salen de la tabla `plans`: revalidamos cada 5 minutos para que un
 * cambio en /admin/plans se publique sin redeploy, sin volver dinámica la
 * página.
 */
export const revalidate = 300;

export default async function LandingPage() {
  const [plans, periods] = await Promise.all([
    fetchPublicPlans(),
    fetchPublicPlanPeriods(),
  ]);

  return (
    <div className="min-h-screen bg-background text-on-background font-sans">
      <LandingJsonLd plans={plans} />
      <div className={styles.progress} aria-hidden />

      {/* Nav: transparente sobre el hero, sólido al scrollear. */}
      <LandingHeader />

      {/* Hero a sangre: el mostrador de verdad ocupa todo el fondo y encima va
          la promesa y el panel. El cuadro se ve ENTERO — el detalle de cómo se
          sostiene el contraste sin taparlo está en el <style> de abajo. */}
      <section className="hero-full relative flex items-center overflow-hidden">
        {/* El hero es OSCURO SIEMPRE, en los dos temas. No es una excepción
            caprichosa: el fondo acá no es un token, es un video de un local, y
            un video no se "aclara" cuando el usuario pide tema claro. Fijarlo
            evita el caso imposible — texto oscuro sobre una escena de bar en
            penumbra — y deja el cuadro entero visible.

            Cómo se sostiene el contraste sin tapar el video: medido sobre el
            póster, el pixel más claro de la banda del titular llega a luminancia
            0.67, y un velo que dejara pasar el texto claro exigiría alfa 0.82,
            o sea apenas 18% de video. Bajando el BRILLO del video al 45%, ese
            mismo pixel cae a 0.1175, por debajo del límite de 0.1317, y el texto
            pasa sin velo. Queda un 10% de margen. Se ve el video completo, solo
            que como una escena más oscura, no como una foto tapada por niebla.

            `.hero-ink` redeclara los tokens con sus valores oscuros y se pone
            SOLO en los elementos de TEXTO (pastilla, titular, copy, microcopy),
            no en la columna entera. Esa distinción importa: todo lo que tiene
            superficie propia —los botones, el panel, los badges laterales—
            queda fuera y sigue el tema, porque se lee sobre su propio fondo y
            no sobre el video. */}
        <style href="hero-media" precedence="default">{`
/* Alto del hero en iOS. La unidad svh es el viewport CHICO (con la barra de
   Safari visible): cuando la barra se esconde al scrollear, el área visible
   crece al viewport GRANDE y un hero de 100svh deja de llegar abajo — ahí
   aparece la franja de la sección siguiente, que se lee como "espacio en
   blanco". Con lvh el hero mide siempre lo del viewport grande, así que cubre
   en todos los estados de la barra; el contenido va centrado, de modo que el
   recorte de arriba/abajo cuando la barra está visible no se nota. svh queda
   de base por si el navegador no soporta lvh.
   (Recordatorio: este bloque es un template literal — acá adentro NO van
   backticks, cierran el string y rompen el archivo.) */
.hero-full{min-height:100svh}
@supports (height:100lvh){.hero-full{min-height:100lvh}}
/* Mismo patrón que el hero para texto sobre foto, con OTROS números porque la
   foto es distinta: medido, el pixel más claro del mostrador llega a 0.85 (vs
   0.67 del hero), y un velo plano que dejara pasar el texto pediría 0.86 — la
   foto desaparecería. Con el brillo al 50% ese pixel cae a 0.16 y el mínimo
   calculado baja a 0.19. Se usa 0.45 y no ese mínimo: el cálculo cubre el peor
   pixel, pero el subtítulo es texto CHICO sobre una foto con mucho detalle, y
   ahí lo que pesa no es solo el contraste sino el ruido de fondo. A 0.45 queda
   en 5.7:1 y todavía se ve más de la mitad de la imagen. */
.cta-media{filter:brightness(.5)}
.cta-scrim{background:rgb(11 14 25 / .45)}
.hero-media{filter:brightness(.45)}
.hero-scrim{background:rgb(11 14 25 / .10)}
/* El cierre de abajo va al MISMO oscuro fijo, no al token de fondo. Cuando
   seguía el tema, en modo claro aparecía un velo BLANCO subiendo por encima del
   video: el hero es un bloque oscuro y su borde inferior tiene que serlo
   también. Así en oscuro funde sin costura y en claro el hero termina con un
   canto limpio contra la sección siguiente.
   (Ojo: acá adentro no van backticks — esto vive en un template literal.) */
.hero-fade{background-image:linear-gradient(to top, rgb(11 14 25) 0%, rgb(11 14 25 / 0) 18%)}
.hero-ink{
  --background:#0b0e19;
  --on-surface:#e1e4ff;
  --on-surface-variant:#a5aac7;
  --surface-container:#14192a;
  --surface-container-high:#1a1f32;
  --outline-variant:#414760;
  --primary:#6063ee;
  --on-primary:#ffffff;
  --accent-fin:#34d399;
  color:var(--on-surface);
}
        `}</style>
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="hero-media h-full w-full">
            <HeroVideo
              src="/landing/hero.mp4"
              poster="/landing/hero-poster.webp"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="hero-scrim absolute inset-0" />
          <div className="hero-fade absolute inset-0" />
        </div>

        <div className="relative w-full max-w-6xl mx-auto px-6 pt-28 pb-20 lg:pt-32 lg:pb-24">
        {/* Un solo foco. El panel del producto vivía acá y se sacó a
            propósito: a ~400px sobre un video oscuro era un rectángulo
            ilegible que tapaba justo las manos sobre el POS —lo mejor de la
            toma— y le peleaba el ojo al titular. El producto ya se muestra
            grande y legible tres veces más abajo, en las filas de features, que
            es donde se puede leer. Un hero con dos focos no tiene ninguno. */}
        <div className="max-w-3xl text-center lg:text-left">
          <div>
            {/* Todo el copy del hero va en `text-on-surface`, NO en
                `on-surface-variant`. No es gusto: sobre el video, el tono MEDIO
                exige un velo de 0.58 en oscuro y 0.48 en claro para llegar a
                4.5:1 — o sea tapar más de la mitad del cuadro. Con el tono
                fuerte el mínimo baja a 0.00 y 0.21, y el video se ve entero. */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-outline-variant/20 bg-surface-container/60 text-xs font-semibold text-on-surface mb-9 hero-ink">
              <span className="w-2 h-2 rounded-full bg-accent-fin" /> POS + Inventario + Finanzas en uno
            </div>
            <h1 className="hero-ink text-4xl sm:text-6xl lg:text-[4.5rem] font-black tracking-tight text-on-surface leading-[1.08]">
              {/* El espacio explícito NO es decorativo: los <span> en block
                  no aportan separación al textContent, así que el rastreador y
                  el lector de pantalla leían "operativopara tuempresa". El
                  salto visual lo da el `block`; esto solo arregla el texto. */}
              <span className="block">El sistema operativo</span>{" "}
              {/* "para tu" y la palabra rotativa van en renglones SEPARADOS a
                  propósito. Siempre caen así igual —"para tu emprendimiento" no
                  entra en la columna a ningún tamaño—, pero declararlo explícito
                  permite darle margen propio al de abajo.
                  Ese margen es una corrección PERCEPTUAL, no geométrica: medido,
                  el hueco ya era el mismo que entre los otros renglones, pero la
                  pastilla es un bloque de color sólido y pesa más que unas letras
                  con aire alrededor, así que se leía apretada. El 0.5em salió de
                  probarlo en pantalla, no de la cuenta. */}
              <span className="block w-fit mx-auto text-start lg:mx-0">para tu</span>{" "}
              <span className="mt-[0.5em] block text-center lg:text-start">
                <RotatingBusinessWord />
              </span>
            </h1>
            {/* mt-10 y no mt-8: medido con la tinta real de las letras (no con
                las cajas de línea, que incluyen ascendentes y descendentes y
                dan negativo), la pastilla tenía 33.8px de aire arriba y 25.7px
                abajo — quedaba descentrada por 8px y se leía pegada al copy.
                40px iguala los dos lados. */}
            <p className="hero-ink mt-10 text-lg sm:text-xl leading-relaxed text-on-surface max-w-xl mx-auto lg:mx-0">
              Vende, controla tu inventario y entiende tus finanzas desde un solo lugar. Sin hojas de cálculo, sin caos.
            </p>
            <div className="mt-11 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                href="/register"
                className="px-8 py-4 rounded-2xl bg-primary text-on-primary font-bold shadow-lg shadow-primary/25 hover:bg-primary-dim transition-colors"
              >
                Empieza gratis →
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 rounded-2xl bg-surface-container border border-outline-variant/20 text-on-surface font-bold hover:bg-surface-container-high transition-colors"
              >
                Ya tengo cuenta
              </Link>
            </div>
            <p className="hero-ink mt-6 text-xs text-on-surface">Sin tarjeta de crédito · Listo en minutos</p>
          </div>

        </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-outline-variant/10 bg-surface-container-low/40">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Hecho para</span>
          {BUSINESS_TYPES.map((b) => (
            <span key={b} className="text-sm font-bold text-on-surface-variant">{b}</span>
          ))}
        </div>
      </section>

      {/* Features: filas alternadas con mock de cada sección */}
      <section id="producto" className="max-w-6xl mx-auto px-6 py-24 space-y-24">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-bold text-accent-pos mb-3">TODO EN UNO</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-on-surface">
            Punto de venta, inventario y finanzas en una sola plataforma
          </h2>
          <p className="mt-4 text-on-surface-variant">
            Cada módulo está conectado: una venta mueve el inventario y aparece en tus finanzas. Sin integraciones manuales.
          </p>
        </div>

        {FEATURES.map((f) => (
          <div key={f.tag} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className={`${f.flip ? styles.revealRight + " lg:order-last" : styles.revealLeft}`}>
              {f.mock}
            </div>
            <div className={f.flip ? styles.revealLeft : styles.revealRight}>
              <p className={`text-xs font-bold uppercase tracking-wider ${f.accentText}`}>{f.tag}</p>
              <h3 className="text-2xl sm:text-3xl font-black text-on-surface mt-2 leading-tight">{f.title}</h3>
              <p className="text-on-surface-variant mt-4 leading-relaxed">{f.desc}</p>
              <ul className="mt-5 space-y-2.5">
                {f.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-3 text-sm text-on-surface">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black ${f.accentChip}`}>
                      ✓
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </section>


      {/* Verticales: el producto adentro del negocio */}
      <section className="max-w-6xl mx-auto px-6 pb-24" aria-labelledby="verticales-title">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-bold text-accent-pos mb-3">PARA TU NEGOCIO</p>
          <h2 id="verticales-title" className="text-3xl sm:text-4xl font-black tracking-tight text-on-surface">
            Un sistema POS para cada tipo de negocio
          </h2>
          <p className="mt-4 text-on-surface-variant">
            Ventex se ajusta al tipo de negocio que tengas: cada uno ve sus propios módulos, no un menú lleno de cosas que no usa.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VERTICALES.map((v) => {
            /* La disponibilidad NO se escribe a mano acá: sale de
               `REGISTRABLE_BUSINESS_TYPES`, que es la misma lista que decide qué
               puede elegir alguien en el registro. Si mañana se abre lava-autos,
               el sello desaparece solo — y al revés, nunca queda anunciando un
               rubro que el registro no acepta. */
            const proximamente = !REGISTRABLE_BUSINESS_TYPES.includes(v.id);
            return (
            <article
              key={v.label}
              className="overflow-hidden rounded-3xl border border-outline-variant/15 bg-surface-container"
            >
              <div className="relative aspect-[3/2] w-full bg-surface-container-high">
                {v.foto ? (
                  <Image
                    src={v.foto}
                    alt={v.alt}
                    fill
                    sizes="(max-width: 640px) 86vw, (max-width: 1024px) 45vw, 25vw"
                    className="object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center bg-accent-pos/10 text-accent-pos">
                    <IconCar className="h-10 w-10" />
                  </span>
                )}
                {proximamente && (
                  /* El velo va oscuro fijo y el texto claro fijo, no por token:
                     abajo hay una FOTO, no una superficie del tema, así que el
                     contraste no puede depender de si el sitio está en claro. */
                  <span className="absolute inset-0 flex items-center justify-center bg-[rgb(11_14_25/.62)] backdrop-blur-[2px]">
                    <span className="rounded-full border border-white/25 bg-[rgb(11_14_25/.55)] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#e1e4ff]">
                      Próximamente
                    </span>
                  </span>
                )}
              </div>
              <div className="p-6">
                <h3 className="font-bold text-on-surface">{v.label}</h3>
                <ul className="mt-3 space-y-2">
                  {v.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-on-surface-variant">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-pos" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
            );
          })}
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-outline-variant/10 bg-surface-container-low/40">
        <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { v: "< 1 min", l: "para registrar una venta" },
            { v: "6", l: "módulos integrados" },
            { v: "100%", l: "datos aislados por cuenta" },
            { v: "0", l: "hojas de cálculo" },
          ].map((s) => (
            <div key={s.l} className={styles.scaleIn}>
              <p className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-[#6063ee] to-[#0fdff3] bg-clip-text text-transparent">
                {s.v}
              </p>
              <p className="text-sm text-on-surface-variant mt-2">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-bold text-accent-pos mb-3">EN 3 PASOS</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-on-surface">Listo para vender hoy mismo</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { n: "01", title: "Regístrate gratis", desc: "Crea tu cuenta en menos de un minuto. Sin tarjeta.", icon: IconUsers },
            { n: "02", title: "Configura tu negocio", desc: "Agrega productos, define tu IVA y tu moneda.", icon: IconBox },
            { n: "03", title: "Empieza a vender", desc: "Cobra desde el POS y mira crecer tus números.", icon: IconShoppingCart },
          ].map((s) => (
            <div key={s.n} className={`${styles.revealUp} relative bg-surface-container rounded-3xl border border-outline-variant/10 p-8`}>
              <div className="flex items-center justify-between">
                <span className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <s.icon className="w-5 h-5" />
                </span>
                <span className="text-4xl font-black text-accent-pos/25" aria-hidden>{s.n}</span>
              </div>
              <h3 className="text-lg font-bold text-on-surface mt-4">{s.title}</h3>
              <p className="text-on-surface-variant mt-2">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Precios (catálogo real de la tabla plans) */}
      <PricingSection plans={plans} periods={periods} />

      {/* Casos de éxito: carrusel continuo */}
      <section className="overflow-hidden py-24" aria-labelledby="casos-title">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-sm font-bold text-accent-pos mb-3">CASOS DE ÉXITO</p>
            <h2 id="casos-title" className="text-3xl sm:text-4xl font-black tracking-tight text-on-surface">
              Historias de negocios que avanzan
            </h2>
            <p className="mt-4 text-lg text-on-surface-variant">
              Menos tareas manuales. Más claridad para tomar decisiones todos los días.
            </p>
          </div>

          <div className={`${styles.storyViewport} mt-12 -mx-6 overflow-hidden`}>
            <div className={`${styles.storyTrack} flex w-max gap-5 px-6 py-6 hover:[animation-play-state:paused]`}>
              {[...SUCCESS_STORIES, ...SUCCESS_STORIES].map((story, index) => (
                <article
                  key={`${story.name}-${index}`}
                  className="shrink-0 w-[min(86vw,360px)] rounded-3xl border border-outline-variant/15 bg-surface-container p-7 shadow-xl shadow-black/10"
                >
                  <div className="flex items-start gap-4">
                    {/* `eager` y no diferida: dentro de la pista del carrusel
                        la carga diferida NO se dispara. Chrome decide por la
                        posición de LAYOUT, y la pista es `w-max` con el
                        contenido duplicado, así que las tarjetas quedan fuera
                        del viewport horizontal aunque en pantalla se vean —
                        resultado: avatares en blanco. Son 3 archivos únicos de
                        ~25 KB; diferirlos no ahorraba nada. */}
                    <Image
                      src={story.image}
                      alt=""
                      width={56}
                      height={56}
                      loading="eager"
                      className="h-14 w-14 shrink-0 rounded-full object-cover"
                    />
                    <div className="pt-1">
                      <span className="text-2xl leading-none text-primary" aria-hidden="true">“</span>
                      <p className="mt-1 text-[15px] italic leading-7 text-on-surface-variant">{story.quote}”</p>
                    </div>
                  </div>
                  <div className="mt-7 flex items-end justify-between gap-4 border-t border-outline-variant/10 pt-5">
                    <div>
                      <p className="font-bold text-on-surface">{story.name}</p>
                      <p className="mt-1 text-sm text-on-surface-variant">{story.business}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-accent-pos/10 px-3 py-2 text-xs font-semibold text-accent-pos">
                      {story.result}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Cierre a sangre: la foto cubre el CTA Y el footer, y la banda llega
          hasta el borde inferior de la página. Por eso el fondo vive en este
          contenedor y no dentro de cada sección: si cada una llevara su propia
          copia de la imagen, se vería la costura entre las dos.
          El texto usa `hero-ink` por la misma razón que el hero: debajo hay una
          FOTO, no una superficie del tema, así que el contraste no puede
          depender de si el sitio está en claro. */}
      <div className="relative isolate overflow-hidden">
        <div className="cta-media absolute inset-0 -z-10">
          <Image
            src="/landing/fotos/mostrador-cobrando.webp"
            alt="Comerciante cobrando con tablet y datáfono a una clienta en el mostrador de su local"
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="cta-scrim absolute inset-0 -z-10" />

        <section id="cta" className="hero-ink mx-auto max-w-3xl px-6 pt-28 pb-24 sm:pt-36 sm:pb-28 text-center">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-on-surface leading-tight">
            Empieza a vender con Ventex hoy
          </h2>
          <p className="mt-5 text-lg text-on-surface max-w-lg mx-auto">
            Gratis para empezar. Configura tu negocio en minutos y toma el control de tus ventas.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="px-8 py-4 rounded-2xl bg-primary text-on-primary font-bold shadow-lg shadow-primary/25 hover:bg-primary-dim transition-colors"
            >
              Crear mi cuenta gratis →
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 rounded-2xl bg-surface-container-high border border-outline-variant/25 text-on-surface font-bold hover:bg-surface-container-highest transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        </section>

        {/* El separador va en blanco translúcido y no en `outline-variant`: ese
            token se aclara con el tema y sobre la foto oscura desaparecería. */}
        <footer className="hero-ink border-t border-white/15">
          <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <LogoHorizontal className="w-[96px] h-[26px]" />
            <p className="text-xs text-on-surface">© 2026 Ventex. Todos los derechos reservados.</p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-medium text-on-surface">
              <Link href="/login" className="hover:text-primary transition-colors">Iniciar sesión</Link>
              <Link href="/register" className="hover:text-primary transition-colors">Registro</Link>
              <Link href="/privacidad" className="hover:text-primary transition-colors">Privacidad</Link>
              <Link href="/terminos" className="hover:text-primary transition-colors">Términos</Link>
            </div>
          </div>
        </footer>
      </div>

      {/* Quien mira la landing todavía no tiene cuenta: el mensaje pregunta por
          el producto, no pide soporte de algo que aún no usa. */}
      <WhatsappFab
        message="Hola, estoy viendo la página de Ventex y quiero más información."
        label="Escríbenos"
        pulse
      />
    </div>
  );
}

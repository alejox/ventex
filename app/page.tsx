import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { LogoHorizontal } from "@/components/Logo";
import {
  IconShoppingCart,
  IconBox,
  IconUsers,
} from "@/app/assets/icons/DashboardIcons";
import styles from "./page.module.css";
import { PricingSection } from "@/components/PricingSection";
import { WhatsappFab } from "@/components/WhatsappFab";
import { RotatingBusinessWord } from "@/components/RotatingBusinessWord";
import { fetchPublicPlans, fetchPublicPlanPeriods } from "@/services/plans.server";

export const metadata: Metadata = {
  title: "Ventex — El sistema operativo para tu negocio",
  description:
    "Punto de venta, inventario, finanzas y clientes en una sola plataforma. Empieza a vender en minutos.",
};

const BUSINESS_TYPES = ["Tiendas", "Salones", "Lava-autos", "Servicios", "Proveedoras"];

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

function DashboardMock() {
  return (
    <MockFrame label="Ventex · Panel">
      <Image src="/landing/dashboard.png" alt="Dashboard de Ventex con ventas, ingresos y beneficio neto" width={1440} height={900} className="w-full h-auto" priority />
    </MockFrame>
  );
}

function PosMock() {
  return (
    <MockFrame label="Ventex · Punto de Venta">
      <Image src="/landing/pos.png" alt="Punto de venta de Ventex con catálogo y factura" width={1440} height={900} className="w-full h-auto" />
    </MockFrame>
  );
}

function InventoryMock() {
  return (
    <MockFrame label="Ventex · Inventario">
      <Image src="/landing/catalogo.png" alt="Catálogo de Ventex con productos, servicios y stock" width={1440} height={900} className="w-full h-auto" />
    </MockFrame>
  );
}

function FinanceMock() {
  return (
    <MockFrame label="Ventex · Finanzas">
      <Image src="/landing/dashboard.png" alt="Resumen financiero de Ventex con ingresos y beneficio neto" width={1440} height={900} className="w-full h-auto" />
    </MockFrame>
  );
}

/* ---------------- Página ---------------- */

const FEATURES = [
  {
    tag: "Punto de Venta",
    title: "Cobra en segundos, sin fricción",
    desc: "Arma el carrito, aplica impuestos y descuentos, y registra la venta. El stock se descuenta solo en una operación atómica.",
    accent: "#6063ee",
    bullets: ["Cliente exento → IVA 0% automático", "Efectivo, tarjeta o transferencia"],
    mock: <PosMock />,
    flip: false,
  },
  {
    tag: "Inventario",
    title: "Tu stock siempre al día",
    desc: "Productos, categorías y niveles de stock con alertas de bajo inventario. Cada venta actualiza las existencias al instante.",
    accent: "#0fdff3",
    bullets: ["Alertas de stock bajo", "Categorías y SKUs"],
    mock: <InventoryMock />,
    flip: true,
  },
  {
    tag: "Finanzas",
    title: "Ingresos y gastos, claros",
    desc: "KPIs reales, ingresos contra gastos y beneficio neto, con gráficas que se entienden de un vistazo.",
    accent: "#10b981",
    bullets: ["Beneficio neto en tiempo real", "Gastos por categoría"],
    mock: <FinanceMock />,
    flip: false,
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
      <div className={styles.progress} aria-hidden />

      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/70 border-b border-outline-variant/10">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <LogoHorizontal className="w-[104px] h-[28px]" />
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-on-surface-variant">
            <a href="#producto" className="hover:text-on-surface transition-colors">Producto</a>
            <a href="#como-funciona" className="hover:text-on-surface transition-colors">Cómo funciona</a>
            <a href="#precios" className="hover:text-on-surface transition-colors">Precios</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors">
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-primary text-on-primary px-4 py-2 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dim transition-colors"
            >
              Empieza gratis
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden max-w-6xl mx-auto px-6 pt-20 pb-28 text-center">
        <div
          className={`${styles.glow} pointer-events-none absolute top-1/3 left-1/2 w-[760px] h-[760px] -z-10 rounded-full`}
          style={{ background: "radial-gradient(circle, #6063ee 0%, transparent 60%)" }}
          aria-hidden
        />
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-outline-variant/20 bg-surface-container/60 text-xs font-semibold text-on-surface-variant mb-7">
          <span className="w-2 h-2 rounded-full bg-[#10b981]" /> POS + Inventario + Finanzas en uno
        </div>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-on-surface leading-[1.05] max-w-4xl mx-auto">
          <span className="block">El sistema operativo</span>
          <span className="block w-fit mx-auto text-start">
            para tu{" "}
            <RotatingBusinessWord />
          </span>
        </h1>
        <p className="mt-6 text-lg text-on-surface-variant max-w-xl mx-auto">
          Vende, controla tu inventario y entiende tus finanzas desde un solo lugar. Sin hojas de cálculo, sin caos.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="px-7 py-3.5 rounded-xl bg-primary text-on-primary font-bold shadow-lg shadow-primary/25 hover:bg-primary-dim transition-colors"
          >
            Empieza gratis →
          </Link>
          <Link
            href="/login"
            className="px-7 py-3.5 rounded-xl bg-surface-container border border-outline-variant/20 text-on-surface font-bold hover:bg-surface-container-high transition-colors"
          >
            Ya tengo cuenta
          </Link>
        </div>
        <p className="mt-4 text-xs text-on-surface-variant">Sin tarjeta de crédito · Listo en minutos</p>

        {/* Mock principal con tarjetas flotantes */}
        <div className={`${styles.heroFloat} relative mt-16 max-w-3xl mx-auto`}>
          <DashboardMock />
          <div
            className={`${styles.floatA} hidden sm:flex absolute -left-6 top-24 items-center gap-2 bg-surface-container-high border border-outline-variant/15 rounded-xl px-3 py-2 shadow-xl`}
          >
            <span className="w-7 h-7 rounded-lg bg-[#10b981]/15 text-[#10b981] flex items-center justify-center">
              <IconShoppingCart className="w-4 h-4" />
            </span>
            <div className="text-left">
              <p className="text-[10px] text-on-surface-variant leading-tight">Venta registrada</p>
              <p className="text-xs font-black text-on-surface leading-tight">+$249.99</p>
            </div>
          </div>
          <div
            className={`${styles.floatB} hidden sm:flex absolute -right-6 bottom-16 items-center gap-2 bg-surface-container-high border border-outline-variant/15 rounded-xl px-3 py-2 shadow-xl`}
          >
            <span className="w-7 h-7 rounded-lg bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center">
              <IconBox className="w-4 h-4" />
            </span>
            <div className="text-left">
              <p className="text-[10px] text-on-surface-variant leading-tight">Stock actualizado</p>
              <p className="text-xs font-black text-on-surface leading-tight">14 unidades</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-outline-variant/10 bg-surface-container-low/40">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant/70">Hecho para</span>
          {BUSINESS_TYPES.map((b) => (
            <span key={b} className="text-sm font-bold text-on-surface-variant">{b}</span>
          ))}
        </div>
      </section>

      {/* Features: filas alternadas con mock de cada sección */}
      <section id="producto" className="max-w-6xl mx-auto px-6 py-24 space-y-24">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-bold text-primary mb-3">TODO EN UNO</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-on-surface">
            Una plataforma que crece contigo
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
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: f.accent }}>{f.tag}</p>
              <h3 className="text-2xl sm:text-3xl font-black text-on-surface mt-2 leading-tight">{f.title}</h3>
              <p className="text-on-surface-variant mt-4 leading-relaxed">{f.desc}</p>
              <ul className="mt-5 space-y-2.5">
                {f.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-3 text-sm text-on-surface">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black"
                      style={{ backgroundColor: `${f.accent}26`, color: f.accent }}
                    >
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
          <p className="text-sm font-bold text-primary mb-3">EN 3 PASOS</p>
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
                <span className="text-4xl font-black text-primary/15">{s.n}</span>
              </div>
              <h3 className="text-lg font-bold text-on-surface mt-4">{s.title}</h3>
              <p className="text-on-surface-variant mt-2">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Precios (catálogo real de la tabla plans) */}
      <PricingSection plans={plans} periods={periods} />

      {/* CTA final */}
      <section id="cta" className="max-w-6xl mx-auto px-6 pb-28">
        <div className="relative overflow-hidden rounded-[2rem] border border-outline-variant/15 bg-surface-container px-8 py-16 sm:py-20 text-center">
          <div
            className={`${styles.glow} pointer-events-none absolute top-1/2 left-1/2 w-[520px] h-[520px] rounded-full`}
            style={{ background: "radial-gradient(circle, #0fdff3 0%, transparent 60%)" }}
            aria-hidden
          />
          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-on-surface max-w-2xl mx-auto leading-tight">
              Empieza a vender con Ventex hoy
            </h2>
            <p className="mt-5 text-on-surface-variant max-w-lg mx-auto">
              Gratis para empezar. Configura tu negocio en minutos y toma el control de tus ventas.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="px-8 py-4 rounded-xl bg-primary text-on-primary font-bold shadow-lg shadow-primary/25 hover:bg-primary-dim transition-colors"
              >
                Crear mi cuenta gratis →
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface font-bold hover:bg-surface-container-highest transition-colors"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-outline-variant/10">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <LogoHorizontal className="w-[96px] h-[26px]" />
          <p className="text-xs text-on-surface-variant">© 2026 Ventex. Todos los derechos reservados.</p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-medium text-on-surface-variant">
            <Link href="/login" className="hover:text-on-surface transition-colors">Iniciar sesión</Link>
            <Link href="/register" className="hover:text-on-surface transition-colors">Registro</Link>
            <Link href="/privacidad" className="hover:text-on-surface transition-colors">Privacidad</Link>
            <Link href="/terminos" className="hover:text-on-surface transition-colors">Términos</Link>
          </div>
        </div>
      </footer>

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

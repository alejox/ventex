import Link from "next/link";
import type { Metadata } from "next";
import { LogoHorizontal } from "@/components/Logo";
import {
  IconShoppingCart,
  IconBox,
  IconUsers,
  IconTrendingUp,
  IconCreditCard,
  IconWallet,
} from "@/app/assets/icons/DashboardIcons";
import styles from "./page.module.css";
import { PricingSection } from "@/components/PricingSection";
import { fetchPublicPlans } from "@/services/plans.server";

export const metadata: Metadata = {
  title: "Ventex — El sistema operativo de tu negocio",
  description:
    "Punto de venta, inventario, finanzas y clientes en una sola plataforma. Empieza a vender en minutos.",
};

const BUSINESS_TYPES = ["Tiendas", "Salones", "Lava-autos", "Servicios", "Proveedoras"];

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------------- Gráficas SVG ---------------- */

// Curva suave ascendente (área + línea con degradado)
const AREA_PATH =
  "M0,96 C18,96 35,72 53,72 C71,72 89,84 107,84 C125,84 142,52 160,52 C178,52 195,64 213,64 C231,64 249,34 267,34 C285,34 302,22 320,22";
const DOTS: [number, number][] = [
  [53, 72],
  [107, 84],
  [160, 52],
  [213, 64],
  [267, 34],
  [320, 22],
];

function AreaChart({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 320 140" className="w-full h-auto" role="img" aria-label="Tendencia de ingresos">
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6063ee" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#6063ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[34, 68, 102].map((y) => (
        <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
      ))}
      <path className={styles.chartArea} d={`${AREA_PATH} L320,140 L0,140 Z`} fill={`url(#grad-${id})`} />
      <path
        className={styles.chartLine}
        pathLength={1}
        d={AREA_PATH}
        fill="none"
        stroke="#6063ee"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {DOTS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" fill="#0b0e19" stroke="#0fdff3" strokeWidth="2" />
      ))}
    </svg>
  );
}

// Dona de 3 segmentos (gastos por categoría)
function Donut() {
  const C = 289; // circunferencia (r=46)
  const segs = [
    { pct: 0.58, color: "#6063ee", offset: 0 },
    { pct: 0.27, color: "#0fdff3", offset: -0.58 * C },
    { pct: 0.15, color: "#8b5cf6", offset: -0.85 * C },
  ];
  return (
    <svg viewBox="0 0 120 120" className="w-24 h-24 -rotate-90" role="img" aria-label="Gastos por categoría">
      <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="12" />
      {segs.map((s) => (
        <circle
          key={s.color}
          cx="60"
          cy="60"
          r="46"
          fill="none"
          stroke={s.color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${s.pct * C - 4} ${C}`}
          strokeDashoffset={s.offset}
        />
      ))}
    </svg>
  );
}

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
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Ventas", value: "$24,5k", icon: IconCreditCard, tint: "text-primary bg-primary/10" },
            { label: "Beneficio", value: "+$8,2k", icon: IconTrendingUp, tint: "text-[#10b981] bg-[#10b981]/10" },
            { label: "Stock bajo", value: "3", icon: IconBox, tint: "text-[#8b5cf6] bg-[#8b5cf6]/10" },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl bg-surface-container-lowest border border-outline-variant/10 p-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${k.tint}`}>
                <k.icon className="w-4 h-4" />
              </div>
              <p className="text-[10px] text-on-surface-variant">{k.label}</p>
              <p className="text-sm font-black">{k.value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/10 p-4 text-on-surface-variant">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-on-surface">Ingresos</p>
            <span className="text-[10px]">6 meses</span>
          </div>
          <AreaChart id="dash" />
        </div>
      </div>
    </MockFrame>
  );
}

function PosMock() {
  const items = [
    { n: "Aura Pro Audífonos", p: 249.99 },
    { n: "Funda Laptop 15\"", p: 45.0 },
  ];
  return (
    <MockFrame label="Ventex · Punto de Venta">
      <div className="grid grid-cols-5 gap-0">
        {/* Catálogo */}
        <div className="col-span-3 p-4 grid grid-cols-2 gap-3 border-r border-outline-variant/10">
          {["Aura Pro", "Vanguard", "Echo Pods", "Funda 15\""].map((n, i) => (
            <div key={n} className="rounded-xl bg-surface-container-lowest border border-outline-variant/10 p-3">
              <div className="aspect-square rounded-lg bg-surface-container-high mb-2 flex items-center justify-center text-on-surface-variant/40">
                <IconBox className="w-5 h-5" />
              </div>
              <p className="text-[11px] font-medium truncate">{n}</p>
              <p className="text-xs font-bold text-primary">${[249.99, 199.5, 89, 45][i].toFixed(2)}</p>
            </div>
          ))}
        </div>
        {/* Carrito */}
        <div className="col-span-2 p-4 flex flex-col bg-surface-container-low">
          <p className="text-xs font-bold mb-3">Orden actual</p>
          <div className="space-y-2 flex-1">
            {items.map((it) => (
              <div key={it.n} className="flex justify-between gap-2 text-[11px]">
                <span className="text-on-surface-variant truncate">{it.n}</span>
                <span className="font-bold">${money(it.p)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-outline-variant/10">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-on-surface-variant">Total</span>
              <span className="font-black text-primary">$342.19</span>
            </div>
            <div className="w-full text-center bg-primary text-on-primary text-xs font-bold rounded-lg py-2">Cobrar</div>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

function InventoryMock() {
  const rows = [
    { n: "Aura Pro Audífonos", sku: "AU-1029", p: 249.99, s: 15, badge: "óptimo" },
    { n: "Vanguard Smartwatch", sku: "WC-5531", p: 199.5, s: 8, badge: "óptimo" },
    { n: "Echo Pods", sku: "AU-0020", p: 89.0, s: 3, badge: "bajo" },
    { n: "Funda Laptop 15\"", sku: "AC-1002", p: 45.0, s: 25, badge: "óptimo" },
  ];
  return (
    <MockFrame label="Ventex · Inventario">
      <div className="p-2">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-on-surface-variant">
              <th className="p-2 font-bold">Producto</th>
              <th className="p-2 font-bold">SKU</th>
              <th className="p-2 font-bold text-right">Precio</th>
              <th className="p-2 font-bold text-center">Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku} className="border-t border-outline-variant/5">
                <td className="p-2 font-medium">{r.n}</td>
                <td className="p-2 font-mono text-on-surface-variant">{r.sku}</td>
                <td className="p-2 text-right font-semibold">${money(r.p)}</td>
                <td className="p-2 text-center">
                  <span
                    className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                      r.badge === "bajo"
                        ? "bg-[#f59e0b]/15 text-[#f59e0b]"
                        : "bg-[#10b981]/15 text-[#10b981]"
                    }`}
                  >
                    {r.s}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MockFrame>
  );
}

function FinanceMock() {
  const bars = [62, 78, 50, 90, 70, 96];
  return (
    <MockFrame label="Ventex · Finanzas">
      <div className="p-5 space-y-4 text-on-surface-variant">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/10 p-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
              <IconWallet className="w-4 h-4" />
            </div>
            <p className="text-[10px]">Ingresos</p>
            <p className="text-sm font-black text-on-surface">$24,500</p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/10 p-3">
            <div className="w-8 h-8 rounded-lg bg-[#10b981]/10 text-[#10b981] flex items-center justify-center mb-2">
              <IconTrendingUp className="w-4 h-4" />
            </div>
            <p className="text-[10px]">Beneficio neto</p>
            <p className="text-sm font-black text-on-surface">$8,230</p>
          </div>
        </div>
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/10 p-4 flex items-center gap-4">
          <div className="relative shrink-0">
            <Donut />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-on-surface">3</span>
          </div>
          <div className="flex-1 flex items-end justify-between gap-1.5 h-20">
            {bars.map((h, i) => (
              <div
                key={i}
                className={`${styles.bar} flex-1 rounded-t bg-gradient-to-t from-primary/60 to-primary`}
                style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
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
  const plans = await fetchPublicPlans();

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
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-on-surface leading-[1.05] max-w-3xl mx-auto">
          El sistema operativo<br className="hidden sm:block" /> de tu{" "}
          <span className="bg-gradient-to-r from-[#6063ee] to-[#0fdff3] bg-clip-text text-transparent">negocio</span>
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
      <PricingSection plans={plans} />

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
          <div className="flex gap-6 text-xs font-medium text-on-surface-variant">
            <Link href="/login" className="hover:text-on-surface transition-colors">Iniciar sesión</Link>
            <Link href="/register" className="hover:text-on-surface transition-colors">Registro</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

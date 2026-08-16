"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogoHorizontal, LogoVertical } from "@/components/Logo";
import {
  IconHome,
  IconCreditCard,
  IconBox,
  IconUsers,
  IconCalendar,
  IconSettings,
  IconSearch,
  IconHelpCircle,
  IconMenu,
  IconShoppingCart,
  IconTruck,
  IconScissors,
  IconUserBadge,
  IconCar,
  IconFileText,
  IconRefreshCw,
  IconReceipt,
  IconTag,
  IconWallet,
  IconDollar,
} from "@/app/assets/icons/DashboardIcons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ShellUserMenu } from "@/components/ShellUserMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ExpenseModal } from "@/components/ExpenseModal";
import { useProfile } from "@/components/ProfileProvider";
import { visibleNavItems, workerNavItems, groupNavItems, footerNavItems } from "@/config/business";
import { SidebarNavGroup, useClosedNavGroups } from "@/components/SidebarNavGroup";
import { backdropProps } from "@/components/modal";
import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from "@/lib/sidebar";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { SupportFab, showsSupportFab, SUPPORT_FAB_CLEARANCE } from "@/components/SupportFab";

import { fetchSiteConfig } from "@/services/business-site.service";

type IconType = typeof IconHome;

// Icono de escudo para el acceso al panel super admin (no existe en el set base).
function IconShield({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  );
}

// Mapa id de nav -> icono (la presentación; el modelo lógico vive en config/business.ts).
const NAV_ICONS: Record<string, IconType> = {
  panel: IconHome,
  pos: IconCreditCard,
  sales: IconShoppingCart,
  expenses: IconWallet,
  staff: IconUserBadge,
  commissions: IconDollar,
  // Tijera: el reporte de producción. `services` ya no tiene entrada propia
  // desde que el catálogo unificado la absorbió, así que el icono queda libre.
  haircuts: IconScissors,
  vehicles: IconCar,
  billing: IconFileText,
  inventory: IconBox,
  categories: IconTag,
  services: IconScissors,
  pedidos: IconRefreshCw,
  customers: IconUsers,
  promociones: IconTag,
  distributors: IconTruck,
  purchases: IconReceipt,
  calendar: IconCalendar,
  subscription: IconCreditCard,
};

export function DashboardShell({
  children,
  defaultCollapsed = true,
}: {
  children: React.ReactNode;
  /** Preferencia leída de la cookie en el layout de servidor (ver lib/sidebar.ts). */
  defaultCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  // Arranca con lo que ya pintó el servidor: el primer render del cliente tiene
  // que ser idéntico o React descarta el árbol y el menú "salta".
  const [sidebarCollapsed, setSidebarCollapsed] = useState(defaultCollapsed);

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    const q = globalSearch.trim().toLowerCase();
    if (q.includes("cita") || q.includes("agenda") || q.includes("turno") || q.includes("calendario")) {
      router.push("/dashboard/calendar");
    } else if (q.includes("cliente")) {
      router.push("/dashboard/customers");
    } else if (q.includes("venta") || q.includes("pos") || q.includes("cobrar")) {
      router.push("/dashboard/pos");
    } else {
      // El resto cae en el catálogo, que ahora incluye los servicios: buscar
      // "corte" ya no necesita su propia rama porque llega al mismo lugar.
      router.push("/dashboard/inventory");
    }
  };

  const handleHelpClick = () => {
    const businessName = profile?.businessName?.trim();
    const msg = businessName ? `Hola, soy "${businessName}". Necesito ayuda con la plataforma.` : "Hola, necesito ayuda con Ventex App.";
    // api.whatsapp.com y no wa.me: el acortador rompe los emojis (ver
    // whatsappUrl en config/contact.ts).
    window.open(
      `https://api.whatsapp.com/send?phone=573000000000&text=${encodeURIComponent(msg)}`,
      "_blank",
    );
  };

  const [siteSlug, setSiteSlug] = useState<string | null>(null);

  useEffect(() => {
    fetchSiteConfig()
      .then((cfg) => {
        // Hace falta el slug Y que esté PUBLICADO. `public_site_by_slug`
        // devuelve null para un sitio sin publicar y la página responde 404:
        // un botón que lleva a un 404 es peor que no tener botón.
        if (cfg.site?.slug && cfg.site.published) setSiteSlug(cfg.site.slug);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.cookie = `${SIDEBAR_COOKIE}=${sidebarCollapsed}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
  }, [sidebarCollapsed]);

  const isWorker = profile?.isWorker ?? false;

  // Para workers, la navegación se filtra por sus permisos granulares.
  const workerPerms = profile?.workerPermissions ?? {};

  const navigation = isWorker
    ? workerNavItems(workerPerms)
    : visibleNavItems(profile?.businessType ?? null, profile?.modules ?? null);
  // Agrupar es solo presentación: `navigation` ya trae únicamente lo que esta
  // persona puede ver, y `groupNavItems` no agrega ni quita nada.
  const navGroups = useMemo(() => groupNavItems(navigation), [navigation]);
  const { cerrados, toggle: toggleNavGroup } = useClosedNavGroups();
  // Mi Plan baja al pie, con Configuración: los dos son "cosas de mi cuenta",
  // no herramientas del día. Salen de la MISMA lista ya filtrada por rol.
  const footerNav = useMemo(() => footerNavItems(navigation), [navigation]);

  /**
   * Qué ítem se pinta como activo: el de la ruta MÁS ESPECÍFICA que coincide.
   *
   * Con `startsWith` a secas, estando en /dashboard/staff/comisiones se
   * encendían dos ítems a la vez —Miembros y Comisiones—, porque el href del
   * primero es prefijo del segundo. Se resuelve una sola vez acá y no dentro
   * del map, que no tiene forma de saber si otro ítem le gana.
   */
  const activeNavId = useMemo(() => {
    let best: { id: string; len: number } | null = null;
    for (const item of navigation) {
      const matches =
        item.href === "/dashboard"
          ? pathname === "/dashboard"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (!best || item.href.length > best.len)) {
        best = { id: item.id, len: item.href.length };
      }
    }
    return best?.id ?? null;
  }, [navigation, pathname]);

  const isSuperAdmin = !isWorker && (profile?.isSuperAdmin ?? false);
  const isReseller = !isWorker && (profile?.isReseller ?? false);
  // Los Ajustes son del dueño; un trabajador solo los ve con permiso explícito.
  const canSeeSettings = !isWorker || Boolean(workerPerms.settings);
  // `footerNav.length` también cuenta: sin esto, un perfil sin acceso a Ajustes
  // ni a paneles administrativos no renderizaría el bloque y Mi Plan se
  // perdería al bajarlo acá. Hoy no pasa (todo dueño ve Ajustes), pero el ítem
  // no puede depender de eso.
  const showAdminLinks = isSuperAdmin || isReseller || canSeeSettings || footerNav.length > 0;
  const userName = profile?.fullName ?? "Admin";
  const userEmail = profile?.email ?? "";

  return (
    <div className="flex h-screen bg-background text-on-background font-sans">
      {/* Sidebar - Desktop */}
      <aside className={`print:hidden hidden lg:flex flex-col border-r border-outline-variant/10 bg-surface-container-lowest transition-all duration-300 ${sidebarCollapsed ? "w-20" : "w-64"}`}>
        <div className="h-20 shrink-0 flex items-center justify-center border-b border-outline-variant/10 px-4">
          {sidebarCollapsed ? (
            <LogoVertical className="w-[30px] h-[30px]" />
          ) : (
            <LogoHorizontal className="w-[110px] h-[30px]" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <nav className="p-4 space-y-1">
            <div className={`flex items-center mb-4 mt-4 ${sidebarCollapsed ? "justify-center" : "px-4"}`}>
              {!sidebarCollapsed && (
                <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] whitespace-nowrap overflow-hidden flex-1">
                  Menú Principal
                </div>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                title={sidebarCollapsed ? "Expandir menú" : "Minimizar menú"}
              >
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  className={`w-4 h-4 transition-transform duration-300 ${sidebarCollapsed ? "rotate-180" : ""}`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-5-7 5-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 19l-5-7 5-7" />
                </svg>
              </button>
            </div>
            {/* Un bloque por clúster. Colapsada la barra el encabezado no cabe,
                así que lo reemplaza una divisoria: sin ninguna de las dos cosas
                quedan trece iconos casi iguales y nada que los agrupe. */}
            {navGroups.map((group, i) => (
              <div key={group.id} className={i > 0 ? "pt-3 mt-3 border-t border-outline-variant/10" : ""}>
                {sidebarCollapsed ? (
                  // Riel de iconos: no hay dónde poner una cabecera ni un
                  // chevron, así que el acordeón no aplica y los ítems vuelven a
                  // ser iconos sueltos separados por la divisoria. Plegar lo que
                  // no se puede desplegar dejaría pantallas inalcanzables.
                  group.items.map((item) => {
                    const Icon = NAV_ICONS[item.id];
                    const isActive = item.id === activeNavId;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        title={item.name}
                        className={`relative flex items-center justify-center py-3 rounded-xl transition-all ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />
                        )}
                        {Icon && <Icon className="w-5 h-5 shrink-0" />}
                      </Link>
                    );
                  })
                ) : (
                  <SidebarNavGroup
                    group={group}
                    activeNavId={activeNavId}
                    closed={cerrados.has(group.id)}
                    onToggle={toggleNavGroup}
                    icons={NAV_ICONS}
                  />
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Accesos de administración. Si un trabajador no tiene ninguno, el
            bloque entero (con su borde) desaparece en vez de quedar vacío. */}
        {showAdminLinks && (
        <div className="shrink-0 p-4 border-t border-outline-variant/10 space-y-1">
          {isSuperAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-3 py-3 rounded-xl transition-all text-sm font-medium text-primary hover:bg-primary/10 overflow-hidden ${
                sidebarCollapsed ? "justify-center px-0" : "px-4"
              }`}
              title={sidebarCollapsed ? "Panel Admin" : undefined}
            >
              <IconShield className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span className="whitespace-nowrap">Panel Admin</span>}
            </Link>
          )}
          {isReseller && (
            <Link
              href="/reseller"
              className={`flex items-center gap-3 py-3 rounded-xl transition-all text-sm font-medium text-primary hover:bg-primary/10 overflow-hidden ${
                sidebarCollapsed ? "justify-center px-0" : "px-4"
              }`}
              title={sidebarCollapsed ? "Panel Revendedor" : undefined}
            >
              <IconUserBadge className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span className="whitespace-nowrap">Panel Revendedor</span>}
            </Link>
          )}
          {footerNav.map((item) => {
            const Icon = NAV_ICONS[item.id];
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={item.id === activeNavId ? "page" : undefined}
                className={`relative flex items-center gap-3 py-3 rounded-xl transition-all text-sm font-medium overflow-hidden ${
                  sidebarCollapsed ? "justify-center px-0" : "px-4"
                } ${
                  item.id === activeNavId
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                }`}
                title={sidebarCollapsed ? item.name : undefined}
              >
                {item.id === activeNavId && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />
                )}
                {Icon && <Icon className="w-5 h-5 shrink-0" />}
                {!sidebarCollapsed && <span className="whitespace-nowrap">{item.name}</span>}
              </Link>
            );
          })}
          {canSeeSettings && (
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-3 py-3 rounded-xl transition-all text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low overflow-hidden ${
                sidebarCollapsed ? "justify-center px-0" : "px-4"
              }`}
              title={sidebarCollapsed ? "Configuración" : undefined}
            >
              <IconSettings className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span className="whitespace-nowrap">Configuración</span>}
            </Link>
          )}
        </div>
        )}

      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="print:hidden h-20 flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-10 border-b border-outline-variant/10 bg-surface-container-lowest sticky top-0 z-20">
          <div className="flex items-center gap-3 sm:gap-4 shrink-0 lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              <IconMenu className="w-6 h-6" />
            </button>
            <LogoVertical className="w-[50px] h-[24px]" />
          </div>

          <form onSubmit={handleGlobalSearch} className="hidden lg:flex items-center gap-4 flex-1 max-w-xl">
            <div className="relative w-full">
              <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Buscar en Ventex..."
                className="w-full bg-surface-container border border-outline-variant/20 rounded-full py-2.5 pl-11 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
              />
            </div>
          </form>

          <div className="flex items-center gap-2 sm:gap-4 md:gap-6 ml-auto min-w-0">
            <WorkspaceSwitcher />
            {/* Solo cuando el sitio existe y está publicado. Antes se mostraba
                siempre y, sin sitio, llevaba a Ajustes: un botón que dice "Ver
                sitio web" y no muestra ningún sitio. Crearlo se ofrece desde
                Configuración, que es donde corresponde. */}
            {siteSlug && (
              <a
                href={`/${siteSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors shrink-0"
                title="Ver mi sitio público de reservas"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>Ver sitio web</span>
              </a>
            )}
            {/* Registrar gasto es global: un gasto no pertenece a ninguna
                pantalla, ocurre cuando ocurre. Estaba solo en el Panel, así que
                había que navegar hasta ahí para anotarlo.
                Solo el dueño: escribir gastos es suyo a nivel RLS. */}
            {!isWorker && (
              <button
                onClick={() => setExpenseOpen(true)}
                className="hidden sm:block shrink-0 text-on-surface-variant hover:text-on-surface transition-colors"
                title="Registrar gasto"
                aria-label="Registrar gasto"
              >
                <IconWallet className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setCalculatorOpen(true)}
              className="hidden md:block shrink-0 text-on-surface-variant hover:text-on-surface transition-colors"
              title="Calculadora"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <line x1="8" y1="6" x2="16" y2="6" />
                <line x1="8" y1="10" x2="8" y2="10.01" />
                <line x1="12" y1="10" x2="12" y2="10.01" />
                <line x1="16" y1="10" x2="16" y2="10.01" />
                <line x1="8" y1="14" x2="8" y2="14.01" />
                <line x1="12" y1="14" x2="12" y2="14.01" />
                <line x1="16" y1="14" x2="16" y2="14.01" />
                <line x1="8" y1="18" x2="16" y2="18" />
              </svg>
            </button>
            <ThemeToggle />
            <NotificationsBell />
            <button
              type="button"
              onClick={handleHelpClick}
              title="Ayuda y Soporte"
              className="hidden sm:block text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <IconHelpCircle className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-outline-variant/20 hidden sm:block"></div>
            <ShellUserMenu name={userName} email={userEmail} showSettings={canSeeSettings} />
          </div>
        </header>

        {/* Page Content */}
        {/* El scroll del dashboard ocurre acá, no en la ventana. Por eso el
            espacio para el botón flotante de soporte se reserva en ESTE
            contenedor: es el que decide dónde termina el contenido. */}
        <main
          className={`flex-1 overflow-auto bg-background p-6 lg:p-10 print:p-0 print:bg-white print:overflow-visible ${
            showsSupportFab(pathname) ? SUPPORT_FAB_CLEARANCE : ""
          }`}
        >
          <InstallPrompt />
          {children}
        </main>
      </div>

      {/* Soporte por WhatsApp, siempre a mano. */}
      <SupportFab />

      {/* Calculator Modal */}
      {expenseOpen && <ExpenseModal onClose={() => setExpenseOpen(false)} />}

      {calculatorOpen && (
        <CalculatorModal onClose={() => setCalculatorOpen(false)} />
      )}

      {/* Mobile Menu (Overlay) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          ></div>
          {/* overflow-y-auto: con muchos módulos el menú no cabía y no se podía desplazar. */}
          <aside className="relative w-64 bg-surface-container-lowest flex flex-col justify-between h-full overflow-y-auto overscroll-contain shadow-2xl">
            <div>
              <div className="h-20 flex items-center px-8 border-b border-outline-variant/10">
                <LogoHorizontal className="w-[100px] h-[28px]" />
              </div>
              <nav className="p-4 space-y-1">
                <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-4 px-4 mt-4">
                  Menú Principal
                </div>
                {/* Mismos clústeres que en escritorio: si el menú del teléfono
                    quedara plano, la agrupación sería una convención que solo
                    existe en una de las dos pantallas. */}
                {navGroups.map((group, i) => (
                  <div key={group.id} className={i > 0 ? "pt-3 mt-3 border-t border-outline-variant/10" : ""}>
                    <SidebarNavGroup
                      group={group}
                      activeNavId={activeNavId}
                      closed={cerrados.has(group.id)}
                      onToggle={toggleNavGroup}
                      onNavigate={() => setMobileMenuOpen(false)}
                      icons={NAV_ICONS}
                    />
                  </div>
                ))}
              </nav>
            </div>
            {showAdminLinks && (
            <div className="p-4 border-t border-outline-variant/10 space-y-1">
              {isSuperAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-primary hover:bg-primary/10"
                >
                  <IconShield className="w-5 h-5" />
                  Panel Admin
                </Link>
              )}
              {isReseller && (
                <Link
                  href="/reseller"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-primary hover:bg-primary/10"
                >
                  <IconUserBadge className="w-5 h-5" />
                  Panel Revendedor
                </Link>
              )}
              {footerNav.map((item) => {
                const Icon = NAV_ICONS[item.id];
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={item.id === activeNavId ? "page" : undefined}
                    className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                      item.id === activeNavId
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                    }`}
                  >
                    {item.id === activeNavId && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />
                    )}
                    {Icon && <Icon className="w-5 h-5" />}
                    {item.name}
                  </Link>
                );
              })}
              {canSeeSettings && (
                <Link
                  href="/dashboard/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                >
                  <IconSettings className="w-5 h-5" />
                  Configuración
                </Link>
              )}
            </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function CalculatorModal({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const [expression, setExpression] = useState("");

  const inputDigit = (d: string) => {
    if (reset) {
      setDisplay(d);
      setReset(false);
    } else {
      setDisplay((s) => (s === "0" ? d : s + d));
    }
  };

  const inputDecimal = () => {
    if (reset) {
      setDisplay("0.");
      setReset(false);
    } else if (!display.includes(".")) {
      setDisplay((s) => s + ".");
    }
  };

  const backspace = () => {
    if (expression) {
      setDisplay("0");
      setPrev(null);
      setOp(null);
      setReset(false);
      setExpression("");
    } else {
      setDisplay((s) => (s.length > 1 ? s.slice(0, -1) : "0"));
    }
  };

  const clear = () => {
    setDisplay("0");
    setPrev(null);
    setOp(null);
    setReset(false);
    setExpression("");
  };

  const displayOp = (operator: string) => {
    switch (operator) {
      case "÷": return "÷";
      case "×": return "×";
      default: return operator;
    }
  };

  const setOperation = (nextOp: string) => {
    const n = parseFloat(display);
    if (prev === null) {
      setPrev(n);
      setExpression(`${n} ${displayOp(nextOp)}`);
    } else if (op) {
      const result = calculate(prev, n, op);
      setDisplay(String(result));
      setPrev(result);
      setExpression(`${result} ${displayOp(nextOp)}`);
    } else {
      setExpression(`${prev} ${displayOp(nextOp)}`);
    }
    setOp(nextOp);
    setReset(true);
  };

  const calculate = (a: number, b: number, operation: string): number => {
    switch (operation) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const evaluate = () => {
    const n = parseFloat(display);
    if (prev !== null && op) {
      const result = calculate(prev, n, op);
      setExpression(`${prev} ${displayOp(op)} ${n} =`);
      setDisplay(String(result));
      setPrev(result);
      setOp(null);
      setReset(true);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Enter" || e.key === "=") { evaluate(); return; }
      if (e.key === "Backspace") { backspace(); return; }
      if (e.key === ".") { inputDecimal(); return; }
      if (e.key === "Delete") { clear(); return; }
      if (/^[0-9]$/.test(e.key)) { inputDigit(e.key); return; }
      if (e.key === "+") { setOperation("+"); return; }
      if (e.key === "-") { setOperation("-"); return; }
      if (e.key === "*") { setOperation("×"); return; }
      if (e.key === "/") { e.preventDefault(); setOperation("÷"); return; }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const btn = (label: string, onClick: () => void, className = "") => (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 rounded-xl text-sm font-bold transition-colors ${className}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" {...backdropProps(onClose)}>
      <div
        className="bg-surface-container rounded-3xl w-full max-w-xs border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
          <h2 className="text-sm font-bold text-on-surface">Calculadora</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-surface-container-lowest rounded-2xl px-4 py-2 text-right min-h-[72px] flex flex-col justify-end">
            {expression && (
              <span className="text-xs text-on-surface-variant/60 tabular-nums mb-1">{expression}</span>
            )}
            <span className="text-3xl font-bold text-on-surface tabular-nums">{display}</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {btn("C", clear, "bg-error-container/20 text-error-dim hover:bg-error-container/30")}
            {btn("⌫", backspace, "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}
            {btn("÷", () => setOperation("÷"), "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}
            {btn("×", () => setOperation("×"), "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}

            {btn("7", () => inputDigit("7"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("8", () => inputDigit("8"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("9", () => inputDigit("9"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("-", () => setOperation("-"), "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}

            {btn("4", () => inputDigit("4"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("5", () => inputDigit("5"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("6", () => inputDigit("6"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("+", () => setOperation("+"), "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}

            {btn("1", () => inputDigit("1"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("2", () => inputDigit("2"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("3", () => inputDigit("3"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("=", evaluate, "bg-primary text-on-primary hover:bg-primary-dim row-span-2")}

            {btn("0", () => inputDigit("0"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container col-span-2")}
            {btn(".", inputDecimal, "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
          </div>
        </div>
      </div>
    </div>
  );
}

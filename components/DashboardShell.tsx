"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogoHorizontal, LogoSymbol } from "@/components/Logo";
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
  IconFlask,
  IconReceipt,
  IconTag,
  IconWallet,
  IconDollar,
  IconClock,
  IconGlobe,
  IconMusic,
  IconThunder,
  IconTrendingUp,
} from "@/app/assets/icons/DashboardIcons";
import { whatsappUrl } from "@/config/contact";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import { ShellUserMenu } from "@/components/ShellUserMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ExpenseModal } from "@/components/ExpenseModal";
import { useProfile } from "@/components/ProfileProvider";
import { visibleNavItems, workerNavItems, groupNavItems, footerNavItems } from "@/config/business";
import { SidebarNavGroup, useOpenNavGroups } from "@/components/SidebarNavGroup";
import { SidebarTooltip } from "@/components/ui/SidebarTooltip";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { hasUnsavedChanges, interceptableLinkClick, LEAVE_WITH_UNSAVED_CHANGES } from "@/lib/unsaved-changes";
import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from "@/lib/sidebar";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { SupportFab, showsSupportFab, SUPPORT_FAB_CLEARANCE } from "@/components/SupportFab";
import { HEADER_ICON_BUTTON } from "@/components/ui/HeaderIconButton";
import { CommandPalette, NAV_KEYWORDS, type PaletteCommand } from "@/components/ui/CommandPalette";

import { useBusinessSiteStore } from "@/stores/business-site.store";
import { useSettingsStore } from "@/stores/settings.store";

type IconType = typeof IconHome;

// Atajo de la paleta según la plataforma, sin desajuste de hidratación: el
// servidor (y el primer render del cliente) dicen "Ctrl K"; en Apple, "⌘K".
const subscribeNever = () => () => {};
const isApplePlatform = () => /Mac|iPhone|iPad/.test(navigator.platform);
const notApple = () => false;

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia(REDUCE_MOTION_QUERY).matches;

/**
 * Botón cuadrado del riel colapsado: mismo tamaño y mismo anillo de foco para
 * los ítems de navegación y los accesos del pie (admin, revendedor, plan,
 * ajustes). El botón de plegar queda aparte —es más chico a propósito— pero
 * comparte el anillo.
 *
 * El foco usa `ring` (box-shadow) y no `outline`: un `outline` sobre una
 * esquina redondeada lo dibuja Safari como un óvalo que no seguía el radio
 * real del botón. El `ring` sí sigue el `border-radius`.
 */
const COLLAPSED_ICON_BUTTON =
  "flex items-center justify-center w-11 h-11 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest";

const COLLAPSED_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest";

/** Fila de "Acciones rápidas" del cajón móvil: mismo alto y aspecto que un ítem del menú. */
const QUICK_ACTION =
  "flex w-full items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink";

function CalculatorIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
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
  );
}

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
  reports: IconTrendingUp,
  // Reloj y no billetera: lo de Créditos todavía NO es plata en la caja.
  credits: IconClock,
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
  // Recetas y producción (opt-in): lotes y costo de cada receta.
  production: IconFlask,
  customers: IconUsers,
  promociones: IconTag,
  distributors: IconTruck,
  purchases: IconReceipt,
  calendar: IconCalendar,
  // Rayo y no tarjeta: la tarjeta ya es el POS, y repetirla en el riel
  // colapsado deja dos botones idénticos.
  subscription: IconThunder,
  landing: IconGlobe,
  // Académico (opt-in): cada pantalla del módulo con ícono propio. La agenda
  // también necesita el suyo: sin entrada, el riel colapsado pinta un botón vacío.
  school: IconMusic,
  "school-agenda": IconCalendar,
  "school-estudiantes": IconUsers,
  "school-planes": IconFileText,
  "school-config": IconSettings,
};

export function DashboardShell({
  children,
  defaultCollapsed = false,
}: {
  children: React.ReactNode;
  /** Preferencia leída de la cookie en el layout de servidor (ver lib/sidebar.ts). */
  defaultCollapsed?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const profile = useProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Arranca con lo que ya pintó el servidor: el primer render del cliente tiene
  // que ser idéntico o React descarta el árbol y el menú "salta".
  const [sidebarCollapsed, setSidebarCollapsed] = useState(defaultCollapsed);
  /**
   * Si el contenido ANCHO (etiquetas, "Menú Principal", los grupos abiertos,
   * el nombre de los accesos del pie) ya se puede pintar.
   *
   * Es un estado aparte de `sidebarCollapsed` a propósito: ese decide el
   * ANCHO real del `<aside>`, que anima 300ms. Pintar las etiquetas apenas
   * cambia `sidebarCollapsed` las mete dentro de una columna que todavía mide
   * 80px, y el texto se ve partido o recortado durante toda la transición.
   * Al expandir se espera a que la transición de `width` termine
   * (`onTransitionEnd` del propio `<aside>`); al colapsar no hace falta
   * esperar nada porque los iconos sueltos entran en cualquier ancho, así que
   * el swap es inmediato. Con `prefers-reduced-motion` tampoco hay nada que
   * esperar: no hay transición que correr.
   */
  const [sidebarExpandedContent, setSidebarExpandedContent] = useState(!defaultCollapsed);

  // ⌘K / Ctrl+K abre (o cierra) la paleta "Ir a…" desde cualquier pantalla.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMobileMenuOpen(false);
        setPaletteOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleHelpClick = () => {
    const businessName = profile?.businessName?.trim();
    const msg = businessName ? `Hola, soy "${businessName}". Necesito ayuda con la plataforma.` : "Hola, necesito ayuda con Ventex App.";
    // whatsappUrl lleva el número de soporte real y usa api.whatsapp.com
    // (wa.me rompe los emojis — ver config/contact.ts).
    window.open(whatsappUrl(msg), "_blank");
  };

  const site = useBusinessSiteStore((state) => state.site);
  const fetchSiteConfig = useBusinessSiteStore((state) => state.fetchConfig);
  const siteSlug = site?.published ? site.slug : null;

  useEffect(() => {
    void fetchSiteConfig();
  }, [fetchSiteConfig]);

  // Settings una sola vez para todo el dashboard: de acá sale la moneda que
  // usa `useFormatMoney()` en cada pantalla. Sin negocio todavía (onboarding)
  // no hay settings que leer.
  const ensureSettings = useSettingsStore((state) => state.ensureSettings);
  const hasBusiness = Boolean(profile?.businessType || profile?.isWorker);
  useEffect(() => {
    if (hasBusiness) void ensureSettings();
  }, [hasBusiness, ensureSettings]);

  useEffect(() => {
    document.cookie = `${SIDEBAR_COOKIE}=${sidebarCollapsed}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const menu = mobileMenuRef.current;
    const trigger = mobileMenuTriggerRef.current;
    const focusable = () => Array.from(menu?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      } else if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [mobileMenuOpen]);

  const isWorker = profile?.isWorker ?? false;

  // Para workers, la navegación se filtra por sus permisos granulares.
  const workerPerms = profile?.workerPermissions ?? {};

  const navigation = isWorker
    // `modules` afina los ítems de la Escuela (opt-in): sin el módulo activo,
    // ni siquiera quien tiene el permiso `school` ve la sección.
    ? workerNavItems(workerPerms, profile?.modules ?? null)
    : visibleNavItems(profile?.businessType ?? null, profile?.modules ?? null);
  // Agrupar es solo presentación: `navigation` ya trae únicamente lo que esta
  // persona puede ver, y `groupNavItems` no agrega ni quita nada.
  const navGroups = useMemo(() => groupNavItems(navigation), [navigation]);
  const { abiertos, toggle: toggleNavGroup } = useOpenNavGroups();
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

  /**
   * Comandos de la paleta "Ir a…": exactamente lo que esta persona ve en el
   * menú (ya filtrado por rol, módulos y permisos), más los accesos del pie.
   * No se recalcula visibilidad acá — `navigation` ya es la fuente de verdad.
   */
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = [];
    for (const group of navGroups) {
      for (const item of group.items) {
        commands.push({ id: item.id, label: item.name, href: item.href, group: group.label, keywords: NAV_KEYWORDS[item.id] });
      }
    }
    for (const item of footerNav) {
      commands.push({ id: item.id, label: item.name, href: item.href, group: "Cuenta", keywords: NAV_KEYWORDS[item.id] });
    }
    if (canSeeSettings) {
      commands.push({ id: "settings", label: "Configuración", href: "/dashboard/settings", group: "Cuenta", keywords: NAV_KEYWORDS.settings });
    }
    if (isSuperAdmin) commands.push({ id: "admin", label: "Panel Admin", href: "/admin", group: "Administración" });
    if (isReseller) commands.push({ id: "reseller", label: "Panel Revendedor", href: "/reseller", group: "Administración" });
    return commands;
  }, [navGroups, footerNav, canSeeSettings, isSuperAdmin, isReseller]);

  /**
   * Acciones rápidas del cajón móvil: cierra el cajón y abre la acción en el
   * cuadro siguiente. Así el cajón le devuelve el foco a su botón ANTES de que
   * el modal lo tome, y al cerrar el modal el foco vuelve a un lugar que existe.
   */
  const apple = useSyncExternalStore(subscribeNever, isApplePlatform, notApple);

  // Aviso de cambios sin guardar al navegar por el menú, el encabezado o la
  // paleta: los formularios se anotan en lib/unsaved-changes.ts y el shell
  // pregunta antes de salir. Va en captura para ganarle al onClick del <Link>.
  const { confirm: confirmLeave, dialog: leaveDialog } = useConfirm();
  const navigateGuarded = (href: string) => {
    if (!hasUnsavedChanges()) {
      router.push(href);
      return;
    }
    void confirmLeave(LEAVE_WITH_UNSAVED_CHANGES).then((leave) => {
      if (leave) router.push(href);
    });
  };
  const guardNavClick = (e: React.MouseEvent) => {
    if (!hasUnsavedChanges()) return;
    const anchor = interceptableLinkClick(e.nativeEvent);
    if (!anchor) return;
    e.preventDefault();
    e.stopPropagation();
    // El cajón móvil se cierra antes de preguntar: su trampa de foco pelearía
    // con la del diálogo de confirmación.
    setMobileMenuOpen(false);
    navigateGuarded(anchor.getAttribute("href") ?? anchor.href);
  };

  const runFromDrawer = (action: () => void) => {
    setMobileMenuOpen(false);
    requestAnimationFrame(action);
  };

  return (
    // h-dvh y no h-screen (A17): en iOS Safari 100vh incluye la barra del
    // navegador y el final del contenido quedaba tapado.
    <div className="flex h-dvh bg-background text-on-background font-sans">
      {/* Sidebar - Desktop */}
      <aside
        onClickCapture={guardNavClick}
        className={`print:hidden hidden lg:flex flex-col overflow-hidden border-r border-divider bg-surface-container-lowest transition-[width] duration-300 motion-reduce:transition-none ${sidebarCollapsed ? "w-20" : "w-60"}`}
        onTransitionEnd={(e) => {
          // Solo el ancho del propio <aside>: los hijos también transicionan
          // (colores al hover, el chevron al rotar) y esos eventos burbujean
          // hasta acá. Filtrar por target y propiedad evita pintar el
          // contenido ancho por una transición que no es la del ancho.
          if (e.target === e.currentTarget && e.propertyName === "width" && !sidebarCollapsed) {
            setSidebarExpandedContent(true);
          }
        }}
      >
        <div className="h-16 lg:h-20 shrink-0 flex items-center justify-center border-b border-divider px-4">
          <Link href="/dashboard" aria-label="Ventex, ir al panel" className="inline-flex items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-ink">
            {sidebarExpandedContent ? (
              <LogoHorizontal className="w-36 h-9" />
            ) : (
              <LogoSymbol className="w-9 h-9" />
            )}
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <nav aria-label="Navegación principal" className="p-3 space-y-1">
            <div className={`flex items-center mb-3 mt-3 ${sidebarExpandedContent ? "px-3" : "justify-center"}`}>
              {sidebarExpandedContent && (
                <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.16em] whitespace-nowrap overflow-hidden flex-1">
                  Menú Principal
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  const collapsing = !sidebarCollapsed;
                  setSidebarCollapsed(collapsing);
                  if (collapsing || prefersReducedMotion()) {
                    // Colapsando: los iconos sueltos entran en cualquier
                    // ancho, no hay nada que esperar. Con reduced motion no
                    // hay animación que esperar tampoco.
                    setSidebarExpandedContent(!collapsing);
                  }
                }}
                aria-label={sidebarCollapsed ? "Expandir menú" : "Minimizar menú"}
                aria-expanded={!sidebarCollapsed}
                className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors ${COLLAPSED_FOCUS_RING}`}
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
              <div
                key={group.id}
                className={
                  // Colapsada, la divisoria es lo unico que agrupa trece iconos
                  // casi iguales. Desplegada, las cabeceras de modulo ya son la
                  // estructura y la linea solo agrega un corte mas al borde.
                  i > 0 ? (sidebarExpandedContent ? "mt-1" : "pt-3 mt-3 border-t border-divider") : ""
                }
              >
                {sidebarExpandedContent ? (
                  <SidebarNavGroup
                    group={group}
                    activeNavId={activeNavId}
                    open={abiertos.has(group.id)}
                    onToggle={toggleNavGroup}
                    icons={NAV_ICONS}
                  />
                ) : (
                  // Riel de iconos: no hay dónde poner una cabecera ni un
                  // chevron, así que el acordeón no aplica y los ítems vuelven a
                  // ser iconos sueltos separados por la divisoria. Plegar lo que
                  // no se puede desplegar dejaría pantallas inalcanzables.
                  group.items.map((item) => {
                    const Icon = NAV_ICONS[item.id];
                    const isActive = item.id === activeNavId;
                    return (
                      <SidebarTooltip key={item.id} label={item.name}>
                        {(trigger) => (
                          <Link
                            {...trigger}
                            href={item.href}
                            aria-current={isActive ? "page" : undefined}
                            aria-label={item.name}
                            // Sin borde de acento: colisionaba con la esquina
                            // redondeada del botón cuadrado y a veces quedaba
                            // recortado. El fondo tintado ya dice "estás acá".
                            className={`mx-auto ${COLLAPSED_ICON_BUTTON} ${
                              isActive
                                ? "bg-primary/15 text-primary-ink"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                            }`}
                          >
                            {Icon && <Icon className="w-5 h-5 shrink-0" />}
                          </Link>
                        )}
                      </SidebarTooltip>
                    );
                  })
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Accesos de administración. Si un trabajador no tiene ninguno, el
            bloque entero (con su borde) desaparece en vez de quedar vacío. */}
        {showAdminLinks && (
        <div className="shrink-0 p-3 border-t border-divider space-y-1">
          {sidebarExpandedContent && (
            <div className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
              Cuenta y administración
            </div>
          )}
          {isSuperAdmin && (
            sidebarExpandedContent ? (
              <Link
                href="/admin"
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium text-primary-ink hover:bg-primary/10"
              >
                <IconShield className="w-5 h-5 shrink-0" />
                <span className="whitespace-nowrap">Panel Admin</span>
              </Link>
            ) : (
              <SidebarTooltip label="Panel Admin">
                {(trigger) => (
                  <Link
                    {...trigger}
                    href="/admin"
                    aria-label="Panel Admin"
                    className={`mx-auto ${COLLAPSED_ICON_BUTTON} text-primary-ink hover:bg-primary/10`}
                  >
                    <IconShield className="w-5 h-5 shrink-0" />
                  </Link>
                )}
              </SidebarTooltip>
            )
          )}
          {isReseller && (
            sidebarExpandedContent ? (
              <Link
                href="/reseller"
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium text-primary-ink hover:bg-primary/10"
              >
                <IconUserBadge className="w-5 h-5 shrink-0" />
                <span className="whitespace-nowrap">Panel Revendedor</span>
              </Link>
            ) : (
              <SidebarTooltip label="Panel Revendedor">
                {(trigger) => (
                  <Link
                    {...trigger}
                    href="/reseller"
                    aria-label="Panel Revendedor"
                    className={`mx-auto ${COLLAPSED_ICON_BUTTON} text-primary-ink hover:bg-primary/10`}
                  >
                    <IconUserBadge className="w-5 h-5 shrink-0" />
                  </Link>
                )}
              </SidebarTooltip>
            )
          )}
          {footerNav.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const isActive = item.id === activeNavId;
            return sidebarExpandedContent ? (
              <Link
                key={item.id}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
                  isActive
                    ? "bg-primary/10 text-primary-ink"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                }`}
              >
                {Icon && <Icon className="w-5 h-5 shrink-0" />}
                <span className="whitespace-nowrap">{item.name}</span>
              </Link>
            ) : (
              <SidebarTooltip key={item.id} label={item.name}>
                {(trigger) => (
                  <Link
                    {...trigger}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={item.name}
                    className={`mx-auto ${COLLAPSED_ICON_BUTTON} ${
                      isActive
                        ? "bg-primary/15 text-primary-ink"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                    }`}
                  >
                    {Icon && <Icon className="w-5 h-5 shrink-0" />}
                  </Link>
                )}
              </SidebarTooltip>
            );
          })}
          {canSeeSettings && (
            sidebarExpandedContent ? (
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
              >
                <IconSettings className="w-5 h-5 shrink-0" />
                <span className="whitespace-nowrap">Configuración</span>
              </Link>
            ) : (
              <SidebarTooltip label="Configuración">
                {(trigger) => (
                  <Link
                    {...trigger}
                    href="/dashboard/settings"
                    aria-label="Configuración"
                    className={`mx-auto ${COLLAPSED_ICON_BUTTON} text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low`}
                  >
                    <IconSettings className="w-5 h-5 shrink-0" />
                  </Link>
                )}
              </SidebarTooltip>
            )
          )}
        </div>
        )}

      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        {/* Más bajo en móvil (A17): 64px + la muesca, en vez de 80px fijos. */}
        <header onClickCapture={guardNavClick} className="print:hidden h-[calc(4rem+env(safe-area-inset-top))] lg:h-20 pt-[env(safe-area-inset-top)] lg:pt-0 flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-10 border-b border-divider bg-surface-container-lowest sticky top-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 lg:hidden">
            <button
              ref={mobileMenuTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
              aria-expanded={mobileMenuOpen}
              aria-controls="dashboard-mobile-menu"
              className={`-ml-2 ${HEADER_ICON_BUTTON}`}
            >
              <IconMenu className="w-6 h-6" aria-hidden="true" />
            </button>
            <Link href="/dashboard" aria-label="Ventex, ir al panel" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink">
              <LogoSymbol className="h-8 w-8" />
            </Link>
          </div>

          {/* No es un buscador: abre la paleta "Ir a…" (A15). Tiene forma de
              campo porque es donde la gente lo busca, pero dice lo que hace. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+K Meta+K"
            className="hidden lg:flex items-center gap-3 flex-1 max-w-xl rounded-full border border-outline-variant bg-surface-container py-2.5 pl-4 pr-3 text-left text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
          >
            <IconSearch className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">Ir a una sección…</span>
            <kbd className="rounded-md border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 font-sans text-[11px] font-semibold text-on-surface-variant">
              {apple ? "⌘K" : "Ctrl K"}
            </kbd>
          </button>

          <div className="flex items-center gap-0.5 sm:gap-2 md:gap-3 ml-auto min-w-0">
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
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 min-h-9 rounded-full bg-primary/10 text-primary-ink text-xs font-semibold hover:bg-primary/20 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
                title="Ver mi sitio público de reservas"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>Ver sitio web</span>
              </a>
            )}
            {/* En tablet el header no tiene el campo: queda este botón. En el
                teléfono la paleta vive en el cajón, en "Acciones rápidas". */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Ir a una sección"
              aria-haspopup="dialog"
              title="Ir a una sección (Ctrl K)"
              className={`hidden sm:inline-flex lg:hidden ${HEADER_ICON_BUTTON}`}
            >
              <IconSearch className="w-5 h-5" aria-hidden="true" />
            </button>
            {/* Registrar gasto es global: un gasto no pertenece a ninguna
                pantalla, ocurre cuando ocurre. Estaba solo en el Panel, así que
                había que navegar hasta ahí para anotarlo.
                Solo el dueño: escribir gastos es suyo a nivel RLS. */}
            {!isWorker && (
              <button
                type="button"
                onClick={() => setExpenseOpen(true)}
                className={`hidden sm:inline-flex ${HEADER_ICON_BUTTON}`}
                title="Registrar gasto"
                aria-label="Registrar gasto"
              >
                <IconWallet className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setCalculatorOpen(true)}
              aria-label="Calculadora"
              className={`hidden md:inline-flex ${HEADER_ICON_BUTTON}`}
              title="Calculadora"
            >
              <CalculatorIcon />
            </button>
            {/* En el teléfono no entra junto al avatar (desbordaba a 375px):
                vive en "Acciones rápidas" del cajón. */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <NotificationsBell />
            <button
              type="button"
              onClick={handleHelpClick}
              title="Ayuda y soporte"
              aria-label="Ayuda y soporte"
              className={`hidden sm:inline-flex ${HEADER_ICON_BUTTON}`}
            >
              <IconHelpCircle className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="w-px h-6 bg-divider hidden sm:block mx-1" aria-hidden="true"></div>
            <ShellUserMenu name={userName} email={userEmail} showSettings={canSeeSettings} />
          </div>
        </header>

        {/* Page Content */}
        {/* El scroll del dashboard ocurre acá, no en la ventana. Por eso el
            espacio para el botón flotante de soporte se reserva en ESTE
            contenedor: es el que decide dónde termina el contenido. */}
        <main
          className={`flex-1 overflow-auto bg-background p-4 sm:p-6 lg:p-10 print:p-0 print:bg-white print:overflow-visible ${
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
        onNavigate={navigateGuarded}
      />

      {leaveDialog}

      {/* Mobile Menu (Overlay) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          ></div>
          {/* overflow-y-auto: con muchos módulos el menú no cabía y no se podía desplazar. */}
          <aside id="dashboard-mobile-menu" onClickCapture={guardNavClick} ref={mobileMenuRef} role="dialog" aria-modal="true" aria-label="Menú de navegación" className="relative w-72 max-w-[calc(100vw-3rem)] bg-surface-container-lowest flex flex-col justify-between h-full overflow-y-auto overscroll-contain shadow-2xl">
            <div>
              <div className="h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center justify-between px-6 border-b border-divider">
                <Link href="/dashboard" aria-label="Ventex, ir al panel" onClick={() => setMobileMenuOpen(false)}>
                  <LogoHorizontal className="w-36 h-9" />
                </Link>
                <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menú" className={`-mr-2 text-xl ${HEADER_ICON_BUTTON}`}>×</button>
              </div>
              {/* Acciones rápidas (A17): en el teléfono el header no tiene lugar
                  para la paleta, el gasto ni la calculadora, y no existían en
                  ninguna otra parte de la pantalla. */}
              <section aria-labelledby="mobile-quick-actions" className="px-4 pt-4">
                <h2 id="mobile-quick-actions" className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.16em] mb-2 px-4">
                  Acciones rápidas
                </h2>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => runFromDrawer(() => setPaletteOpen(true))}
                    className={QUICK_ACTION}
                  >
                    <IconSearch className="w-5 h-5 shrink-0" aria-hidden="true" />
                    Ir a una sección…
                  </button>
                  {!isWorker && (
                    <button
                      type="button"
                      onClick={() => runFromDrawer(() => setExpenseOpen(true))}
                      className={QUICK_ACTION}
                    >
                      <IconWallet className="w-5 h-5 shrink-0" aria-hidden="true" />
                      Registrar gasto
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => runFromDrawer(() => setCalculatorOpen(true))}
                    className={QUICK_ACTION}
                  >
                    <CalculatorIcon />
                    Calculadora
                  </button>
                  <button type="button" onClick={toggleTheme} className={`sm:hidden ${QUICK_ACTION}`}>
                    <span className="w-5 h-5 shrink-0 text-center" aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
                    {theme === "dark" ? "Modo claro" : "Modo oscuro"}
                  </button>
                </div>
              </section>
              <nav aria-label="Navegación principal" className="p-4 space-y-1">
                <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.16em] mb-2 px-4 mt-2">
                  Menú Principal
                </div>
                {/* Mismos clústeres que en escritorio: si el menú del teléfono
                    quedara plano, la agrupación sería una convención que solo
                    existe en una de las dos pantallas. */}
                {navGroups.map((group, i) => (
                  <div key={group.id} className={i > 0 ? "mt-1" : ""}>
                    <SidebarNavGroup
                      group={group}
                      activeNavId={activeNavId}
                      open={abiertos.has(group.id)}
                      onToggle={toggleNavGroup}
                      onNavigate={() => setMobileMenuOpen(false)}
                      icons={NAV_ICONS}
                    />
                  </div>
                ))}
              </nav>
            </div>
            {showAdminLinks && (
            <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-divider space-y-1">
              <div className="px-4 pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                Cuenta y administración
              </div>
              {isSuperAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-primary-ink hover:bg-primary/10"
                >
                  <IconShield className="w-5 h-5" />
                  Panel Admin
                </Link>
              )}
              {isReseller && (
                <Link
                  href="/reseller"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-primary-ink hover:bg-primary/10"
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
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                      item.id === activeNavId
                        ? "bg-primary/10 text-primary-ink"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                    }`}
                  >
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
    <Modal
      open
      onClose={onClose}
      title="Calculadora"
      size="sm"
      className="max-w-xs!"
      bodyClassName="px-4 pb-4"
    >
        <div className="space-y-3">
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
    </Modal>
  );
}

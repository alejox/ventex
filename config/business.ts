/**
 * Fuente ÚNICA de verdad para tipos de negocio, módulos y el gating de UI
 * que de ellos depende. La definición de qué módulos ofrece cada tipo de
 * negocio (registro), qué ítems de navegación necesitan qué módulo (sidebar)
 * y qué acciones rápidas se muestran (dashboard) vive aquí y solo aquí.
 *
 * No contiene JSX/iconos a propósito: el modelo es lógico (ids + labels) y
 * cada capa de presentación mapea los iconos por id. Así este archivo es
 * importable tanto desde Server Components como desde el registro.
 */

export type BusinessType = "salon" | "tienda" | "lavaautos" | "servicios";
export type ModuleId = "ecommerce" | "appointments" | "inventory" | "billing";
export type Modules = Partial<Record<ModuleId, boolean>>;

/** Datos del perfil de cuenta (tabla public.profiles). */
export interface Profile {
  id: string;
  fullName: string;
  email: string;
  businessType: BusinessType | null;
  modules: Modules;
}

/**
 * Tipos de negocio que SIEMPRE obtienen el punto de venta / superficie de
 * ventas físicas, hayan activado o no el módulo de e-commerce.
 */
export const POS_TYPES: BusinessType[] = ["tienda", "lavaautos"];

// ---- Catálogo de tipos de negocio (paso 1 del registro) ----
export interface BusinessOption {
  id: BusinessType;
  label: string;
}

export const BUSINESS_OPTIONS: BusinessOption[] = [
  { id: "salon", label: "Salón de Belleza" },
  { id: "tienda", label: "Tienda General" },
  { id: "lavaautos", label: "Lavaautos" },
  { id: "servicios", label: "Servicios Profesionales" },
];

// ---- Módulos ofrecidos por tipo de negocio (paso 2 del registro) ----
export interface ModuleOption {
  id: ModuleId;
  label: string;
  description: string;
}

export const MODULES_BY_TYPE: Record<BusinessType, ModuleOption[]> = {
  salon: [
    { id: "ecommerce", label: "E-commerce", description: "Vende productos de belleza, maquillaje y accesorios 24/7." },
    { id: "appointments", label: "Citas", description: "Gestiona citas, agendas y disponibilidad de tus estilistas." },
    { id: "inventory", label: "Inventario", description: "Controla stock de productos, shampoos, tintes y más." },
  ],
  tienda: [
    { id: "ecommerce", label: "E-commerce", description: "Vende tus productos online con carrito de compras y pagos seguros." },
    { id: "inventory", label: "Inventario", description: "Gestiona tu stock, categorías y códigos de barras." },
  ],
  lavaautos: [
    { id: "appointments", label: "Servicios / Citas", description: "Agenda servicios de lavado, detailing y mantenimiento." },
    { id: "inventory", label: "Inventario", description: "Controla insumos: jabones, ceras, filtros y más." },
  ],
  servicios: [
    { id: "appointments", label: "Citas / Agenda", description: "Gestiona tu agenda de consultas y reuniones." },
    // TODO(billing): el módulo de facturación aún no tiene página propia en
    // el dashboard (sin nav ni acción rápida). Decidir producto: construir
    // /dashboard/billing o retirar esta opción del registro.
    { id: "billing", label: "Facturación", description: "Genera facturas y cotizaciones para tus clientes." },
  ],
};

// ---- Modelo lógico de navegación (sidebar). Iconos se mapean por id. ----
export interface NavItem {
  id: string;
  name: string;
  href: string;
  /** Módulos que habilitan este ítem. Vacío = siempre visible. */
  modules: ModuleId[];
}

export const NAV_ITEMS: NavItem[] = [
  { id: "panel", name: "Panel", href: "/dashboard", modules: [] },
  { id: "pos", name: "Punto de Venta", href: "/dashboard/pos", modules: ["ecommerce"] },
  { id: "sales", name: "Ventas", href: "/dashboard/sales", modules: ["ecommerce"] },
  { id: "inventory", name: "Inventario", href: "/dashboard/inventory", modules: ["inventory"] },
  { id: "finance", name: "Finanzas", href: "/dashboard/finance", modules: [] },
  { id: "customers", name: "Clientes", href: "/dashboard/customers", modules: [] },
  { id: "distributors", name: "Distribuidores", href: "/dashboard/distributors", modules: ["inventory"] },
  { id: "calendar", name: "Calendario", href: "/dashboard/calendar", modules: ["appointments"] },
];

// ---- Acciones rápidas del dashboard. Iconos se mapean por id. ----
export interface QuickAction {
  id: string;
  title: string;
  href: string;
  /** Módulo que habilita la acción. null = siempre visible. */
  module: ModuleId | null;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: "new-sale", title: "Nueva Venta", href: "/dashboard/pos", module: "ecommerce" },
  { id: "new-product", title: "Añadir Producto", href: "/dashboard/inventory", module: "inventory" },
  { id: "new-customer", title: "Registrar Cliente", href: "/dashboard/customers", module: null },
  { id: "view-finance", title: "Ver Finanzas", href: "/dashboard/finance", module: null },
  { id: "new-appointment", title: "Nueva Cita", href: "/dashboard/calendar", module: "appointments" },
];

/** ¿Está habilitado un módulo para este negocio? Centraliza el caso especial de POS. */
export function isModuleEnabled(
  moduleId: ModuleId,
  businessType: BusinessType | null,
  modules: Modules | null,
): boolean {
  if (moduleId === "ecommerce") {
    return Boolean(modules?.ecommerce) || (businessType != null && POS_TYPES.includes(businessType));
  }
  return Boolean(modules?.[moduleId]);
}

export function visibleNavItems(
  businessType: BusinessType | null,
  modules: Modules | null,
): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      item.modules.length === 0 ||
      item.modules.some((m) => isModuleEnabled(m, businessType, modules)),
  );
}

export function visibleQuickActions(
  businessType: BusinessType | null,
  modules: Modules | null,
): QuickAction[] {
  return QUICK_ACTIONS.filter(
    (a) => a.module == null || isModuleEnabled(a.module, businessType, modules),
  );
}

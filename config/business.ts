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
export type ModuleId =
  | "ecommerce"
  | "website"
  | "appointments"
  | "inventory"
  | "billing"
  | "services"
  | "staff"
  | "vehicles";
export type Modules = Partial<Record<ModuleId, boolean>>;

export type WorkerPermission =
  | "panel"
  | "pos"
  | "calendar"
  | "customers"
  | "sales"
  | "inventory"
  | "inventory_costs"
  | "inventory_edit"
  | "inventory_stock"
  | "services"
  | "vehicles"
  | "billing"
  | "settings";

export type WorkerPermissions = Partial<Record<WorkerPermission, boolean>>;

export const WORKER_PERMISSION_LABELS: Record<WorkerPermission, string> = {
  panel: "Panel (inicio)",
  pos: "Punto de Venta",
  calendar: "Calendario / Citas",
  customers: "Clientes",
  sales: "Ventas",
  inventory: "Inventario",
  inventory_costs: "Ver costos y márgenes",
  inventory_edit: "Crear y editar productos",
  inventory_stock: "Ajustar stock y ver movimientos",
  services: "Servicios",
  vehicles: "Vehículos",
  billing: "Facturación",
  settings: "Configuración del negocio",
};

/**
 * Permisos que afinan a otro en vez de abrir un módulo propio.
 *
 * Ver el catálogo no es lo mismo que ver cuánto costó cada cosa, ni que poder
 * cambiar precios, ni que poder mover el conteo: son cuatro decisiones
 * distintas y el dueño las toma por separado. Es el modelo que usan los POS
 * del mercado (Lightspeed tiene "Show product costs" como permiso aparte,
 * apagado por defecto para cajeros).
 *
 * Un hijo sin su padre no sirve: la UI los deshabilita cuando `inventory`
 * está apagado, y los apaga al apagarlo.
 */
export const WORKER_PERMISSION_PARENT: Partial<Record<WorkerPermission, WorkerPermission>> = {
  inventory_costs: "inventory",
  inventory_edit: "inventory",
  inventory_stock: "inventory",
};

export const WORKER_PERMISSION_HINTS: Partial<Record<WorkerPermission, string>> = {
  inventory_costs: "Precio de compra, margen y valor total del inventario.",
  inventory_edit: "Alta y edición de productos, variantes y categorías.",
  inventory_stock: "Ajustes de stock, historial de movimientos y recepción de compras.",
};

/** Datos del perfil de cuenta (tabla public.profiles). */
export interface Profile {
  id: string;
  fullName: string;
  email: string;
  businessType: BusinessType | null;
  modules: Modules;
  /** Super administrador de la plataforma (acceso al panel /admin). */
  isSuperAdmin: boolean;
  /** Revendedor de la plataforma (acceso al panel /reseller). */
  isReseller: boolean;
  /** Trabajador (empleado con acceso limitado). */
  isWorker: boolean;
  /** ID del perfil del dueño del negocio (solo para workers). */
  workspaceId: string | null;
  /** ID del registro en staff al que está vinculado. */
  staffId: string | null;
  /** Permisos granulares del worker. */
  workerPermissions: WorkerPermissions;
}

// ---- Catálogo de tipos de negocio (paso 1 del registro) ----
export interface BusinessOption {
  id: BusinessType;
  label: string;
}

export const BUSINESS_OPTIONS: BusinessOption[] = [
  { id: "salon", label: "Salón / Barbería" },
  { id: "tienda", label: "Tienda General" },
  { id: "lavaautos", label: "Lavaautos" },
  { id: "servicios", label: "Servicios Profesionales" },
];

/**
 * Tipos de negocio ABIERTOS al registro público hoy. El modelo completo
 * (`BUSINESS_OPTIONS`, tipos, gating) sigue intacto para las cuentas que ya
 * existen y para el panel de reseller/ajustes; esto solo acota lo que puede
 * elegir alguien que se registra ahora. Enfoque actual: modelo de tienda.
 * Ampliar esta lista reabre los demás rubros sin más cambios.
 */
export const REGISTRABLE_BUSINESS_TYPES: BusinessType[] = ["tienda"];

export const REGISTER_BUSINESS_OPTIONS: BusinessOption[] = BUSINESS_OPTIONS.filter(
  (o) => REGISTRABLE_BUSINESS_TYPES.includes(o.id),
);

// ---- Roles/cargos sugeridos para el personal, según el tipo de negocio ----
/** Roles ofrecidos al invitar un trabajador. Se usa para poblar el selector de "Rol / Cargo". */
export const STAFF_ROLES_BY_TYPE: Record<BusinessType, string[]> = {
  salon: ["Barbero", "Estilista", "Peluquero", "Manicurista", "Recepcionista", "Cajero"],
  tienda: ["Vendedor", "Cajero", "Bodeguero", "Encargado de tienda", "Administrador"],
  lavaautos: ["Lavador", "Detailer", "Recepcionista", "Cajero", "Encargado"],
  servicios: ["Profesional", "Consultor", "Asesor", "Recepcionista", "Asistente"],
};

/** Roles genéricos cuando el negocio aún no tiene un tipo definido. */
export const DEFAULT_STAFF_ROLES = ["Vendedor", "Cajero", "Administrador", "Asistente"];

/** Devuelve la lista de roles a mostrar para un tipo de negocio (o los genéricos). */
export function staffRolesForType(businessType: BusinessType | null): string[] {
  return businessType ? STAFF_ROLES_BY_TYPE[businessType] : DEFAULT_STAFF_ROLES;
}

// ---- Módulos ofrecidos por tipo de negocio (paso 2 del registro) ----
export interface ModuleOption {
  id: ModuleId;
  label: string;
  description: string;
  /** Se muestra en el registro pero aún no está disponible (no seleccionable). */
  comingSoon?: boolean;
}

export const MODULES_BY_TYPE: Record<BusinessType, ModuleOption[]> = {
  salon: [
    { id: "appointments", label: "Citas", description: "Gestiona citas, agendas y disponibilidad de tus barberos y estilistas." },
    { id: "services", label: "Servicios", description: "Define tu catálogo de servicios: corte, barba, tinte, con precio y duración." },
    { id: "staff", label: "Personal", description: "Administra tu equipo de barberos y estilistas, con sus comisiones." },
    { id: "inventory", label: "Inventario", description: "Controla stock de productos, pomadas, ceras, shampoos y más." },
    { id: "ecommerce", label: "E-commerce", description: "Vende productos de grooming y belleza online 24/7." },
  ],
  // Inventario NO es un extra opcional de la tienda: es parte del núcleo y ya
  // viene en el menú base (ver BASE_NAV_BY_TYPE.tienda). Los dos extras son
  // E-commerce y Página web, ambos aún en construcción.
  tienda: [
    { id: "ecommerce", label: "E-commerce", description: "Vende tus productos online con carrito de compras y pagos seguros.", comingSoon: true },
    { id: "website", label: "Página web", description: "Tu sitio de presencia: catálogo, información del negocio y contacto.", comingSoon: true },
  ],
  lavaautos: [
    { id: "appointments", label: "Citas", description: "Agenda turnos de lavado, detailing y mantenimiento." },
    { id: "services", label: "Servicios", description: "Tu menú de lavados: básico, premium, encerado y detailing, con precio y duración." },
    { id: "staff", label: "Personal", description: "Administra tus lavadores y detailers, con sus comisiones." },
    { id: "vehicles", label: "Vehículos", description: "Historial por placa: vehículos, sus dueños y todas sus visitas." },
    { id: "inventory", label: "Inventario", description: "Controla insumos: jabones, ceras, filtros y más." },
  ],
  servicios: [
    { id: "appointments", label: "Citas / Agenda", description: "Gestiona tu agenda de consultas y reuniones." },
    { id: "services", label: "Servicios", description: "Tu catálogo de honorarios: consultoría, asesoría, sesiones, con precio y duración." },
    { id: "staff", label: "Personal", description: "Administra a tus profesionales y consultores, con sus comisiones." },
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
  { id: "services", name: "Servicios", href: "/dashboard/services", modules: ["services"] },
  { id: "staff", name: "Personal", href: "/dashboard/staff", modules: ["staff"] },
  { id: "vehicles", name: "Vehículos", href: "/dashboard/vehicles", modules: ["vehicles"] },
  { id: "billing", name: "Facturación", href: "/dashboard/billing", modules: ["billing"] },
  { id: "inventory", name: "Inventario", href: "/dashboard/inventory", modules: ["inventory"] },
  { id: "pedidos", name: "Pedidos", href: "/dashboard/pedidos", modules: ["inventory"] },
  { id: "finance", name: "Finanzas", href: "/dashboard/finance", modules: [] },
  { id: "customers", name: "Clientes", href: "/dashboard/customers", modules: [] },
  { id: "distributors", name: "Proveedores", href: "/dashboard/distributors", modules: ["inventory"] },
  { id: "purchases", name: "Compras", href: "/dashboard/purchases", modules: ["inventory"] },
  { id: "movements", name: "Movimientos", href: "/dashboard/inventory/movements", modules: ["inventory"] },
  { id: "calendar", name: "Calendario", href: "/dashboard/calendar", modules: ["appointments"] },
  { id: "subscription", name: "Mi Plan", href: "/dashboard/subscription", modules: [] },
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
  { id: "new-service", title: "Nuevo Servicio", href: "/dashboard/services", module: "services" },
  { id: "new-staff", title: "Añadir Personal", href: "/dashboard/staff", module: "staff" },
  { id: "new-vehicle", title: "Registrar Vehículo", href: "/dashboard/vehicles", module: "vehicles" },
  { id: "new-invoice", title: "Nueva Factura", href: "/dashboard/billing", module: "billing" },
  { id: "replenish", title: "Nuevo Pedido", href: "/dashboard/pedidos", module: "inventory" },
  { id: "new-purchase", title: "Nueva Compra", href: "/dashboard/purchases", module: "inventory" },
];

// ---- Modelo de visibilidad: el TIPO define un menú base, los MÓDULOS suman ----
// Un ítem se muestra si: (1) es universal, (2) pertenece al menú base del tipo,
// o (3) algún módulo opcional activado lo habilita.

/** Secciones que ve cualquier cuenta, sea cual sea su tipo. */
// POS y Ventas son universales: los 4 rubros pueden cobrar (productos y/o servicios).
const UNIVERSAL_NAV_IDS = ["panel", "pos", "sales", "finance", "customers", "subscription"];

/** Menú base por tipo de negocio (además de las universales). */
const BASE_NAV_BY_TYPE: Record<BusinessType, string[]> = {
  salon: ["calendar", "inventory", "distributors"],
  tienda: ["inventory", "distributors"],
  lavaautos: ["calendar", "inventory", "distributors"],
  servicios: ["calendar"],
};

const UNIVERSAL_QUICK_IDS = ["new-sale", "new-customer", "view-finance"];

const BASE_QUICK_BY_TYPE: Record<BusinessType, string[]> = {
  salon: ["new-appointment", "new-product"],
  tienda: ["new-product"],
  lavaautos: ["new-appointment", "new-product"],
  servicios: ["new-appointment"],
};

/**
 * Tipos de negocio cuyos módulos vienen TODOS activados por defecto (sin opt-in):
 * el dueño ve la suite completa de su rubro sin tener que habilitar nada.
 * Salón / Barbería: Citas, Servicios, Barberos, Inventario y E-commerce.
 */
const FULL_MODULE_TYPES: BusinessType[] = ["salon", "lavaautos", "servicios"];

/** Todos los ids de módulo que ofrece un tipo de negocio. */
export function modulesForType(businessType: BusinessType): ModuleId[] {
  return (MODULES_BY_TYPE[businessType] ?? []).map((m) => m.id);
}

/**
 * Módulos efectivos de una cuenta: para los tipos "full module" se activan
 * todos los del rubro; el resto respeta lo guardado en el perfil (opt-in).
 */
export function effectiveModules(
  businessType: BusinessType | null,
  modules: Modules | null,
): Modules {
  const stored = modules ?? {};
  if (businessType && FULL_MODULE_TYPES.includes(businessType)) {
    const all: Modules = { ...stored };
    for (const id of modulesForType(businessType)) all[id] = true;
    return all;
  }
  return stored;
}

export function visibleNavItems(
  businessType: BusinessType | null,
  modules: Modules | null,
): NavItem[] {
  const base = businessType ? BASE_NAV_BY_TYPE[businessType] ?? [] : [];
  const active = effectiveModules(businessType, modules);
  return NAV_ITEMS.filter(
    (item) =>
      UNIVERSAL_NAV_IDS.includes(item.id) ||
      base.includes(item.id) ||
      item.modules.some((m) => Boolean(active[m])),
  );
}

/**
 * Permisos que no son un ítem del sidebar: `settings` abre la sección de
 * Ajustes (engranaje), no una ruta de NAV_ITEMS. Se excluyen para que la
 * navegación no intente resolverlos como ítem.
 */
const NON_NAV_PERMISSIONS: WorkerPermission[] = ["settings"];

/**
 * Ítems del sidebar para un trabajador, en el orden canónico de NAV_ITEMS.
 * La única fuente de verdad son sus permisos: sin permiso no hay ítem.
 */
export function workerNavItems(permissions: WorkerPermissions): NavItem[] {
  const granted = new Set(
    (Object.keys(permissions) as WorkerPermission[]).filter(
      (k) => permissions[k] && !NON_NAV_PERMISSIONS.includes(k),
    ),
  );
  return NAV_ITEMS.filter((item) => granted.has(item.id as WorkerPermission));
}

export function visibleQuickActions(
  businessType: BusinessType | null,
  modules: Modules | null,
): QuickAction[] {
  const base = businessType ? BASE_QUICK_BY_TYPE[businessType] ?? [] : [];
  const active = effectiveModules(businessType, modules);
  return QUICK_ACTIONS.filter(
    (a) =>
      UNIVERSAL_QUICK_IDS.includes(a.id) ||
      base.includes(a.id) ||
      (a.module != null && Boolean(active[a.module])),
  );
}

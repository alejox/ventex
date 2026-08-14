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
/**
 * `ecommerce` y `website` quedan RESERVADOS, no ofrecidos: se anunciaban como
 * extras pero no existe nada detrás (ni tienda pública, ni carrito, ni
 * catálogo, ni checkout). Siguen en el tipo porque `profiles.modules` de
 * cuentas viejas puede tenerlos guardados; no aparecen en `MODULES_BY_TYPE`
 * ni gatean ninguna pantalla. Al implementarlos, volver a listarlos ahí.
 */
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
  | "catalogo"
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
  catalogo: "Catálogo (productos y servicios)",
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
  inventory_edit: "Alta y edición de productos y categorías.",
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
  /** Estado autoritativo del acceso del trabajador. */
  workerAccessStatus: "pending" | "active" | "suspended" | null;
  /** ID del perfil del dueño del negocio (solo para workers). */
  workspaceId: string | null;
  /** Membresía activa, validada para la sesión JWT actual. */
  membershipId: string | null;
  /** Tipo de vínculo dentro del negocio seleccionado. */
  membershipKind: "owner" | "member" | null;
  /** Nombre del negocio seleccionado. */
  businessName: string | null;
  /** Teléfono de contacto (opcional). */
  phone: string | null;
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
 * Tipos de negocio abiertos al registro público. Los demás rubros siguen
 * disponibles para cuentas existentes y para los paneles administrativos,
 * pero no se ofrecen hasta que su onboarding esté listo.
 */
export const REGISTRABLE_BUSINESS_TYPES: BusinessType[] = ["salon", "tienda"];

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
  ],
  // Inventario NO es un extra opcional de la tienda: es parte del núcleo y ya
  // viene en el menú base (ver BASE_NAV_BY_TYPE.tienda). Los dos extras que se
  // anunciaban acá (E-commerce y Página web) no tienen implementación, así que
  // no se ofrecen: hoy la tienda no tiene módulos opcionales. Las pantallas que
  // consumen esta lista contemplan que venga vacía.
  tienda: [],
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

/**
 * Tipos de negocio cuyos módulos vienen todos activados por defecto. Esto
 * mantiene alineado lo que el usuario ve al registrarse con lo que se persiste
 * en `profiles.modules` desde su primer ingreso.
 */
const FULL_MODULE_TYPES: BusinessType[] = ["salon", "lavaautos", "servicios"];

/** Todos los ids de módulo que ofrece un tipo de negocio. */
export function modulesForType(businessType: BusinessType): ModuleId[] {
  return (MODULES_BY_TYPE[businessType] ?? [])
    .filter((module) => !module.comingSoon)
    .map((module) => module.id);
}

/** Módulos preseleccionados al iniciar o cambiar el tipo de negocio. */
export function defaultModulesForType(businessType: BusinessType | null): Modules {
  if (!businessType || !FULL_MODULE_TYPES.includes(businessType)) return {};

  return Object.fromEntries(
    modulesForType(businessType).map((moduleId) => [moduleId, true]),
  ) as Modules;
}

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
  // POS y Ventas no dependen de ningún módulo: son universales (ver
  // UNIVERSAL_NAV_IDS) porque los 4 rubros cobran.
  { id: "pos", name: "Punto de Venta", href: "/dashboard/pos", modules: [] },
  { id: "calendar", name: "Calendario", href: "/dashboard/calendar", modules: ["appointments"] },
  { id: "customers", name: "Clientes", href: "/dashboard/customers", modules: [] },
  { id: "sales", name: "Ventas", href: "/dashboard/sales", modules: [] },
  { id: "purchases", name: "Compras", href: "/dashboard/purchases", modules: ["inventory"] },
  { id: "distributors", name: "Proveedores", href: "/dashboard/distributors", modules: ["inventory"] },
  { id: "pedidos", name: "Pedidos", href: "/dashboard/pedidos", modules: ["inventory"] },
  // Antes un solo ítem "Catálogo" mezclaba productos y servicios en una
  // pantalla más pobre que las dos de verdad (sin permisos por rol, sin
  // escáner) y que terminaba mandando a /dashboard/inventory de todos modos
  // para editar. Separados: cada uno lleva a su pantalla completa y el nombre
  // dice qué es.
  { id: "inventory", name: "Inventario", href: "/dashboard/inventory", modules: ["inventory"] },
  { id: "categories", name: "Categorías", href: "/dashboard/categories", modules: ["inventory"] },
  { id: "services", name: "Servicios", href: "/dashboard/services", modules: ["services"] },
  { id: "vehicles", name: "Vehículos", href: "/dashboard/vehicles", modules: ["vehicles"] },
  { id: "staff", name: "Personal", href: "/dashboard/staff", modules: ["staff"] },
  { id: "billing", name: "Facturación", href: "/dashboard/billing", modules: ["billing"] },
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
  { id: "new-sale", title: "Nueva Venta", href: "/dashboard/pos", module: null },
  { id: "new-product", title: "Añadir Producto", href: "/dashboard/inventory/product", module: "inventory" },
  { id: "new-customer", title: "Registrar Cliente", href: "/dashboard/customers", module: null },
  { id: "new-appointment", title: "Nueva Cita", href: "/dashboard/calendar", module: "appointments" },
  { id: "new-service", title: "Nuevo Servicio", href: "/dashboard/services", module: "services" },
  { id: "new-staff", title: "Añadir Personal", href: "/dashboard/staff", module: "staff" },
  { id: "new-vehicle", title: "Registrar Vehículo", href: "/dashboard/vehicles", module: "vehicles" },
  { id: "new-invoice", title: "Nueva Factura", href: "/dashboard/billing", module: "billing" },
  { id: "replenish", title: "Nuevo Pedido", href: "/dashboard/pedidos", module: "inventory" },
];

// ---- Modelo de visibilidad: el TIPO define un menú base, los MÓDULOS suman ----
// Un ítem del SIDEBAR se muestra si: (1) es universal, (2) pertenece al menú
// base del tipo, o (3) algún módulo opcional activado lo habilita. Las acciones
// rápidas del panel siguen una regla más estrecha: ver UNIVERSAL_QUICK_IDS.

/** Secciones que ve cualquier cuenta, sea cual sea su tipo. */
// POS y Ventas son universales: los 4 rubros pueden cobrar (productos y/o servicios).
// `staff` es universal desde que Personal absorbió a Trabajadores: todo negocio
// tiene gente, y ahí es donde se crean las cuentas de acceso de los empleados.
// Antes dependía del módulo `staff`, que la tienda no tiene — dejarlo así habría
// dejado sin administración de empleados justo al único rubro con registro
// abierto. El módulo `staff` sigue existiendo para las comisiones por servicio.
const UNIVERSAL_NAV_IDS = ["panel", "pos", "sales", "customers", "staff", "subscription"];

/** Menú base por tipo de negocio (además de las universales). */
// `purchases` acompaña a `distributors`: son el mismo dominio (a quién le
// compro / qué le compré) y la tienda los necesita aunque no tenga el módulo
// `inventory` activado, porque su menú base sale de acá y no de los módulos.
//
// `inventory` en la base de tienda por la misma razón: tienda no tiene
// módulos propios (MODULES_BY_TYPE.tienda = []), así que "Inventario" nunca
// se activaría por el mecanismo de módulos — es núcleo, no opcional. Salón y
// lavaautos NO lo necesitan acá: son FULL_MODULE_TYPES, así que `inventory` y
// `services` ya les quedan `true` en `effectiveModules` y los ítems
// correspondientes de NAV_ITEMS se muestran solos.
//
// `pedidos` cierra ese mismo ciclo: reponer es el otro medio día de una tienda
// (qué falta → a quién se lo pido → qué me llegó). Quedaba afuera por el mismo
// motivo que `inventory` —depende del módulo `inventory`, que tienda no tiene—
// y el rubro terminaba con Compras y Proveedores pero sin la pantalla que los
// alimenta.
const BASE_NAV_BY_TYPE: Record<BusinessType, string[]> = {
  salon: ["calendar"],
  tienda: ["inventory", "categories", "distributors", "purchases", "pedidos"],
  lavaautos: ["calendar"],
  servicios: ["calendar"],
};

// El sidebar y el panel NO siguen la misma regla, a propósito. El menú lista
// todo lo que el negocio puede hacer (universales + base + lo que sumen los
// módulos). El panel es una FILA CURADA: los 2 o 3 atajos que ese rubro usa
// todos los días, y nada más. Por eso las acciones rápidas salen solo de
// universales + base — un rubro "full module" como salón tiene 5 módulos
// activos y dejar que cada uno sumara su acción convertía el panel en un
// segundo menú de 7 tarjetas.
const UNIVERSAL_QUICK_IDS = ["new-sale", "new-customer"];

/**
 * Los atajos propios de cada rubro (además de los universales). Máximo dos:
 * junto a "Nueva Venta" y "Registrar Cliente" el panel queda en cuatro
 * tarjetas, que es una fila. Sumar una quinta obliga a elegir cuál sale.
 */
const BASE_QUICK_BY_TYPE: Record<BusinessType, string[]> = {
  salon: ["new-appointment", "new-service"],
  // Tienda no agenda ni presta servicios: su día es vender y reponer.
  tienda: ["new-product", "replenish"],
  lavaautos: ["new-appointment", "new-vehicle"],
  servicios: ["new-appointment", "new-invoice"],
};

/**
 * Módulos efectivos de una cuenta: para los tipos "full module" se activan
 * todos los del rubro por defecto a menos que estén explícitamente desactivados
 * en el perfil (`modules[id] === false`).
 */
export function effectiveModules(
  businessType: BusinessType | null,
  modules: Modules | null,
): Modules {
  const stored = modules ?? {};
  if (!businessType) return stored;
  const result: Modules = { ...stored };
  if (FULL_MODULE_TYPES.includes(businessType)) {
    for (const id of modulesForType(businessType)) {
      if (result[id] === undefined) {
        result[id] = true;
      }
    }
  }
  return result;
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
  const granted = new Set<string>(
    (Object.keys(permissions) as WorkerPermission[]).filter(
      (k) => permissions[k] && !NON_NAV_PERMISSIONS.includes(k),
    ),
  );
  // `catalogo` sigue siendo un permiso otorgable (acceso amplio a productos Y
  // servicios de una sola vez), pero ya no hay un ítem de nav con ese id —
  // se resuelve a los dos ítems reales que reemplazaron al catálogo unificado.
  if (granted.has("catalogo")) {
    granted.add("inventory");
    granted.add("services");
  }
  if (granted.has("inventory")) {
    granted.add("categories");
  }
  return NAV_ITEMS.filter((item) => granted.has(item.id));
}

/**
 * Permiso que habilita cada acción rápida para un trabajador. Las acciones que
 * no figuran acá son de dueño: no existe permiso que las otorgue (`staff` y
 * `pedidos` no tienen permiso propio, igual que en el sidebar).
 *
 * `new-product` pide `inventory_edit`, no `inventory`: ver el catálogo no es
 * poder dar de alta productos.
 */
const QUICK_ACTION_PERMISSION: Record<string, WorkerPermission> = {
  "new-sale": "pos",
  "new-product": "inventory_edit",
  "new-customer": "customers",
  "new-appointment": "calendar",
  "new-service": "services",
  "new-vehicle": "vehicles",
  "new-invoice": "billing",
};

/**
 * Acciones rápidas para un trabajador. Misma regla que `workerNavItems`: la
 * única fuente de verdad son sus permisos, y `catalogo` se resuelve a los dos
 * permisos de lectura que reemplazó (no otorga edición).
 */
export function workerQuickActions(permissions: WorkerPermissions): QuickAction[] {
  const granted = new Set<WorkerPermission>(
    (Object.keys(permissions) as WorkerPermission[]).filter((k) => permissions[k]),
  );
  if (granted.has("catalogo")) {
    granted.add("inventory");
    granted.add("services");
  }
  return QUICK_ACTIONS.filter((a) => {
    const required = QUICK_ACTION_PERMISSION[a.id];
    return required != null && granted.has(required);
  });
}

/**
 * Acciones rápidas del panel: universales + las del rubro. Un módulo activado
 * ya NO suma su acción (ver el comentario de UNIVERSAL_QUICK_IDS); el módulo
 * solo puede QUITAR: si el dueño apagó explícitamente el que sostiene una
 * acción de su rubro, el atajo se va con la sección.
 */
export function visibleQuickActions(
  businessType: BusinessType | null,
  modules: Modules | null,
): QuickAction[] {
  const base = businessType ? BASE_QUICK_BY_TYPE[businessType] ?? [] : [];
  const active = effectiveModules(businessType, modules);
  return QUICK_ACTIONS.filter((a) => {
    if (UNIVERSAL_QUICK_IDS.includes(a.id)) return true;
    if (!base.includes(a.id)) return false;
    // `!== false` y no `Boolean(...)`: tienda tiene `modules` vacío y su
    // inventario es núcleo, así que "sin definir" significa disponible.
    return a.module == null || active[a.module] !== false;
  });
}

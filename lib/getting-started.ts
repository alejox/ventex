/**
 * "Primeros pasos" del panel: qué le falta configurar a un negocio recién
 * creado, según su rubro.
 *
 * Es lógica PURA (sin red, sin storage) para poder testearla
 * (`tests/getting-started.test.ts`): qué pasos aplican depende del tipo de
 * negocio y de sus módulos, y si están hechos, de unos pocos hechos que trae
 * `services/getting-started.service.ts`.
 *
 * Qué rubro ve qué sale de `config/business.ts` (la fuente de verdad): los
 * pasos del proveedor, el personal y el sitio aparecen solo si el negocio
 * tiene ese ítem en su menú (`distributors`, `staff`, `landing`), en vez de
 * repetir acá la lista de rubros que los llevan.
 */
import { effectiveModules, visibleNavItems, type BusinessType, type Modules } from "@/config/business";

/** Lo que se sabe del negocio. `true` = ese paso ya está hecho. */
export interface GettingStartedFacts {
  hasProduct: boolean;
  hasService: boolean;
  hasStaff: boolean;
  hasDistributor: boolean;
  /** Datos del negocio guardados (régimen de IVA o identificación). */
  businessConfigured: boolean;
  /** Guardó al menos una vez Ajustes → Métodos de pago (aunque sea solo efectivo). */
  paymentMethodsConfigured: boolean;
  sitePublished: boolean;
  hasSale: boolean;
}

export type GettingStartedStepId =
  | "business"
  | "supplier"
  | "catalog"
  | "payments"
  | "staff"
  | "first-sale"
  | "site";

export interface GettingStartedStep {
  id: GettingStartedStepId;
  label: string;
  hint: string;
  href: string;
  done: boolean;
  /** No cuenta para el progreso ni para dar el checklist por completo. */
  optional?: boolean;
}

function catalogStep(
  businessType: BusinessType,
  modules: Modules | null,
  facts: GettingStartedFacts,
): GettingStartedStep {
  // Cualquier ítem del catálogo cuenta: un salón que vende un shampoo antes de
  // cargar sus servicios ya empezó.
  const done = facts.hasProduct || facts.hasService;

  if (businessType === "tienda") {
    return {
      id: "catalog",
      label: "Crea tu primer producto",
      hint: "Con precio y stock, para poder venderlo en el punto de venta.",
      href: "/dashboard/inventory/product",
      done,
    };
  }
  if (businessType === "escuela") {
    // Un plan de clases crea su propio servicio (ver PlanForm), así que
    // `hasService` también lo detecta.
    return {
      id: "catalog",
      label: "Crea tu primer plan de clases",
      hint: "El plan define cuántas clases incluye y su precio.",
      href: "/dashboard/school/planes",
      done,
    };
  }
  const active = effectiveModules(businessType, modules);
  if (!active.services && active.inventory) {
    return {
      id: "catalog",
      label: "Crea tu primer producto",
      hint: "Con precio y stock, para poder venderlo en el punto de venta.",
      href: "/dashboard/inventory/product",
      done,
    };
  }
  return {
    id: "catalog",
    label: "Crea tu primer servicio",
    hint: "Con su precio y duración, para agendarlo y cobrarlo.",
    href: "/dashboard/inventory/product?type=servicio",
    done,
  };
}

/**
 * Los pasos que aplican a este negocio, en el orden en que conviene hacerlos.
 * Sin tipo de negocio (cuenta a medio crear) no hay checklist.
 */
export function gettingStartedSteps(
  businessType: BusinessType | null,
  modules: Modules | null,
  facts: GettingStartedFacts,
  staffManuallyDone = false,
): GettingStartedStep[] {
  if (!businessType) return [];

  const nav = new Set(visibleNavItems(businessType, modules).map((item) => item.id));
  const steps: GettingStartedStep[] = [];

  // El negocio y el IVA van PRIMERO: definen cómo se guardan los precios, así
  // que cargar el catálogo antes deja productos con un IVA que no corresponde.
  steps.push({
    id: "business",
    label: "Configura los datos del negocio y el IVA",
    hint: "Si cobras IVA y su tasa, NIT o cédula y datos que salen en el recibo.",
    href: "/dashboard/settings/business",
    done: facts.businessConfigured,
  });

  // Antes del catálogo: al crear un producto ya se puede elegir su proveedor.
  if (nav.has("distributors")) {
    steps.push({
      id: "supplier",
      label: "Crea tu primer proveedor",
      hint: "A quién le compras: lo usas en compras y pedidos.",
      href: "/dashboard/distributors?new=1",
      done: facts.hasDistributor,
    });
  }

  steps.push(catalogStep(businessType, modules, facts));

  steps.push({
    id: "payments",
    label: "Configura tus métodos de pago",
    hint: "Efectivo, transferencia o datáfono: lo que aceptas al cobrar.",
    href: "/dashboard/settings/pagos",
    done: facts.paymentMethodsConfigured,
  });

  if (nav.has("staff")) {
    steps.push({
      id: "staff",
      label: businessType === "escuela" ? "Agrega a tus profesores" : "Agrega a tu personal",
      hint:
        businessType === "escuela"
          ? "Cada profesor con su perfil docente, para asignarle clases."
          : "Para asignarles citas y calcular sus comisiones.",
      href: "/dashboard/staff",
      done: facts.hasStaff || staffManuallyDone,
      optional: true,
    });
  }

  steps.push({
    id: "first-sale",
    label: "Registra tu primera venta",
    hint: "Desde el punto de venta, en efectivo, datáfono o transferencia.",
    href: "/dashboard/pos",
    done: facts.hasSale,
  });

  // Al final y opcional: se puede vender sin sitio, así que no frena el checklist.
  if (nav.has("landing")) {
    const siteCopy =
      businessType === "escuela"
        ? { label: "Publica tu sitio web", hint: "Una página pública para que las familias te encuentren." }
        : businessType === "tienda"
          ? { label: "Publica tu catálogo en línea", hint: "Tus clientes ven tus productos y te hacen el pedido por WhatsApp." }
          : { label: "Publica tu sitio de reservas", hint: "Tus clientes reservan solos, a cualquier hora." };
    steps.push({
      id: "site",
      ...siteCopy,
      href: "/dashboard/landing",
      done: facts.sitePublished,
      optional: true,
    });
  }

  return steps;
}

/** Los pasos que cuentan para el progreso y para dar el checklist por completo. */
export const requiredGettingStartedSteps = (steps: GettingStartedStep[]): GettingStartedStep[] =>
  steps.filter((s) => !s.optional);

/** Completo cuando están hechos todos los pasos OBLIGATORIOS (personal y sitio no cuentan). */
export const allGettingStartedDone = (steps: GettingStartedStep[]): boolean => {
  const required = requiredGettingStartedSteps(steps);
  return required.length > 0 && required.every((s) => s.done);
};

/* ── A dónde aterriza alguien después de iniciar sesión ─────────────────── */

/** Destino por defecto de todo login: decide entre POS y Panel (`app/dashboard/inicio/route.ts`). */
export const LANDING_PATH = "/dashboard/inicio";
export const POS_PATH = "/dashboard/pos";
export const PANEL_PATH = "/dashboard";

/** Lo mínimo para decidir el aterrizaje: los dos pasos sin los que no se cobra. */
export type LandingFacts = Pick<GettingStartedFacts, "businessConfigured" | "hasProduct" | "hasService">;

/** Quién inició sesión, en lo que importa para elegir a dónde va. */
export interface LandingProfile {
  isWorker: boolean;
  businessType: BusinessType | null;
}

/**
 * El negocio ya puede vender: tiene los datos (IVA o identificación) y al
 * menos un ítem en el catálogo, producto o servicio — la misma regla que los
 * pasos "business" y "catalog" del checklist.
 */
export const isBusinessReady = (facts: LandingFacts): boolean =>
  facts.businessConfigured && (facts.hasProduct || facts.hasService);

/** Solo el dueño con rubro elegido necesita mirar la base para decidir. */
export const needsLandingFacts = (profile: LandingProfile): boolean =>
  !profile.isWorker && profile.businessType !== null;

/**
 * Una sola regla para el login con correo y con Google:
 *
 *  - Trabajador → POS (lo suyo es cobrar; el checklist es del dueño).
 *  - Dueño sin rubro (onboarding a medias) → Panel, donde está el onboarding.
 *  - Dueño con el negocio listo → POS.
 *  - Dueño al que le falta algo → Panel, que muestra "Primeros pasos".
 *
 * `facts` en `null` = no se pudieron consultar: cuenta como listo (POS). Mismo
 * criterio que `fetchGettingStartedFacts`: un error nunca puede dejar a un
 * dueño atrapado en el Panel.
 */
export function landingPathFor(profile: LandingProfile, facts: LandingFacts | null): string {
  if (profile.isWorker) return POS_PATH;
  if (!profile.businessType) return PANEL_PATH;
  if (!facts) return POS_PATH;
  return isBusinessReady(facts) ? POS_PATH : PANEL_PATH;
}

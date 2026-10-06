/**
 * "Primeros pasos" del panel: qué le falta configurar a un negocio recién
 * creado, según su rubro.
 *
 * Es lógica PURA (sin red, sin storage) para poder testearla
 * (`tests/getting-started.test.ts`): qué pasos aplican depende del tipo de
 * negocio y de sus módulos, y si están hechos, de unos pocos hechos que trae
 * `services/getting-started.service.ts`.
 *
 * Qué rubro ve qué sale de `config/business.ts` (la fuente de verdad): el paso
 * del sitio de reservas aparece solo si el negocio tiene el ítem "landing" en
 * su menú, en vez de repetir acá la lista de rubros que lo llevan.
 */
import { effectiveModules, visibleNavItems, type BusinessType, type Modules } from "@/config/business";

/** Lo que se sabe del negocio. `true` = ese paso ya está hecho. */
export interface GettingStartedFacts {
  hasProduct: boolean;
  hasService: boolean;
  hasStaff: boolean;
  /** Datos del negocio guardados (régimen de IVA o identificación). */
  businessConfigured: boolean;
  sitePublished: boolean;
  hasSale: boolean;
}

export type GettingStartedStepId = "catalog" | "staff" | "business" | "site" | "first-sale";

export interface GettingStartedStep {
  id: GettingStartedStepId;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

/** Rubros que atienden con personal propio (comisiones, agenda, profesores). */
const STAFF_TYPES: BusinessType[] = ["salon", "escuela", "lavaautos", "servicios"];

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
): GettingStartedStep[] {
  if (!businessType) return [];

  const steps: GettingStartedStep[] = [catalogStep(businessType, modules, facts)];

  if (STAFF_TYPES.includes(businessType)) {
    steps.push({
      id: "staff",
      label: businessType === "escuela" ? "Agrega a tus profesores" : "Agrega a tu personal",
      hint:
        businessType === "escuela"
          ? "Cada profesor con su perfil docente, para asignarle clases."
          : "Para asignarles citas y calcular sus comisiones.",
      href: "/dashboard/staff",
      done: facts.hasStaff,
    });
  }

  steps.push({
    id: "business",
    label: "Configura los datos del negocio y el IVA",
    hint: "Régimen de IVA, NIT o cédula y datos que salen en el recibo.",
    href: "/dashboard/settings/business",
    done: facts.businessConfigured,
  });

  if (visibleNavItems(businessType, modules).some((item) => item.id === "landing")) {
    steps.push({
      id: "site",
      label: businessType === "escuela" ? "Publica tu sitio web" : "Publica tu sitio de reservas",
      hint:
        businessType === "escuela"
          ? "Una página pública para que las familias te encuentren."
          : "Tus clientes reservan solos, a cualquier hora.",
      href: "/dashboard/landing",
      done: facts.sitePublished,
    });
  }

  steps.push({
    id: "first-sale",
    label: "Registra tu primera venta",
    hint: "Desde el punto de venta, en efectivo, datáfono o transferencia.",
    href: "/dashboard/pos",
    done: facts.hasSale,
  });

  return steps;
}

export const allGettingStartedDone = (steps: GettingStartedStep[]): boolean =>
  steps.length > 0 && steps.every((s) => s.done);

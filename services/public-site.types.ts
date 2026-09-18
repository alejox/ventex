/**
 * Shape of the public micro-site payload.
 *
 * This mirrors, field by field, what `public.public_site_by_slug()` returns.
 * The RPC hand-picks its columns on purpose — `purchase_price`, commissions and
 * staff contact details never leave the database — so treat this type as the
 * contract: if a field is not here, the public site must not need it.
 */

import type { BusinessType } from "@/config/business";

/**
 * `barberia` es una PLANTILLA, no el tipo de negocio del inquilino.
 *
 * Antes esta presentación se activaba sola cuando el perfil era `salon`: el
 * selector mostraba tres tarjetas mientras existía una cuarta que nadie podía
 * elegir. Como clave propia, se guarda y se elige sola — aunque solo se le
 * OFREZCA a quien le sirve (ver TEMPLATE_BUSINESS_TYPES más abajo).
 */
export const SITE_TEMPLATES = [
  "clasico",
  "moderno",
  "minimal",
  "barberia",
  "barberia-artesanal",
] as const;
export type SiteTemplate = (typeof SITE_TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<SiteTemplate, string> = {
  clasico: "Clásico",
  moderno: "Moderno",
  minimal: "Minimal",
  // Dos plantillas de barbería: el nombre a secas no alcanza para elegir
  // entre ellas, y lo que las separa es la estética, no el rubro.
  barberia: "Barbería editorial",
  "barberia-artesanal": "Barbería artesanal",
};

/**
 * Qué rubros ve cada plantilla.
 *
 * No es una lista de permisos por seguridad: es que una plantilla NO es neutra.
 * Las de barbería hablan de cortes, de barba y de "el equipo", y el logo por
 * defecto es una tijera — en una tienda general publican un sitio que habla de
 * otro negocio. Y al revés: a una barbería mostrarle "Clásico", "Moderno" y
 * "Minimal" es ofrecerle tres diseños genéricos al lado de dos hechos para su
 * oficio, que es la forma más rápida de que elija el peor de los cinco.
 *
 * Una plantilla que NO figure acá se ofrece a todos. Hoy no hay ninguna, pero
 * la puerta queda abierta para un diseño que de verdad sirva a cualquier rubro.
 */
const RUBROS_GENERALES: readonly BusinessType[] = ["tienda", "lavaautos", "servicios"];

export const TEMPLATE_BUSINESS_TYPES: Partial<Record<SiteTemplate, readonly BusinessType[]>> = {
  clasico: RUBROS_GENERALES,
  moderno: RUBROS_GENERALES,
  minimal: RUBROS_GENERALES,
  barberia: ["salon"],
  "barberia-artesanal": ["salon"],
};

/**
 * Qué plantillas puede elegir este negocio.
 *
 * `current` es la que tiene guardada HOY, y se incluye siempre aunque ya no le
 * corresponda. Esconderla dejaría el selector sin ninguna tarjeta marcada
 * mientras el sitio publicado sigue usándola: el dueño no podría ver qué tiene
 * puesto ni, sobre todo, cambiarlo. La restricción es para lo que se elige de
 * acá en adelante, no una forma de dejar a alguien encerrado.
 */
export function templatesFor(
  businessType: BusinessType | string | null | undefined,
  current?: SiteTemplate,
): SiteTemplate[] {
  return SITE_TEMPLATES.filter((template) => {
    if (template === current) return true;
    const rubros = TEMPLATE_BUSINESS_TYPES[template];
    return !rubros || rubros.includes(businessType as BusinessType);
  });
}

export const TEMPLATE_DESCRIPTIONS: Record<SiteTemplate, string> = {
  clasico: "Cálido y tradicional. Tonos tierra, tipografía con serifa.",
  moderno: "Oscuro y con contraste alto. Acentos vivos, aire nocturno.",
  minimal: "Limpio y refinado. Blanco cálido, formas suaves y aire premium.",
  // Se nombra el oficio a propósito: el texto de la plantilla habla de cortes y
  // de barba, así que quien la elija para otro rubro tiene que saberlo antes.
  barberia: "Editorial, oscuro y dorado. Serifa grande y foto a sangre. Su texto habla de barbería.",
  "barberia-artesanal":
    "Claro y cálido. Cobre, titulares manuscritos y los servicios en círculos. Su texto habla de barbería.",
};

/** 0 = Sunday, matching Postgres `extract(dow from ...)`. */
export const WEEKDAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export interface PublicHour {
  weekday: number;
  isOpen: boolean;
  /** "HH:MM" */
  opensAt: string;
  /** "HH:MM" */
  closesAt: string;
}

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
  icon: string | null;
}

export interface PublicProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  icon: string | null;
  unit: string | null;
  inStock: boolean;
}

export interface PublicStaff {
  id: string;
  fullName: string;
  role: string | null;
}

export interface PublicSite {
  slug: string;
  template: SiteTemplate;
  businessName: string;
  businessType: string | null;
  headline: string | null;
  about: string | null;
  heroImageUrl: string | null;
  logoUrl: string | null;
  whatsapp: string | null;
  address: string | null;
  /**
   * Social handles as the owner typed them. `lib/socialLinks.ts` turns each one
   * into a safe `http(s)` URL — never build the href by hand here.
   */
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  twitter: string | null;
  linkedin: string | null;
  telegram: string | null;
  website: string | null;
  bookingEnabled: boolean;
  timezone: string;
  hours: PublicHour[];
  services: PublicService[];
  products: PublicProduct[];
  staff: PublicStaff[];
}

/**
 * `taken` says a slot is busy and nothing else — no who, no what. That is the
 * whole privacy contract of the public calendar: the visitor learns the shop is
 * occupied, never who occupies it.
 */
export type SlotState = "free" | "taken" | "past";

export interface DaySlot {
  /** "HH:MM" */
  time: string;
  state: SlotState;
}

export interface DayAvailability {
  /** "YYYY-MM-DD" */
  date: string;
  isOpen: boolean;
  freeSlots: number;
}

export interface BookingInput {
  slug: string;
  serviceId: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  time: string;
  customerName: string;
  customerPhone: string;
  /** null = "cualquier profesional disponible". */
  staffId: string | null;
  notes?: string | null;
}

export interface BookingResult {
  id: string;
  date: string;
  time: string;
  service: string;
  status: string;
  whatsapp: string | null;
}

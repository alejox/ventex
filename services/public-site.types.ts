/**
 * Shape of the public micro-site payload.
 *
 * This mirrors, field by field, what `public.public_site_by_slug()` returns.
 * The RPC hand-picks its columns on purpose — `purchase_price`, commissions and
 * staff contact details never leave the database — so treat this type as the
 * contract: if a field is not here, the public site must not need it.
 */

export const SITE_TEMPLATES = ["clasico", "moderno", "minimal"] as const;
export type SiteTemplate = (typeof SITE_TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<SiteTemplate, string> = {
  clasico: "Clásico",
  moderno: "Moderno",
  minimal: "Minimal",
};

export const TEMPLATE_DESCRIPTIONS: Record<SiteTemplate, string> = {
  clasico: "Cálido y tradicional. Tonos tierra, tipografía con serifa.",
  moderno: "Oscuro y con contraste alto. Acentos vivos, aire nocturno.",
  minimal: "Blanco, mucho aire y foco en el contenido.",
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
  instagram: string | null;
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

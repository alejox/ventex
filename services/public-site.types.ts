/**
 * Shape of the public micro-site payload.
 *
 * This mirrors, field by field, what `public.public_site_by_slug()` returns.
 * The RPC hand-picks its columns on purpose — `purchase_price`, commissions and
 * staff contact details never leave the database — so treat this type as the
 * contract: if a field is not here, the public site must not need it.
 */

export const SITE_TEMPLATES = ["rasm", "fallspa", "qutter"] as const;
export type SiteTemplate = (typeof SITE_TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<SiteTemplate, string> = {
  rasm: "Rasm",
  fallspa: "Fallspa",
  qutter: "Qutter",
};

export const TEMPLATE_DESCRIPTIONS: Record<SiteTemplate, string> = {
  rasm: "Editorial y sofisticado para belleza y cuidado personal.",
  fallspa: "Suave, luminoso y orgánico para spa y bienestar.",
  qutter: "Fuerte, gráfico y contrastado para barberías.",
};

export const SITE_SECTION_IDS = [
  "services",
  "about",
  "products",
  "team",
  "gallery",
  "booking",
  "hours",
  "contact",
] as const;
export type SiteSectionId = (typeof SITE_SECTION_IDS)[number];

export interface SiteSectionConfig {
  id: SiteSectionId;
  visible: boolean;
  title: string;
  subtitle: string;
}

export interface SiteImage {
  id: string;
  url: string;
  alt: string;
}

export interface SiteContactConfig {
  whatsapp: string | null;
  address: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  twitter: string | null;
  linkedin: string | null;
  telegram: string | null;
  website: string | null;
}

export interface LandingConfig {
  version: 1;
  template: SiteTemplate;
  colors: { primary: string | null };
  hero: {
    eyebrow: string;
    title: string | null;
    description: string | null;
    imageUrl: string | null;
  };
  about: {
    title: string;
    description: string | null;
    imageUrl: string | null;
  };
  gallery: { title: string; images: SiteImage[] };
  contact: SiteContactConfig;
  seo: { title: string | null; description: string | null; imageUrl: string | null };
  sections: SiteSectionConfig[];
}

const SECTION_DEFAULTS: Record<SiteSectionId, Omit<SiteSectionConfig, "id">> = {
  services: { visible: true, title: "Servicios", subtitle: "Lo que hacemos" },
  about: { visible: true, title: "Nuestra esencia", subtitle: "Sobre nosotros" },
  products: { visible: true, title: "Productos", subtitle: "Para llevar" },
  team: { visible: true, title: "El equipo", subtitle: "Quienes te reciben" },
  gallery: { visible: true, title: "Nuestro espacio", subtitle: "Conocenos" },
  booking: { visible: true, title: "Reservá tu turno", subtitle: "Agenda online" },
  hours: { visible: true, title: "Horarios", subtitle: "Planificá tu visita" },
  contact: { visible: true, title: "Dónde estamos", subtitle: "Hablemos" },
};

const EMPTY_CONTACT: SiteContactConfig = {
  whatsapp: null,
  address: null,
  instagram: null,
  facebook: null,
  tiktok: null,
  youtube: null,
  twitter: null,
  linkedin: null,
  telegram: null,
  website: null,
};

export const DEFAULT_SITE_IMAGES: Record<SiteTemplate, string> = {
  rasm: "/site-templates/rasm-hero.webp",
  fallspa: "/site-templates/fallspa-hero.webp",
  qutter: "/site-templates/qutter-hero.webp",
};

export const DEFAULT_SITE_DETAIL_IMAGES = {
  qutterSide: "/site-templates/qutter-side.webp",
} as const;

export function defaultLandingConfig(template: SiteTemplate = "rasm"): LandingConfig {
  return {
    version: 1,
    template,
    colors: { primary: null },
    hero: {
      eyebrow: "Bienvenidos",
      title: null,
      description: null,
      imageUrl: null,
    },
    about: { title: "Nuestra esencia", description: null, imageUrl: null },
    gallery: { title: "Nuestro espacio", images: [] },
    contact: { ...EMPTY_CONTACT },
    seo: { title: null, description: null, imageUrl: null },
    sections: SITE_SECTION_IDS.map((id) => ({ id, ...SECTION_DEFAULTS[id] })),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Normalizes persisted JSON so an older or partial draft remains renderable. */
export function normalizeLandingConfig(value: unknown): LandingConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const template = SITE_TEMPLATES.includes(raw.template as SiteTemplate)
    ? (raw.template as SiteTemplate)
    : "rasm";
  const result = defaultLandingConfig(template);
  const colors = raw.colors && typeof raw.colors === "object" ? raw.colors as Record<string, unknown> : {};
  const hero = raw.hero && typeof raw.hero === "object" ? raw.hero as Record<string, unknown> : {};
  const about = raw.about && typeof raw.about === "object" ? raw.about as Record<string, unknown> : {};
  const gallery = raw.gallery && typeof raw.gallery === "object" ? raw.gallery as Record<string, unknown> : {};
  const contact = raw.contact && typeof raw.contact === "object" ? raw.contact as Record<string, unknown> : {};
  const seo = raw.seo && typeof raw.seo === "object" ? raw.seo as Record<string, unknown> : {};

  result.colors.primary = nullableString(colors.primary);
  result.hero = {
    eyebrow: nullableString(hero.eyebrow) ?? result.hero.eyebrow,
    title: nullableString(hero.title),
    description: nullableString(hero.description),
    imageUrl: nullableString(hero.imageUrl),
  };
  result.about = {
    title: nullableString(about.title) ?? result.about.title,
    description: nullableString(about.description),
    imageUrl: nullableString(about.imageUrl),
  };
  const images = Array.isArray(gallery.images) ? gallery.images : [];
  result.gallery = {
    title: nullableString(gallery.title) ?? result.gallery.title,
    images: images.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const image = item as Record<string, unknown>;
      const url = nullableString(image.url);
      if (!url) return [];
      return [{ id: nullableString(image.id) ?? url, url, alt: nullableString(image.alt) ?? "" }];
    }).slice(0, 12),
  };
  for (const key of Object.keys(EMPTY_CONTACT) as (keyof SiteContactConfig)[]) {
    result.contact[key] = nullableString(contact[key]);
  }
  result.seo = {
    title: nullableString(seo.title),
    description: nullableString(seo.description),
    imageUrl: nullableString(seo.imageUrl),
  };

  const seen = new Set<SiteSectionId>();
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  result.sections = sections.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const section = item as Record<string, unknown>;
    if (!SITE_SECTION_IDS.includes(section.id as SiteSectionId)) return [];
    const id = section.id as SiteSectionId;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      visible: section.visible !== false,
      title: nullableString(section.title) ?? SECTION_DEFAULTS[id].title,
      subtitle: nullableString(section.subtitle) ?? SECTION_DEFAULTS[id].subtitle,
    }];
  });
  for (const id of SITE_SECTION_IDS) {
    if (!seen.has(id)) result.sections.push({ id, ...SECTION_DEFAULTS[id] });
  }
  return result;
}

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
  /** Frozen editorial snapshot used to render the public landing. */
  config: LandingConfig;
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

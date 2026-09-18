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
  "barberia-urbana",
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
  "barberia-urbana": "Barbería urbana",
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
  "barberia-urbana": ["salon"],
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
  "barberia-urbana":
    "Verde y directo. Versalitas condensadas y tus datos de contacto arriba de todo. Su texto habla de barbería.",
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
  /** Foto del servicio. Sin ella, cada plantilla dibuja su propio respaldo. */
  imageUrl: string | null;
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
  /** Vive en `public.staff`, no en el sitio: la foto es de la persona. */
  photoUrl: string | null;
}

export interface PublicSite {
  slug: string;
  /** Línea del pie que escribe el negocio. Texto plano, nunca HTML. */
  footerNote?: string | null;
  /** Textos de sección que el negocio sobreescribió. Ver `textoDelSitio`. */
  copy?: Partial<Record<SiteCopyKey, string>> | null;
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


/**
 * Textos del micrositio que el negocio puede reescribir.
 *
 * Van en un solo jsonb (`business_sites.site_copy`) y no en una columna por
 * frase: cada plantilla usa un subconjunto distinto de secciones, así que una
 * columna por texto llenaría la tabla de campos que casi nadie toca y cada
 * sección nueva sería otra migración.
 */
export const SITE_COPY_KEYS = [
  "heroKicker",
  "servicesTitle",
  "servicesSubtitle",
  "aboutTitle",
  "pricesTitle",
  "pricesSubtitle",
  "teamTitle",
  "teamSubtitle",
  "bookingTitle",
  "bookingSubtitle",
] as const;

export type SiteCopyKey = (typeof SITE_COPY_KEYS)[number];

export const SITE_COPY_LABELS: Record<SiteCopyKey, string> = {
  heroKicker: "Línea bajo el título principal",
  servicesTitle: "Servicios · título",
  servicesSubtitle: "Servicios · subtítulo",
  aboutTitle: "Sobre el negocio · título",
  pricesTitle: "Precios · título",
  pricesSubtitle: "Precios · subtítulo",
  teamTitle: "Equipo · título",
  teamSubtitle: "Equipo · subtítulo",
  bookingTitle: "Reservas · título",
  bookingSubtitle: "Reservas · subtítulo",
};

/**
 * Lo que dice cada sección cuando el negocio no escribió nada.
 *
 * Los valores por defecto son POR PLANTILLA y no compartidos, porque el tono de
 * los títulos ES parte del diseño: "Tu estilo, en buenas manos." pertenece a la
 * editorial de barbería tanto como su dorado. Compartir un único juego neutro
 * habría aplanado las cinco en el mismo sitio con distinta paleta.
 *
 * Una clave ausente para una plantilla significa que esa plantilla no dibuja
 * esa sección, no que esté vacía.
 */
export const TEMPLATE_COPY_DEFAULTS: Record<
  SiteTemplate,
  Partial<Record<SiteCopyKey, string>>
> = {
  clasico: {
    servicesTitle: "Servicios",
    pricesTitle: "Precios",
    teamTitle: "El equipo",
    bookingTitle: "Reservá con calma, vení a disfrutar.",
  },
  moderno: {
    servicesTitle: "Servicios",
    pricesTitle: "Precios",
    teamTitle: "El equipo",
    bookingTitle: "Elegí tu próximo turno.",
    bookingSubtitle: "Disponibilidad real para que reserves cuando quieras.",
  },
  minimal: {
    servicesTitle: "Servicios",
    pricesTitle: "Precios",
    teamTitle: "El equipo",
    bookingTitle: "Reservá tu turno",
    bookingSubtitle: "Elegí con tranquilidad el servicio, el día y la hora.",
  },
  barberia: {
    heroKicker: "El arte del buen estilo",
    servicesTitle: "Tu estilo, en buenas manos.",
    servicesSubtitle: "Nuestro oficio",
    aboutTitle: "Más que un corte",
    pricesTitle: "Buen estilo. Precios claros.",
    pricesSubtitle: "Sin sorpresas",
    teamTitle: "Conoce a tu equipo.",
    teamSubtitle: "Personas detrás del oficio",
    bookingTitle: "Tu próximo buen momento.",
    bookingSubtitle: "Elegí el servicio, el profesional y el horario que mejor te venga.",
  },
  "barberia-urbana": {
    heroKicker: "Cortes clásicos · Barba · Afeitado",
    servicesTitle: "Nuestros servicios",
    servicesSubtitle: "Lo que hacemos todos los días",
    aboutTitle: "La barbería",
    pricesTitle: "Nuestros precios",
    pricesSubtitle: "Claros y sin letra chica",
    teamTitle: "Los barberos",
    teamSubtitle: "Quién te va a atender",
    bookingTitle: "Pedí tu turno",
    bookingSubtitle: "Elegí servicio, barbero y horario. Te confirmamos por WhatsApp.",
  },
  "barberia-artesanal": {
    heroKicker: "Cortes · Barba · Cuidado",
    servicesTitle: "Nuestros servicios",
    servicesSubtitle: "Cada visita, con el tiempo que merece.",
    aboutTitle: "Sobre nosotros",
    pricesTitle: "Precios",
    pricesSubtitle: "Sin sorpresas al final.",
    teamTitle: "El equipo",
    teamSubtitle: "Quienes te reciben.",
    bookingTitle: "Reservá tu cita",
    bookingSubtitle: "Elegí el servicio, el profesional y el horario que mejor te venga.",
  },
};

/**
 * El texto de una sección: lo que escribió el negocio, o el de la plantilla.
 *
 * Se descarta lo que venga vacío o en blanco. Un campo que el dueño borró debe
 * volver al texto por defecto, no dejar un título en blanco: una sección sin
 * encabezado se lee como un error de la página, no como una decisión.
 */
export function textoDelSitio(site: PublicSite, clave: SiteCopyKey): string {
  const propio = site.copy?.[clave];
  if (typeof propio === "string" && propio.trim()) return propio.trim();
  return TEMPLATE_COPY_DEFAULTS[site.template]?.[clave] ?? "";
}

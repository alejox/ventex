import type { PublicSite } from "../../services/public-site.types";

/** Deterministic sample data for tests and local previews, never a live tenant. */
export const barberModernSite: PublicSite = {
  slug: "barber-modern-test",
  template: "moderno",
  businessName: "Distrito Barbería",
  businessType: "salon",
  headline: "El detalle hace la diferencia.",
  about: "Un espacio para desconectar, renovar tu estilo y dedicarte tiempo. Cortes precisos, cuidado de la barba y atención a tu medida.",
  heroImageUrl: null,
  logoUrl: null,
  whatsapp: "573001234567",
  address: "Calle 85 # 12-34, Bogotá",
  instagram: "distrito.test",
  facebook: null,
  tiktok: null,
  youtube: null,
  twitter: null,
  linkedin: null,
  telegram: null,
  website: null,
  bookingEnabled: true,
  timezone: "America/Bogota",
  hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, isOpen: true, opensAt: "09:00", closesAt: "19:00" })),
  services: [
    { id: "cut", name: "Corte de cabello", description: "Un corte pensado para tu estilo, con acabado y peinado.", price: 35000, durationMinutes: 40, icon: null },
    { id: "beard", name: "Diseño de barba", description: "Perfilado, definición y cuidado para tu barba.", price: 25000, durationMinutes: 30, icon: null },
    { id: "combo", name: "Corte y barba", description: "El ritual completo para renovar tu imagen.", price: 55000, durationMinutes: 60, icon: null },
  ],
  staff: [{ id: "staff-a", fullName: "Andrés Martínez", role: "Barbero" }, { id: "staff-b", fullName: "Daniel Torres", role: "Barbero" }],
  products: [],
};

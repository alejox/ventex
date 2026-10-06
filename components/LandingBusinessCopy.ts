import type { BusinessType } from "@/config/business";

/**
 * Cómo se NOMBRA y se DESCRIBE cada rubro de cara al visitante: landing,
 * registro y onboarding usan estas mismas palabras, para que quien eligió
 * "Academia" en la portada encuentre "Academia" al registrarse y no un
 * "Académico" o un "Servicios Profesionales" que no reconoce.
 *
 * Es copy de presentación, no gating: qué rubros se pueden registrar y qué
 * módulos ofrece cada uno sigue saliendo de `config/business.ts`.
 */
export interface BusinessCopy {
  /** Nombre en singular, para tarjetas de elección ("¿qué negocio tienes?"). */
  label: string;
  /** Nombre en plural, para la landing ("para barberías, tiendas…"). */
  plural: string;
  /** Una línea que dice qué resuelve Ventex para ese negocio. */
  description: string;
  /** Ejemplo para el campo "Nombre del negocio". */
  namePlaceholder: string;
}

export const BUSINESS_COPY: Record<BusinessType, BusinessCopy> = {
  salon: {
    label: "Barbería o salón",
    plural: "Barberías y salones",
    description: "Citas y reservas online, comisiones por barbero y promoción de cortes.",
    namePlaceholder: "Ej: Barbería El Clásico",
  },
  tienda: {
    label: "Tienda",
    plural: "Tiendas",
    description: "Punto de venta, inventario con alertas de stock, compras y ofertas.",
    namePlaceholder: "Ej: Tienda Don Pedro",
  },
  escuela: {
    label: "Academia",
    plural: "Academias",
    description: "Estudiantes, matrículas, agenda de clases y asistencia.",
    namePlaceholder: "Ej: Academia de Música Allegro",
  },
  lavaautos: {
    label: "Lavaautos",
    plural: "Lavaautos",
    description: "Turnos de lavado, historial por placa e insumos.",
    namePlaceholder: "Ej: Lavaautos La 80",
  },
  servicios: {
    label: "Servicios profesionales",
    plural: "Servicios profesionales",
    description: "Agenda de consultas, catálogo de honorarios y seguimiento de clientes.",
    namePlaceholder: "Ej: Consultorio Gómez",
  },
};

/** Placeholder del nombre del negocio; genérico mientras no haya rubro. */
export function businessNamePlaceholder(type: BusinessType | "" | null | undefined): string {
  return type ? BUSINESS_COPY[type].namePlaceholder : "Ej: Mi negocio";
}

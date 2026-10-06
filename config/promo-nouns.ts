import type { BusinessType } from "@/config/business";
import { DEFAULT_PROMO_MESSAGE } from "@/services/promos.service";

/**
 * Cómo se llama, en cada rubro, la unidad que cuenta el motor de fidelización.
 *
 * El motor nació en la barbería y por eso su variable de plantilla se llama
 * `{cortes}` y sus columnas `haircut_count`. Eso NO cambia (las plantillas ya
 * guardadas en la base usan `{cortes}`); lo que cambia es la copy visible:
 * un lavaautos no cuenta cortes, cuenta lavados.
 *
 * Vive acá y no en `config/business.ts` solo para no pisar trabajo en paralelo
 * sobre ese archivo; es candidato natural a mudarse allá junto a
 * `STAFF_ROLES_BY_TYPE`.
 */
export interface PromoNoun {
  singular: string;
  plural: string;
  /** Género gramatical: decide "el/la", "los/las", "cuántos/cuántas". */
  feminine: boolean;
}

export const PROMO_NOUNS: Record<BusinessType, PromoNoun> = {
  salon: { singular: "corte", plural: "cortes", feminine: false },
  lavaautos: { singular: "lavado", plural: "lavados", feminine: false },
  escuela: { singular: "clase", plural: "clases", feminine: true },
  servicios: { singular: "visita", plural: "visitas", feminine: true },
  // La tienda no usa el contador (tiene ofertas y puntos), pero el tipo exige
  // la entrada; "compras" es lo que contaría si algún día lo usara.
  tienda: { singular: "compra", plural: "compras", feminine: true },
};

/** Sin rubro definido, la palabra más neutra: "visitas". */
export function promoNounFor(businessType: BusinessType | null | undefined): PromoNoun {
  return businessType ? PROMO_NOUNS[businessType] : PROMO_NOUNS.servicios;
}

export const articleSingular = (n: PromoNoun) => (n.feminine ? "la" : "el");
export const articlePlural = (n: PromoNoun) => (n.feminine ? "las" : "los");
export const howMany = (n: PromoNoun) => (n.feminine ? "cuántas" : "cuántos");

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * El mensaje por defecto que se le PRECARGA al editor de este rubro.
 *
 * Solo cambia la palabra que sigue a `{cortes}` (y saca el 💈, que es de
 * barbería). La variable queda igual: `renderPromoMessage` la sigue
 * reemplazando por el número, sin enterarse del rubro.
 */
export function defaultPromoMessageFor(noun: PromoNoun): string {
  if (noun.plural === "cortes") return DEFAULT_PROMO_MESSAGE;
  return DEFAULT_PROMO_MESSAGE.replace("{cortes} cortes", `{cortes} ${noun.plural}`).replace(" 💈", "");
}

/**
 * La plantilla con la que se arma el mensaje de WhatsApp en POS, Clientes y
 * Promociones: la que guardó el negocio o, si nunca guardó una, la del rubro
 * (la misma que precarga Ajustes → Promociones). Sin esto, un lavaautos que
 * nunca abrió el editor le mandaba "Ya llevas 3 cortes" a sus clientes.
 */
export function promoTemplateFor(
  saved: string | null | undefined,
  businessType: BusinessType | null | undefined,
): string {
  return saved?.trim() || defaultPromoMessageFor(promoNounFor(businessType));
}

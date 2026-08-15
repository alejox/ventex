import { createClient } from "@/utils/supabase/client";
import type { PromoMilestone } from "@/services/promos.service";
import { milestoneFor } from "@/services/promos.service";

/** Un cliente en la tabla de promociones, con lo que le falta para el premio. */
export interface PromoCustomer {
  id: string;
  full_name: string;
  phone: string | null;
  haircut_count: number;
  /** Premio que le corresponde AHORA, si le corresponde alguno. */
  reward: string | null;
  /** Cuántos cortes le faltan para el próximo hito. null = no hay próximo. */
  missing: number | null;
  /** El hito al que le está apuntando. */
  nextThreshold: number | null;
}

/**
 * Clientes con al menos un corte, del que más lleva al que menos.
 *
 * Se filtra en la base y no en memoria: un negocio con miles de clientes tiene
 * un puñado con cortes acumulados, y traerlos a todos para descartarlos acá
 * sería pedir la agenda entera para mostrar una decena de filas.
 */
export async function fetchPromoCustomers(): Promise<
  Pick<PromoCustomer, "id" | "full_name" | "phone" | "haircut_count">[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, haircut_count")
    .gt("haircut_count", 0)
    .order("haircut_count", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Pick<PromoCustomer, "id" | "full_name" | "phone" | "haircut_count">[];
}

/**
 * Cuántos cortes le faltan al cliente para el próximo premio.
 *
 * Un hito que se repite marca el siguiente múltiplo; uno de una sola vez, el
 * umbral exacto si todavía no lo pasó. Gana el que esté MÁS CERCA: es el que
 * responde la pregunta que el mostrador hace ("¿a este cuánto le falta?").
 *
 * Pura y exportada para poder testearla sin base de datos.
 */
export function nextMilestone(
  count: number,
  milestones: PromoMilestone[],
): { threshold: number; missing: number; reward: string } | null {
  const candidatos = milestones
    .filter((m) => m.is_active && m.threshold > 0)
    .map((m) => {
      if (m.recurring) {
        // El próximo múltiplo estricto: con 20 cortes y un hito cada 10, el que
        // viene es 30, no 20 — ese ya lo alcanzó.
        const siguiente = (Math.floor(count / m.threshold) + 1) * m.threshold;
        return { threshold: siguiente, missing: siguiente - count, reward: m.reward };
      }
      if (m.threshold <= count) return null;
      return { threshold: m.threshold, missing: m.threshold - count, reward: m.reward };
    })
    .filter((x): x is { threshold: number; missing: number; reward: string } => x !== null);

  if (candidatos.length === 0) return null;
  return candidatos.reduce((a, b) => (b.missing < a.missing ? b : a));
}

/** Arma las filas de la tabla: el premio de ahora y el que viene. */
export function toPromoRows(
  customers: Pick<PromoCustomer, "id" | "full_name" | "phone" | "haircut_count">[],
  milestones: PromoMilestone[],
): PromoCustomer[] {
  return customers.map((c) => {
    const alcanzado = milestoneFor(c.haircut_count, milestones);
    const proximo = nextMilestone(c.haircut_count, milestones);
    return {
      ...c,
      reward: alcanzado?.reward ?? null,
      missing: proximo?.missing ?? null,
      nextThreshold: proximo?.threshold ?? null,
    };
  });
}

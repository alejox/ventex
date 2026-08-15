import { createClient } from "@/utils/supabase/client";
import type { PromoMilestone } from "@/services/promos.service";
import { availableReward } from "@/services/promos.service";

/** Un cliente en la tabla de promociones, con lo que le falta para el premio. */
export interface PromoCustomer {
  id: string;
  full_name: string;
  phone: string | null;
  /** De por vida. Es el número de la relación con el cliente. */
  haircut_count: number;
  /** Progreso hacia el premio: sube al cortar, vuelve a 0 al canjear. */
  progress: number;
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
export type PromoCustomerRow = Pick<PromoCustomer, "id" | "full_name" | "phone" | "haircut_count" | "progress">;

export async function fetchPromoCustomers(): Promise<PromoCustomerRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, haircut_count, haircuts_since_reward")
    .gt("haircut_count", 0)
    .order("haircut_count", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    phone: c.phone,
    haircut_count: c.haircut_count,
    progress: c.haircuts_since_reward,
  }));
}

/**
 * Cuántos cortes le faltan para el próximo premio, contra el PROGRESO.
 *
 * Pura y exportada para poder testearla sin base de datos.
 */
export function nextMilestone(
  progress: number,
  milestones: PromoMilestone[],
): { threshold: number; missing: number; reward: string } | null {
  // El más bajo que todavía no alcanzó. Ya no hay múltiplos que calcular: el
  // canje reinicia el progreso, así que los hitos son escalones de una sola
  // cuenta que arranca de cero cada vez.
  const pendientes = milestones
    .filter((m) => m.is_active && m.threshold > progress)
    .sort((a, b) => a.threshold - b.threshold);
  if (pendientes.length === 0) return null;
  const siguiente = pendientes[0];
  return {
    threshold: siguiente.threshold,
    missing: siguiente.threshold - progress,
    reward: siguiente.reward,
  };
}

/** Arma las filas de la tabla: el premio de ahora y el que viene. */
export function toPromoRows(
  customers: PromoCustomerRow[],
  milestones: PromoMilestone[],
): PromoCustomer[] {
  return customers.map((c) => {
    // Contra el PROGRESO y no contra el histórico: el premio se gana sobre lo
    // acumulado desde el último canje.
    const alcanzado = availableReward(c.progress, milestones);
    const proximo = nextMilestone(c.progress, milestones);
    return {
      ...c,
      reward: alcanzado?.reward ?? null,
      missing: proximo?.missing ?? null,
      nextThreshold: proximo?.threshold ?? null,
    };
  });
}

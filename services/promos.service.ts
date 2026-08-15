import { createClient } from "@/utils/supabase/client";

/**
 * Promociones por cantidad de cortes.
 *
 * El envío es un enlace `wa.me`: abre WhatsApp con el mensaje ya escrito y lo
 * manda una persona. No hay API de Meta, no hay plantillas que aprobar y no hay
 * costo por conversación — para una barbería eso es lo proporcionado, y además
 * es el mismo mecanismo que la app ya usa para el botón de Soporte.
 *
 * Consecuencia de diseño: como el mensaje lo dispara un humano, el texto es
 * libre. Con la API de Meta habría que ceñirse a una plantilla aprobada.
 */

export interface PromoConfig {
  enabled: boolean;
  /** Servicios que suman al contador. Vacío = el contador nunca sube. */
  serviceIds: string[];
  /** Plantilla del mensaje. null = se usa `DEFAULT_PROMO_MESSAGE`. */
  message: string | null;
}

export interface PromoMilestone {
  id: string;
  threshold: number;
  reward: string;
  /** true = se repite (cada 10). false = se alcanza una sola vez (a los 50). */
  recurring: boolean;
  is_active: boolean;
}

export interface NewMilestoneInput {
  threshold: number;
  reward: string;
  recurring: boolean;
}

/**
 * El mensaje por defecto. Es genérico a propósito: el negocio lo edita en
 * Configuración, pero desde el minuto cero hay algo que mandar.
 */
export const DEFAULT_PROMO_MESSAGE =
  "¡Hola {cliente}! Gracias por tu visita 💈 Ya llevás {cortes} cortes con nosotros en {negocio}.";

/** Las variables que el negocio puede usar, con qué significan. */
export const PROMO_VARIABLES: { token: string; help: string }[] = [
  { token: "{cliente}", help: "Nombre del cliente" },
  { token: "{cortes}", help: "Cuántos cortes lleva" },
  { token: "{negocio}", help: "Nombre de tu negocio" },
  { token: "{premio}", help: "El premio del hito alcanzado, si alcanzó uno" },
];

export const EMPTY_PROMO_CONFIG: PromoConfig = { enabled: false, serviceIds: [], message: null };

export async function fetchPromoConfig(): Promise<PromoConfig> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("promo_enabled, promo_service_ids, promo_message")
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_PROMO_CONFIG;
  return {
    enabled: data.promo_enabled ?? false,
    serviceIds: data.promo_service_ids ?? [],
    message: data.promo_message ?? null,
  };
}

/**
 * Guarda la configuración. Lee-y-inserta-o-actualiza, igual que el resto de
 * `settings.service.ts`: la fila de ajustes se crea perezosamente y un negocio
 * que nunca tocó Ajustes todavía no la tiene.
 */
export async function savePromoConfig(config: PromoConfig): Promise<void> {
  const supabase = createClient();
  const patch = {
    promo_enabled: config.enabled,
    promo_service_ids: config.serviceIds,
    promo_message: config.message?.trim() || null,
  };

  const { data: existing, error: readErr } = await supabase
    .from("settings")
    .select("id")
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing?.id) {
    const { error } = await supabase.from("settings").update(patch).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  // Los defaults de IVA acompañan porque son NOT NULL en la tabla; sin ellos el
  // primer guardado de promociones fallaría en un negocio que nunca abrió Ajustes.
  const { error } = await supabase.from("settings").insert({
    tax_rate: 0.19,
    include_tax: true,
    allow_oversell: true,
    currency: "COP",
    ...patch,
  });
  if (error) throw error;
}

export async function fetchMilestones(): Promise<PromoMilestone[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("promo_milestones")
    .select("id, threshold, reward, recurring, is_active")
    .order("threshold");
  if (error) throw error;
  return (data ?? []) as PromoMilestone[];
}

export async function createMilestone(input: NewMilestoneInput): Promise<PromoMilestone> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("promo_milestones")
    .insert({ threshold: input.threshold, reward: input.reward.trim(), recurring: input.recurring })
    .select("id, threshold, reward, recurring, is_active")
    .single();
  if (error) throw error;
  return data as PromoMilestone;
}

export async function deleteMilestone(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("promo_milestones").delete().eq("id", id);
  if (error) throw error;
}

/**
 * El contador de UN cliente, recién leído.
 *
 * Se usa justo después de cobrar: el trigger ya sumó en la base, pero la copia
 * que tiene el POS en memoria quedó vieja. Mandar el número viejo sería
 * decirle al cliente que lleva uno menos del que acaba de hacerse.
 */
export async function fetchCustomerPromoTarget(
  customerId: string,
): Promise<{ count: number; phone: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("haircut_count, phone")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  // El telefono viene de acá y no del selector del POS: `CustomerOption` trae
  // solo lo que el cobro necesita, y agregarle un campo para esto obligaría a
  // que cada venta lo traiga aunque no haya promociones activas.
  return { count: data?.haircut_count ?? 0, phone: data?.phone ?? null };
}

/** Recalcula el contador de todos los clientes desde el histórico de ventas. */
export async function recalcHaircutCounts(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("recalc_haircut_counts");
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

/**
 * El hito que le corresponde a un conteo, si le corresponde alguno.
 *
 * Un hito `recurring` se cumple en cada múltiplo (cada 10: 10, 20, 30…); uno
 * que no, solo en el número exacto. Si dos aplican al mismo tiempo gana el
 * umbral MÁS ALTO: llegar a 50 es la noticia, no que 50 también es múltiplo de
 * 10. Se exporta suelta y pura para poder testearla sin base de datos.
 */
export function milestoneFor(count: number, milestones: PromoMilestone[]): PromoMilestone | null {
  if (count <= 0) return null;
  const alcanzados = milestones.filter((m) => {
    if (!m.is_active || m.threshold <= 0) return false;
    return m.recurring ? count % m.threshold === 0 : count === m.threshold;
  });
  if (alcanzados.length === 0) return null;
  return alcanzados.reduce((a, b) => (b.threshold > a.threshold ? b : a));
}

/**
 * Reemplaza las variables de la plantilla.
 *
 * Una variable sin valor se va a la cadena vacía en vez de quedar como
 * `{premio}` en el mensaje: al cliente le llegaría el nombre de la variable.
 */
export function renderPromoMessage(
  template: string | null,
  vars: { cliente: string; cortes: number; negocio: string; premio?: string | null },
): string {
  const base = template?.trim() || DEFAULT_PROMO_MESSAGE;
  return base
    .replace(/\{cliente\}/g, vars.cliente)
    .replace(/\{cortes\}/g, String(vars.cortes))
    .replace(/\{negocio\}/g, vars.negocio)
    .replace(/\{premio\}/g, vars.premio ?? "")
    // Dos espacios seguidos son la huella de una variable que quedó vacía.
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Normaliza un teléfono a lo que `wa.me` espera: solo dígitos, con indicativo.
 *
 * Los teléfonos se cargan como los dicta el cliente ("311 232 9185",
 * "+57 311..."), y `wa.me` no acepta espacios ni signos. Si el número viene sin
 * indicativo se le antepone el del país, porque un `wa.me/3112329185` abre un
 * chat con un número que no existe.
 */
export function whatsappNumber(phone: string | null, countryCode = "57"): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.startsWith(countryCode) && digits.length > 10) return digits;
  return `${countryCode}${digits}`;
}

/** El enlace que abre WhatsApp con el mensaje escrito. null = sin teléfono usable. */
export function whatsappLink(phone: string | null, message: string): string | null {
  const numero = whatsappNumber(phone);
  if (!numero) return null;
  // api.whatsapp.com y no wa.me: el acortador rompe los emojis, y el mensaje
  // por defecto trae uno (ver el comentario equivalente en DashboardShell).
  return `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(message)}`;
}

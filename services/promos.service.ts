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

/**
 * Qué FORMA tiene el premio, que es lo que decide si la caja puede aplicarlo.
 *
 * `texto` existe a propósito y es el default: "una cerveza" o "un producto de
 * regalo" no se descuentan de la cuenta, y forzarlos a un porcentaje sería
 * inventarles un precio. Esos se anuncian y se entregan a mano.
 */
export type RewardKind = "texto" | "gratis" | "porcentaje" | "monto";

export const REWARD_KIND_LABELS: Record<RewardKind, string> = {
  texto: "Solo anunciarlo (se entrega a mano)",
  gratis: "El servicio va gratis",
  porcentaje: "Descuento por porcentaje",
  monto: "Descuento de un monto fijo",
};

export interface PromoMilestone {
  id: string;
  threshold: number;
  reward: string;
  reward_kind: RewardKind;
  /** Solo para `porcentaje` (1-100) y `monto`. Null en los otros. */
  reward_value: number | null;
  is_active: boolean;
}

export interface NewMilestoneInput {
  threshold: number;
  reward: string;
  reward_kind: RewardKind;
  reward_value: number | null;
}

/** Una línea del carrito, en lo mínimo que el cálculo del premio necesita. */
export interface DiscountableLine {
  key: string;
  /** Id del servicio o producto, para saber si cuenta como corte. */
  itemId: string;
  isService: boolean;
  /** Precio de UNA unidad. */
  unitPrice: number;
  quantity: number;
}

/**
 * Cuánto descontar y de qué línea, para un premio ya ganado.
 *
 * Devuelve null cuando no hay nada que aplicar: premio de tipo `texto`, o un
 * carrito sin ninguna línea de las que cuentan. Que no aplique NO significa que
 * el cliente no ganó — significa que esa cuenta no es donde se cobra el premio.
 *
 * Se elige la línea MÁS CARA de las que cuentan. "Tu próximo corte es gratis"
 * lo lee el cliente sobre el corte que se hizo, y si se hizo el de barba
 * también, regalarle el más barato es la clase de detalle que se discute en el
 * mostrador.
 *
 * El descuento es siempre por UNA unidad y nunca supera el precio de la línea:
 * un premio no puede terminar devolviéndole plata al cliente.
 */
export function promoDiscountFor(
  milestone: Pick<PromoMilestone, "reward_kind" | "reward_value">,
  lines: DiscountableLine[],
  countingServiceIds: string[],
): { key: string; discountAmount: number } | null {
  if (milestone.reward_kind === "texto") return null;

  const elegibles = lines.filter((l) => l.isService && countingServiceIds.includes(l.itemId));
  if (elegibles.length === 0) return null;

  const linea = elegibles.reduce((a, b) => (b.unitPrice > a.unitPrice ? b : a));
  const tope = linea.unitPrice;

  let bruto: number;
  if (milestone.reward_kind === "gratis") bruto = tope;
  else if (milestone.reward_kind === "porcentaje") bruto = (tope * (milestone.reward_value ?? 0)) / 100;
  else bruto = milestone.reward_value ?? 0;

  const discountAmount = Math.round(Math.min(bruto, tope) * 100) / 100;
  if (discountAmount <= 0) return null;
  return { key: linea.key, discountAmount };
}

/** Lo que se le entregó a un cliente, congelado el día del canje. */
export interface PromoRedemption {
  id: string;
  threshold: number;
  reward: string;
  redeemed_at: string;
}

/**
 * El mensaje por defecto. Es genérico a propósito: el negocio lo edita en
 * Configuración, pero desde el minuto cero hay algo que mandar.
 */
export const DEFAULT_PROMO_MESSAGE =
  "¡Hola {cliente}! Gracias por tu visita 💈 Ya llevás {cortes} cortes en {negocio}. {premio}";

/** Las variables que el negocio puede usar, con qué significan. */
export const PROMO_VARIABLES: { token: string; help: string }[] = [
  { token: "{cliente}", help: "Nombre del cliente" },
  { token: "{cortes}", help: "Cortes acumulados hacia el premio" },
  { token: "{total}", help: "Cortes de por vida, sin reiniciar" },
  { token: "{negocio}", help: "Nombre de tu negocio" },
  { token: "{premio}", help: "Avisa que ya ganó el premio y lo nombra. Vacío si todavía no le toca" },
];

/**
 * El mensaje de la visita en la que se CANJEA, que es otra cosa que el del contador.
 *
 * Después de canjear el progreso queda en 0 —y está bien—, pero el POS ofrecía
 * igual el botón de WhatsApp con "Ya llevás 0 cortes en La Barbe": lo último que
 * hay que mandarle a alguien a quien se le acaba de entregar un premio. El
 * contador arranca de nuevo en la visita SIGUIENTE; el de esta visita es este.
 *
 * Se llega acá por DOS caminos, y los dos hacen falta. El POS lo llama directo
 * con el premio que acaba de entregar, porque es el único que lo sabe. Las
 * demás pantallas caen solas desde `renderPromoMessage` cuando el contador está
 * en cero con historial detrás — ahí no se sabe QUÉ premio fue, solo que hubo
 * uno, y el mensaje se arma igual sin nombrarlo.
 */
export const DEFAULT_REDEEM_MESSAGE =
  "¡Listo {cliente}! 🎉 Canjeaste tu promoción en {negocio}. {premio}Tu contador arranca de nuevo — ¡gracias por la fidelidad! 💈";

/**
 * El premio va en su PROPIA oración, no incrustado con dos puntos.
 *
 * Desde Clientes y Promociones no se sabe qué premio se entregó —solo que el
 * progreso volvió a cero—, y un premio vacío incrustado dejaba "en labarbe: ."
 * en el mensaje. Con oración propia, ausente simplemente no aparece.
 */
function redeemAward(reward: string | null | undefined): string {
  const premio = reward?.trim();
  if (!premio) return "";
  const cierre = /[.!?…]$/.test(premio) ? "" : ".";
  return `Te llevaste: ${premio}${cierre} `;
}

/**
 * Igual que `renderPromoMessage` pero para el canje, y con una diferencia que
 * importa: acá el premio NO se anuncia como pendiente. Reusar la otra función
 * le diría "te espera en tu próxima visita" sobre un premio que el cliente
 * acaba de llevarse.
 */
export function renderRedeemMessage(
  template: string | null,
  vars: { cliente: string; negocio: string; premio?: string | null; total?: number },
): string {
  const base = template?.trim() || DEFAULT_REDEEM_MESSAGE;
  const literal = (valor: string) => () => valor;
  return base
    .replace(/\{cliente\}/g, literal(vars.cliente))
    .replace(/\{negocio\}/g, literal(vars.negocio))
    .replace(/\{premio\}/g, literal(redeemAward(vars.premio)))
    .replace(/\{total\}/g, literal(String(vars.total ?? 0)))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * El nombre del negocio tal como lo tiene que leer el cliente.
 *
 * Hay DOS fuentes y no siempre coinciden: `settings.business_profile.businessName`
 * —lo que el dueño escribió en Ajustes → Datos de tu negocio— y
 * `profiles.business_name`, que es el nombre con el que se registró. La primera
 * manda porque es la que el negocio eligió mostrar; la segunda es el respaldo.
 *
 * Sin esta cadena el POS caía directo al genérico: lee de `settings`, que
 * arranca vacío hasta que alguien abre esa pestaña, y le mandaba al cliente
 * "en nuestro local" teniendo el nombre real a un campo de distancia.
 */
export function businessDisplayName(
  fromSettings?: string | null,
  fromProfile?: string | null,
): string {
  return fromSettings?.trim() || fromProfile?.trim() || "nuestro local";
}

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
    .select("id, threshold, reward, reward_kind, reward_value, is_active")
    .order("threshold");
  if (error) throw error;
  return (data ?? []) as PromoMilestone[];
}

export async function createMilestone(input: NewMilestoneInput): Promise<PromoMilestone> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("promo_milestones")
    .insert({
      threshold: input.threshold,
      reward: input.reward.trim(),
      reward_kind: input.reward_kind,
      reward_value: input.reward_value,
    })
    .select("id, threshold, reward, reward_kind, reward_value, is_active")
    .single();
  if (error) throw error;
  return data as PromoMilestone;
}

/**
 * Canjea el premio: lo registra y reinicia el progreso, todo junto.
 *
 * Va en un RPC porque las dos cosas tienen que pasar o no pasar. Sueltas, si
 * fallara el reinicio el cliente se llevaría el corte gratis con el contador
 * intacto y podría reclamarlo de nuevo.
 *
 * Devuelve `progress_after` porque el número final no siempre es cero y el
 * cajero tiene que poder decírselo al cliente: el corte que pagó el premio no
 * cuenta, pero el que pagó el cliente arranca el conteo siguiente.
 */
export async function redeemPromo(
  customerId: string,
  discountApplied?: number | null,
  saleId?: string | null,
): Promise<{ threshold: number; reward: string; progress_after: number; rewarded_haircuts: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("redeem_promo", {
    p_customer_id: customerId,
    p_discount_applied: discountApplied ?? undefined,
    p_sale_id: saleId ?? undefined,
  });
  if (error) throw error;
  return data as unknown as {
    threshold: number;
    reward: string;
    progress_after: number;
    rewarded_haircuts: number;
  };
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
): Promise<{ count: number; progress: number; phone: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("haircut_count, haircuts_since_reward, phone")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  // El telefono viene de acá y no del selector del POS: `CustomerOption` trae
  // solo lo que el cobro necesita, y agregarle un campo para esto obligaría a
  // que cada venta lo traiga aunque no haya promociones activas.
  return {
    count: data?.haircut_count ?? 0,
    progress: data?.haircuts_since_reward ?? 0,
    phone: data?.phone ?? null,
  };
}

/** Recalcula el contador de todos los clientes desde el histórico de ventas. */
export async function recalcHaircutCounts(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("recalc_haircut_counts");
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

/**
 * El premio que el cliente YA GANÓ con su progreso, si ganó alguno.
 *
 * Es el hito más alto cuyo umbral el progreso alcanzó o pasó. No exige
 * coincidencia exacta a propósito: un cliente que llegó a 12 sin canjear tiene
 * ganado el premio de 10, y decirle que lo perdió por no haber venido justo en
 * el décimo es la forma más rápida de que no vuelva.
 *
 * Antes esto se calculaba con aritmética de múltiplos sobre el total de por
 * vida. Con el canje reiniciando el progreso, esa cuenta dejó de tener sentido:
 * el premio sale del progreso.
 */
export function availableReward(progress: number, milestones: PromoMilestone[]): PromoMilestone | null {
  if (progress <= 0) return null;
  const ganados = milestones.filter((m) => m.is_active && m.threshold > 0 && m.threshold <= progress);
  if (ganados.length === 0) return null;
  return ganados.reduce((a, b) => (b.threshold > a.threshold ? b : a));
}

/**
 * Cuántos cortes de esta cuenta los pagó el premio, y por lo tanto NO cuentan.
 *
 * El contador lo sube un trigger sobre `sale_items` que no pregunta quién pagó,
 * y el canje corre después de registrar la venta (si corriera antes, un cobro
 * fallido le quemaría el premio al cliente). Resultado: el corte gratis se
 * contaba solo, y el cliente arrancaba el ciclo siguiente con un crédito por un
 * corte que nunca pagó.
 *
 * La señal es el descuento contra el precio de la unidad: `promoDiscountFor`
 * elige la línea más cara que cuenta y descuenta UNA unidad topada en su
 * precio, así que el premio cubrió un corte entero solo si el descuento llegó a
 * ese precio. Un 50% no cubre nada: el cliente puso la otra mitad y ese corte
 * es suyo. Mirar el descuento y no `reward_kind` cubre de una los tres casos
 * que valen lo mismo — `gratis`, `porcentaje` de 100 y un `monto` que iguala o
 * pasa el precio.
 */
export function haircutsPaidByReward(
  discountApplied: number | null | undefined,
  lines: DiscountableLine[],
  countingServiceIds: string[],
): number {
  const descuento = discountApplied ?? 0;
  if (descuento <= 0) return 0;

  const elegibles = lines.filter((l) => l.isService && countingServiceIds.includes(l.itemId));
  if (elegibles.length === 0) return 0;

  const tope = Math.max(...elegibles.map((l) => l.unitPrice));
  if (tope <= 0) return 0;
  // Un centavo de tolerancia: los precios se redondean a dos decimales y una
  // comparación exacta contra un float dejaría el corte gratis contando.
  return descuento >= tope - 0.005 ? 1 : 0;
}

/**
 * Con cuántos cortes queda el cliente después de canjear.
 *
 * Dos reglas, y el orden entre ellas importa:
 *
 * 1. El corte que PAGÓ EL PREMIO no cuenta (`rewardedHaircuts`). Se descuenta
 *    ANTES de elegir el hito, no solo del sobrante: con hitos de 10 y 11, el
 *    corte gratis empujaba el progreso a 11 y entregaba un premio que el
 *    cliente no había ganado con cortes propios.
 * 2. El premio CONSUME su umbral y nada más: quien llegó a 11 PAGANDO y canjea
 *    uno de 10 arranca el conteo siguiente en 1. Ese corte lo hizo y lo pagó;
 *    ponerlo en cero sería cobrarle por haber vuelto antes de pasar por el
 *    mostrador.
 *
 * Descuenta el umbral ENTREGADO, no el más bajo: con hitos de 10 y 20 y un
 * progreso de 21 se entrega el de 20 y queda 1. Descontar 10 dejaría 11 y le
 * regalaría un segundo premio por el mismo mostrador.
 *
 * La cuenta autoritativa vive en `redeem_promo` (la base es la que escribe el
 * contador). Esta existe para poder DECIRLO antes de confirmar: el cajero tiene
 * que saber con qué número queda el cliente antes de apretar, no después.
 */
export function progressAfterRedeem(
  progress: number,
  milestones: PromoMilestone[],
  rewardedHaircuts = 0,
): number {
  const efectivo = Math.max(progress - rewardedHaircuts, 0);
  const hito = availableReward(efectivo, milestones);
  if (!hito) return efectivo;
  return Math.max(efectivo - hito.threshold, 0);
}

/**
 * Cómo se ANUNCIA el premio ganado dentro del mensaje.
 *
 * `{premio}` rendereaba el nombre pelado, así que al llegar al hito al cliente
 * le llegaba "...Ya llevás 10 cortes en La Barbe. Corte gratis": una etiqueta
 * colgando al final de una frase que no la presenta.
 *
 * El texto INVITA, nunca confirma. Con un hito de 10, el corte 10 es el último
 * que el cliente paga y el 11 es el premio: decirle "¡Completaste tu
 * promoción!" —como decía— se lee como si ya se lo hubiera llevado, un corte
 * antes de que pase, y hace ver el sistema disparando la promo corrida cuando
 * lo único corrido es la palabra. "Canjeaste" es del otro mensaje.
 *
 * Va acá dentro y no en cada pantalla por una razón concreta: el editor de
 * Ajustes precarga el texto por defecto y guardarlo lo CONGELA, así que mejorar
 * el default no le llega a quien ya guardó. Envolver la variable es lo único
 * que alcanza a las plantillas que ya están en la base.
 */
export const PROMO_ACHIEVED_LEAD = "🎉 ¡Ya te ganaste tu premio! En tu próxima visita te espera:";

function promoAward(reward: string | null | undefined): string {
  const premio = reward?.trim();
  if (!premio) return "";
  // Un premio que ya trae su propio cierre no lleva otro: "Corte gratis!." se
  // lee como un error de la app, no del negocio que lo escribió.
  const cierre = /[.!?…]$/.test(premio) ? "" : ".";
  return `${PROMO_ACHIEVED_LEAD} ${premio}${cierre}`;
}

/**
 * Con un solo corte, la palabra que sigue al contador va en singular.
 *
 * "Ya llevás 1 cortes" pasa en CADA reinicio de ciclo, así que no es un caso de
 * borde. Se corrige sobre la PLANTILLA y no sobre el texto ya armado por dos
 * razones: la palabra la escribe el negocio —la variable solo aporta el número,
 * y por eso no alcanza con cambiar el default—, y tocando solo la palabra pegada
 * al token no hay forma de arruinar otro "1 algo" del mensaje ("y 1 más" no se
 * vuelve "y 1 má").
 *
 * El plural en `-ces` vuelve a `-z` ("veces" → "vez"); el resto pierde la `s`.
 * No pretende ser un pluralizador del español: cubre lo que un negocio escribe
 * al lado de un contador, y una palabra ya en singular no se toca.
 */
function singularizarJuntoAl(template: string, token: string, valor: number): string {
  if (valor !== 1) return template;
  return template.replace(
    new RegExp(`\\{${token}\\}(\\s+)(\\p{L}+)`, "gu"),
    (match, espacio: string, palabra: string) => {
      if (!palabra.endsWith("s")) return match;
      const singular = palabra.endsWith("ces")
        ? `${palabra.slice(0, -3)}z`
        : palabra.slice(0, -1);
      return `{${token}}${espacio}${singular}`;
    },
  );
}

/**
 * Reemplaza las variables de la plantilla.
 *
 * Una variable sin valor se va a la cadena vacía en vez de quedar como
 * `{premio}` en el mensaje: al cliente le llegaría el nombre de la variable.
 *
 * Los valores se insertan con una función de reemplazo y no como string:
 * `String.replace` interpreta `$&`, `$'` y `$1` en el reemplazo, y el premio y
 * el nombre del negocio los escribe una persona. Un premio llamado
 * "50% off $& extra" se corrompía solo al insertarse.
 */
export function renderPromoMessage(
  template: string | null,
  vars: { cliente: string; cortes: number; negocio: string; premio?: string | null; total?: number },
): string {
  // Contador en cero = se canjeó, y mandar "Ya llevás 0 cortes" a quien acaba
  // de llevarse el premio es lo contrario de lo que un programa de fidelidad
  // tiene que decir.
  //
  // La regla del negocio es "la promoción no se puede canjear si no hay
  // cortes", y `total` —el histórico de por vida— es esa misma regla en código:
  // es lo único que separa los DOS ceros que existen, el del que acaba de
  // canjear y el del que nunca pisó el local. Sin él, a un cliente nuevo se le
  // anuncia un premio que no existió.
  //
  // Va acá y no en cada pantalla: el mensaje sale del POS, de Clientes y de
  // Promociones, y arreglar una sola fue lo que dejó el problema vivo.
  if (vars.cortes === 0 && (vars.total ?? 0) > 0) {
    return renderRedeemMessage(null, {
      cliente: vars.cliente,
      negocio: vars.negocio,
      // Desde Clientes y Promociones no se sabe cuál se entregó; el POS sí, y
      // por eso llama a `renderRedeemMessage` directo con el premio en la mano.
      premio: vars.premio,
      total: vars.total,
    });
  }

  const total = vars.total ?? vars.cortes;
  const base = singularizarJuntoAl(
    singularizarJuntoAl(template?.trim() || DEFAULT_PROMO_MESSAGE, "cortes", vars.cortes),
    "total",
    total,
  );
  const literal = (valor: string) => () => valor;
  return base
    .replace(/\{cliente\}/g, literal(vars.cliente))
    .replace(/\{total\}/g, literal(String(vars.total ?? vars.cortes)))
    .replace(/\{cortes\}/g, literal(String(vars.cortes)))
    .replace(/\{negocio\}/g, literal(vars.negocio))
    .replace(/\{premio\}/g, literal(promoAward(vars.premio)))
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

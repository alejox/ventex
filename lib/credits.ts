/**
 * Fiado: la plata que ya salió del mostrador y todavía no entró a la caja.
 *
 * El saldo vive en `customers.credit_balance` y lo escribe la base —`create_sale`
 * lo sube al fiar, `register_customer_payment` lo baja al cobrar, `void_sale` lo
 * devuelve al anular—. Acá no hay ninguna cuenta que altere ese número: solo se
 * decide cómo se LEE, para que la lista, el chip y el resumen de la cabecera no
 * puedan contarlo de tres maneras distintas.
 */

/** A cuánto del cupo hay que empezar a avisar. */
const CUPO_WARN = 0.8;

const money = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

/**
 * En qué situación está la cuenta de un cliente.
 *
 * `cerca_del_cupo` existe porque hoy el cajero se entera de que no puede fiar
 * cuando `create_sale` le tira el error con el cliente enfrente. Ese aviso
 * llega tarde: en la lista de deudores llega a tiempo.
 */
export type CreditStatus = "al_dia" | "debe" | "cerca_del_cupo" | "excedido";

/**
 * `limit` en `null` significa "no le puse tope", no "tope cero".
 *
 * Confundir las dos cosas dejaría en rojo a todo cliente al que nunca se le
 * configuró un cupo, que son casi todos: el campo es opcional.
 */
export function creditStatusOf(balance: number, limit: number | null): CreditStatus {
  if (!Number.isFinite(balance) || balance <= 0) return "al_dia";
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return "debe";
  // `create_sale` rechaza cuando (saldo + total) supera el cupo, así que con el
  // cupo justo clavado ya no entra ninguna venta más: eso es lleno, no "cerca".
  if (balance >= limit) return "excedido";
  return balance >= limit * CUPO_WARN ? "cerca_del_cupo" : "debe";
}

/**
 * Cuánto más se le puede fiar. `null` = sin tope configurado.
 *
 * Devolver 0 o Infinity para el cliente sin cupo sería contestar una pregunta
 * que nadie hizo: no hay número porque no hay tope.
 */
export function creditAvailable(balance: number, limit: number | null): number | null {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return null;
  return Math.max(0, limit - Math.max(0, balance));
}

/** Lo que se le muestra a quien cobra: el estado CON el número. */
export function creditLabelOf(balance: number, limit: number | null): string {
  switch (creditStatusOf(balance, limit)) {
    case "al_dia":
      return "Al día";
    case "excedido":
      return `Excedido $${money(balance - (limit ?? 0))} sobre el cupo`;
    case "cerca_del_cupo":
      return `Debe $${money(balance)} de $${money(limit ?? 0)}`;
    default:
      return `Debe $${money(balance)}`;
  }
}

/** Clases del chip. Incluyen el borde, así que el consumidor pone `border`. */
export const CREDIT_CHIP: Record<CreditStatus, string> = {
  al_dia: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20",
  debe: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
  cerca_del_cupo: "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30",
  excedido: "bg-error/10 text-error border-error/30",
};

export const CREDIT_DOT: Record<CreditStatus, string> = {
  al_dia: "bg-[#10b981]",
  debe: "bg-[#f59e0b]",
  cerca_del_cupo: "bg-[#f59e0b]",
  excedido: "bg-error",
};

export interface CreditSummary {
  /** Toda la plata que el negocio tiene en la calle. */
  totalPorCobrar: number;
  /** Cuántos clientes deben algo. */
  deudores: number;
  /** Cuántos ya no pueden fiar más. */
  excedidos: number;
}

/**
 * El resumen de la cabecera, calculado sobre LAS MISMAS filas que se listan.
 *
 * Un total que se pide por separado es un total que puede contradecir a la
 * tabla que tiene debajo — y el que cobra le cree al que sea más grande.
 */
export function creditSummary(
  rows: { credit_balance: number; credit_limit: number | null }[],
): CreditSummary {
  let totalPorCobrar = 0;
  let deudores = 0;
  let excedidos = 0;
  for (const row of rows) {
    const status = creditStatusOf(row.credit_balance, row.credit_limit);
    if (status === "al_dia") continue;
    totalPorCobrar += row.credit_balance;
    deudores += 1;
    if (status === "excedido") excedidos += 1;
  }
  return { totalPorCobrar: Math.round(totalPorCobrar * 100) / 100, deudores, excedidos };
}

/**
 * El monto de un abono, o `null` si lo escrito todavía no es uno.
 *
 * Un abono MAYOR a la deuda se rechaza en vez de recortarse. El
 * `greatest(saldo - abono, 0)` que ya vive en la base evita el saldo negativo,
 * pero recortar en silencio registraría en `customer_payments` una plata que no
 * es la que bajó del saldo: el historial dejaría de cuadrar con la cuenta.
 * Cobrar de más es un error de tipeo, y se avisa.
 */
export function paymentAmountOf(raw: string, balance: number): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  if (!/^-?\d*\.?\d+$/.test(text)) return null;
  const amount = Math.round(Number(text) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount > balance) return null;
  return amount;
}

/**
 * El aviso interno de la ficha: "no fiar", "solo de contado", lo que el dueño
 * escriba.
 *
 * Es una NOTA DEL MOSTRADOR, no del cliente: no viaja en ningún mensaje que se
 * le mande (ver `renderStatementMessage`). Y no bloquea la venta — el cupo sí lo
 * hace, desde `create_sale`; esto avisa. Que sean dos cosas distintas es
 * deliberado: el dueño quiere poder marcar a alguien sin cerrarle la puerta.
 */
export const CREDIT_ALERT_DEFAULT = "No fiar";

export function creditAlertText(note: string | null | undefined): string {
  return (note ?? "").trim() || CREDIT_ALERT_DEFAULT;
}

/** Cuántos movimientos entran por sección antes de resumir el resto. */
export const STATEMENT_MAX_LINES = 5;

export interface StatementSale {
  sale_number: number;
  created_at: string;
  credit_amount: number;
}

export interface StatementPayment {
  created_at: string;
  amount: number;
}

export interface StatementInput {
  /** Solo el nombre de pila: el mensaje es un WhatsApp, no una carta. */
  cliente: string;
  negocio: string;
  balance: number;
  sales: StatementSale[];
  payments: StatementPayment[];
  /**
   * Inyectable para poder testear sin depender de la zona horaria del proceso.
   * El default es el que ve el cliente.
   */
  formatDate?: (iso: string) => string;
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

/**
 * Arma una sección del detalle, o nada si no hay qué listar.
 *
 * Un encabezado seguido de nada le hace creer al cliente que le falta
 * información; se omite entero.
 */
function seccion(titulo: string, lineas: string[], sobrantes: number): string[] {
  if (lineas.length === 0) return [];
  const cola = sobrantes > 0 ? [`…y ${sobrantes} más.`] : [];
  return ["", titulo, ...lineas, ...cola];
}

/**
 * El estado de cuenta que el negocio le manda al cliente por WhatsApp.
 *
 * Tres decisiones que no son de formato:
 *
 * 1. **El aviso interno no está en la firma.** No se puede filtrar por
 *    descuido lo que la función no puede recibir: enterarse de que lo marcaron
 *    "no fiar" por un mensaje automático es la peor versión posible de esa
 *    conversación.
 * 2. **Sin deuda no se manda un cobro.** Al que terminó de pagar se le
 *    confirma que está al día: es un comprobante, y es justo el mensaje que
 *    hace que vuelva a fiar tranquilo. Mostrarle "Debe $0" lee como reclamo.
 * 3. **El detalle se corta.** Un cliente con veinte fiados recibiría un muro
 *    de texto que nadie lee, y el número que importa —el saldo— quedaría
 *    enterrado. Se listan los más recientes y se dice cuántos faltan.
 *
 * El saldo se imprime tal como lo tiene la base. Acá no se recalcula sumando
 * el detalle: si alguna vez no coincidieran, el que manda es el saldo, y una
 * cuenta armada a mano en el mensaje taparía justo esa diferencia.
 */
export function renderStatementMessage(input: StatementInput): string {
  const fecha = input.formatDate ?? fechaCorta;
  const debe = Number.isFinite(input.balance) && input.balance > 0;

  const ventas = input.sales.slice(0, STATEMENT_MAX_LINES).map(
    (s) => `• #${s.sale_number} · ${fecha(s.created_at)} · $${money(s.credit_amount)}`,
  );
  const abonos = input.payments.slice(0, STATEMENT_MAX_LINES).map(
    (p) => `• ${fecha(p.created_at)} · $${money(p.amount)}`,
  );

  const encabezado = debe
    ? [
        `Hola ${input.cliente} 👋`,
        `Te paso tu estado de cuenta en ${input.negocio}.`,
        "",
        `Saldo pendiente: $${money(input.balance)}`,
      ]
    : [
        `Hola ${input.cliente} 👋`,
        `Tu cuenta en ${input.negocio} está al día. ¡Gracias! 🙌`,
      ];

  return [
    ...encabezado,
    ...seccion(
      "Se llevó fiado:",
      ventas,
      Math.max(0, input.sales.length - STATEMENT_MAX_LINES),
    ),
    ...seccion(
      "Abonos:",
      abonos,
      Math.max(0, input.payments.length - STATEMENT_MAX_LINES),
    ),
  ]
    .join("\n")
    .trim();
}

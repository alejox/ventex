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

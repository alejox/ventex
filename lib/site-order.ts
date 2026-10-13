/**
 * Pedido del sitio público de tienda: el visitante arma una lista de productos
 * y la manda al negocio por WhatsApp. Nada de esto llega a la base: no hay
 * checkout, ni reserva de stock, ni pago — el pedido existe solo en el mensaje,
 * y lo confirma una persona del otro lado (ver odd/tasks/tienda-website.md).
 *
 * Todo es puro e inmutable para poder probarlo sin navegador ni React.
 */

import { addMoney, fromCents, toCents } from "@/lib/money-sum";
import { whatsappLink } from "@/lib/whatsapp";

/** Tope por línea: un pedido de WhatsApp no es una compra mayorista. */
export const MAX_LINE_QTY = 99;

export interface OrderLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface OrderableProduct {
  id: string;
  name: string;
  price: number;
}

/** Cantidades enteras entre 0 y el tope: "2,7 bolsas" no se pide por chat. */
function wholeQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  return Math.min(MAX_LINE_QTY, Math.max(0, Math.floor(qty)));
}

/** Suma `qty` unidades; si el producto ya está, acumula sobre su línea. */
export function addToOrder(order: OrderLine[], product: OrderableProduct, qty = 1): OrderLine[] {
  const existing = order.find((line) => line.productId === product.id);
  if (existing) return setOrderQty(order, product.id, existing.qty + wholeQty(qty));
  const next = wholeQty(qty);
  if (next === 0) return order;
  return [...order, { productId: product.id, name: product.name, unitPrice: product.price, qty: next }];
}

/** Fija la cantidad de una línea; 0 o menos la quita. Un id que no está no cambia nada. */
export function setOrderQty(order: OrderLine[], productId: string, qty: number): OrderLine[] {
  if (!order.some((line) => line.productId === productId)) return order;
  const next = wholeQty(qty);
  if (next === 0) return removeFromOrder(order, productId);
  return order.map((line) => (line.productId === productId ? { ...line, qty: next } : line));
}

export function removeFromOrder(order: OrderLine[], productId: string): OrderLine[] {
  return order.filter((line) => line.productId !== productId);
}

/** Unidades en total (el número del botón flotante). */
export function orderCount(order: OrderLine[]): number {
  return order.reduce((count, line) => count + line.qty, 0);
}

function lineTotal(line: OrderLine): number {
  return fromCents(toCents(line.unitPrice) * line.qty);
}

/** Total en centavos enteros, nunca sumando floats. */
export function orderTotal(order: OrderLine[]): number {
  return order.reduce((total, line) => addMoney(total, lineTotal(line)), 0);
}

export interface OrderMessageInput {
  businessName: string;
  lines: OrderLine[];
  formatMoney: (amount: number) => string;
  customerName?: string | null;
  notes?: string | null;
}

/** El texto que se abre en WhatsApp. Nombre y nota solo si se escribieron. */
export function buildOrderMessage({ businessName, lines, formatMoney, customerName, notes }: OrderMessageInput): string {
  const parts = [
    `Hola ${businessName}, quiero hacer este pedido:`,
    "",
    ...lines.map((line) => `• ${line.qty} × ${line.name} — ${formatMoney(lineTotal(line))}`),
    "",
    `Total: ${formatMoney(orderTotal(lines))}`,
  ];
  const name = customerName?.trim();
  const note = notes?.trim();
  if (name || note) parts.push("");
  if (name) parts.push(`Nombre: ${name}`);
  if (note) parts.push(`Nota: ${note}`);
  return parts.join("\n");
}

/** null = el negocio no tiene un WhatsApp usable: el sitio no ofrece pedir. */
export function orderWhatsappLink(phone: string | null, message: string): string | null {
  return whatsappLink(phone, message);
}

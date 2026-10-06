import type { CustomerImpact } from "@/services/customers.service";

/** Filtro "Con deuda": solo quien tiene saldo por cobrar. */
export function filterCustomersByDebt<T extends { credit_balance: number | null }>(
  customers: T[],
  onlyWithDebt: boolean,
): T[] {
  return onlyWithDebt ? customers.filter((c) => Number(c.credit_balance ?? 0) > 0) : customers;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Qué arrastra borrar el cliente, en frases para el diálogo. Solo lo que
 * existe: "0 abonos se borrarán" es ruido.
 */
export function customerImpactLines(impact: CustomerImpact): string[] {
  const lines: string[] = [];
  if (impact.sales > 0) {
    lines.push(`${plural(impact.sales, "venta quedará", "ventas quedarán")} sin cliente (el historial de ventas se conserva).`);
  }
  if (impact.payments > 0) {
    lines.push(`${plural(impact.payments, "abono se borrará", "abonos se borrarán")} junto con el cliente.`);
  }
  if (impact.appointments > 0) {
    lines.push(`${plural(impact.appointments, "cita quedará", "citas quedarán")} sin cliente.`);
  }
  if (impact.vehicles > 0) {
    lines.push(`${plural(impact.vehicles, "vehículo quedará", "vehículos quedarán")} sin dueño.`);
  }
  return lines;
}

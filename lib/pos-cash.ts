/**
 * Efectivo en el mostrador: billetes sugeridos al cobrar (C9), "vacío = pago
 * exacto" (C8) y el contador por denominación del cierre de turno (C21).
 *
 * Lógica pura —sin React, sin store— para testearla sin montar nada
 * (`tests/pos-cash.test.ts`). Las denominaciones son las de Colombia: quien
 * llama decide mostrarlas solo cuando la moneda del negocio es COP.
 */

/** Billetes COP en circulación, de mayor a menor. */
export const COP_BILLS = [100000, 50000, 20000, 10000, 5000, 2000, 1000] as const;
/** Monedas COP en circulación, de mayor a menor (la de 1.000 convive con el billete). */
export const COP_COINS = [1000, 500, 200, 100, 50] as const;

/** Montos de los botones que SUMAN a lo recibido ("+$2.000"). */
export const COP_ADD_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000] as const;

/**
 * Billetes con los que se suele pagar un total: el total redondeado hacia
 * arriba a cada billete, sin repetir y sin el valor exacto (para eso está
 * "Valor exacto"). 37.500 → 40.000, 50.000, 100.000.
 *
 * Los billetes chicos (1.000 y 2.000) solo redondean totales menores a 5.000:
 * para 37.500 nadie paga "38.000", y sugerirlo empuja las opciones útiles
 * fuera de la fila.
 */
export function suggestedCashAmounts(total: number, max = 4): number[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  const bills = total < 5000 ? [...COP_BILLS] : COP_BILLS.filter((b) => b >= 5000);
  const amounts = new Set<number>();
  for (const bill of [...bills].sort((a, b) => a - b)) {
    // Tolerancia de centavos: 40.000,0000001 no puede sugerir 45.000.
    const rounded = Math.ceil(total / bill - 1e-9) * bill;
    if (rounded > total + 0.005) amounts.add(rounded);
  }
  return Array.from(amounts).sort((a, b) => a - b).slice(0, Math.max(max, 0));
}

/**
 * Lo recibido que vale para el cobro. El campo vacío es "me pagó exacto" (C8):
 * obligar a escribir el total para un pago justo era el paso más repetido del
 * día. Cualquier otra cosa escrita se respeta tal cual, aunque no alcance —la
 * validación de "faltan" es de quien llama—.
 */
export function effectiveTendered(amountTendered: string, total: number): string {
  return amountTendered.trim() === "" ? String(total) : amountTendered;
}

/** Una denominación del contador de cierre. `id` es único aunque el valor se repita. */
export interface CashDenomination {
  id: string;
  value: number;
  kind: "billete" | "moneda";
}

export const COP_DENOMINATIONS: CashDenomination[] = [
  ...COP_BILLS.map((value) => ({ id: `b${value}`, value, kind: "billete" as const })),
  ...COP_COINS.map((value) => ({ id: `m${value}`, value, kind: "moneda" as const })),
];

/**
 * Cantidad de piezas escritas en el contador. Vacío o basura = 0; solo
 * enteros no negativos (no existe medio billete).
 */
export function parseDenominationCount(raw: string): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Suma del contador: Σ cantidad × valor. */
export function sumDenominationCounts(
  counts: Record<string, string | number>,
  denominations: CashDenomination[] = COP_DENOMINATIONS,
): number {
  let total = 0;
  for (const d of denominations) {
    const raw = counts[d.id];
    const qty = typeof raw === "number" ? Math.max(Math.floor(raw), 0) : parseDenominationCount(raw ?? "");
    total += qty * d.value;
  }
  return Math.round(total * 100) / 100;
}

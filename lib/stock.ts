/**
 * Estado de stock de un producto, en un solo lugar para que la tabla de
 * escritorio, las tarjetas de móvil y el POS no puedan divergir.
 *
 * El stock negativo existe: con `allow_oversell` encendido el POS deja vender
 * sin unidades. Eso NO es "stock bajo" —es una deuda de inventario—, así que
 * tiene su propio estado, su color de error y su etiqueta.
 */
export type StockStatus = "oversold" | "out" | "low" | "optimal";

/** Umbral por debajo del cual se considera stock bajo. */
export const LOW_STOCK_THRESHOLD = 5;

export function stockStatusOf(level: number): StockStatus {
  if (level < 0) return "oversold";
  if (level === 0) return "out";
  if (level <= LOW_STOCK_THRESHOLD) return "low";
  return "optimal";
}

export function stockLabelOf(level: number): string {
  switch (stockStatusOf(level)) {
    case "oversold":
      return `Sobrevendido (${level})`;
    case "out":
      return "Agotado";
    case "low":
      return `Stock bajo (${level})`;
    default:
      return `${level} en stock`;
  }
}

/** Clases del chip. Incluyen el borde, así que el consumidor pone `border`. */
export const STOCK_CHIP: Record<StockStatus, string> = {
  optimal: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20",
  low: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
  out: "bg-error-container/20 text-error-dim border-error-container/30",
  oversold: "bg-error/10 text-error border-error/30",
};

export const STOCK_DOT: Record<StockStatus, string> = {
  optimal: "bg-[#10b981]",
  low: "bg-[#f59e0b]",
  out: "bg-error",
  oversold: "bg-error",
};

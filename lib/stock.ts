import { isServiceItem } from "@/services/inventory.service";

/**
 * Estado de stock de un producto, en un solo lugar para que la tabla de
 * escritorio, las tarjetas de móvil, el Panel, Pedidos y el POS no puedan
 * divergir.
 *
 * Llegaron a convivir SEIS definiciones distintas de "stock bajo": un umbral
 * fijo de 5 en Inventario, `<= minimum_stock` en el Panel y en Compras, y
 * `< minimum_stock` en Pedidos y en abastecimiento. El KPI de Inventario decía
 * 0 mientras el Panel listaba tres productos por reponer. Un comerciante que
 * confiara en el contador nunca se enteraba de que estaba por quedarse sin
 * mercadería.
 *
 * La medida es el `minimum_stock` que el negocio configuró producto por
 * producto. Un umbral fijo ignora que 5 unidades es mucho para un televisor y
 * nada para una caja de gaseosas.
 *
 * El stock negativo existe: con `allow_oversell` encendido el POS deja vender
 * sin unidades. Eso NO es "stock bajo" —es una deuda de inventario—, así que
 * tiene su propio estado, su color de error y su etiqueta.
 */
export type StockStatus = "oversold" | "out" | "low" | "optimal";

/**
 * `minimumStock` es el mínimo configurado del producto.
 *
 * En 0 significa "no llevo mínimo para esto", y entonces el estado `low` no
 * aplica: sin ese corte, todo producto sin mínimo caía en `level <= minimum` y
 * además rompía la división por cero al ordenar las sugerencias de reposición.
 */
export function stockStatusOf(level: number, minimumStock: number): StockStatus {
  if (level < 0) return "oversold";
  if (level === 0) return "out";
  if (minimumStock > 0 && level <= minimumStock) return "low";
  return "optimal";
}

/**
 * El ÚNICO predicado de "stock bajo" de la aplicación. Lo usan el KPI y el
 * filtro de Inventario, el widget del Panel y las sugerencias de reposición,
 * para que los tres números no puedan contradecirse otra vez.
 *
 * Incluye el agotado y el sobrevendido a propósito: cero unidades de un
 * producto con mínimo 10 está por debajo del mínimo, y es MÁS urgente que estar
 * en 7, no menos. "Agotado" sigue existiendo como filtro para bajar el detalle.
 *
 * Un servicio nunca entra: no tiene existencias que reponer.
 */
export function needsRestock(product: {
  stock_level: number;
  minimum_stock: number;
  unit?: string | null;
}): boolean {
  if (isServiceItem(product)) return false;
  return stockStatusOf(product.stock_level, product.minimum_stock) !== "optimal";
}

export function stockLabelOf(level: number, minimumStock: number): string {
  switch (stockStatusOf(level, minimumStock)) {
    case "oversold":
      return `Sobrevendido (${level})`;
    case "out":
      return "Agotado";
    case "low":
      // Contra qué mínimo se está comparando: "Stock bajo (7)" no dice si
      // faltan 3 unidades o 300.
      return `Stock bajo (${level}/${minimumStock})`;
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

/**
 * Chip de un ítem que NO lleva inventario (un servicio).
 *
 * Tiene color propio a propósito: un servicio no está "agotado" ni "óptimo",
 * simplemente no tiene existencias. Pintarlo con cualquiera de los cuatro
 * estados de stock sería afirmar algo falso sobre él.
 */
export const SERVICE_CHIP = "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20";

export const STOCK_DOT: Record<StockStatus, string> = {
  optimal: "bg-[#10b981]",
  low: "bg-[#f59e0b]",
  out: "bg-error",
  oversold: "bg-error",
};

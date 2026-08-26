import { tracksStock } from "@/services/inventory.service";

// `tracksStock` vive junto a `isServiceItem` —en la capa que conoce el catálogo—
// y se reexporta acá porque este es el módulo al que pregunta todo lo que
// muestra o limita stock. Definirlo de los dos lados sería tener dos reglas.
export { tracksStock };

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
 * Lo que no lleva inventario nunca entra: no tiene existencias que reponer.
 */
export function needsRestock(product: {
  stock_level: number;
  minimum_stock: number;
  unit?: string | null;
  tracks_stock?: boolean | null;
}): boolean {
  if (!tracksStock(product)) return false;
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
 * Chip de un ítem que NO lleva inventario (un servicio, o un producto marcado
 * como tal).
 *
 * Tiene color propio a propósito: no está "agotado" ni "óptimo", simplemente no
 * tiene existencias. Pintarlo con cualquiera de los cuatro estados de stock
 * sería afirmar algo falso sobre él.
 */
export const SERVICE_CHIP = "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20";

/** Lo que se muestra en lugar del conteo cuando no hay inventario que contar. */
export const NO_STOCK_LABEL = "Sin inventario";

export const STOCK_DOT: Record<StockStatus, string> = {
  optimal: "bg-[#10b981]",
  low: "bg-[#f59e0b]",
  out: "bg-error",
  oversold: "bg-error",
};

/**
 * En qué está expresada la cantidad de un movimiento de stock.
 *
 * El stock SIEMPRE vive en unidades sueltas: `products.stock_level` cuenta
 * unidades y la venta descuenta unidades. La caja es solo la forma en que el
 * comerciante habla ("me entraron 3 cajas"), y la conversión ocurre acá, una
 * sola vez, antes de tocar el conteo.
 *
 * Existe porque hasta ahora no había elección: el movimiento manual multiplicaba
 * SIEMPRE por `units_per_package`, así que en un producto que viene de a 24 no
 * había manera de cargar 5 unidades sueltas — entraban 120.
 */
export type StockUnitMode = "unit" | "package";

/**
 * Precisión con la que la base guarda una cantidad: `numeric(12,3)`.
 *
 * Redondear acá y no al mostrar es lo que evita que 0.1 + 0.2 termine escrito
 * como 0.30000000000000004 — un número que nadie tecleó y que ninguna lectura
 * posterior va a poder igualar.
 */
export const QTY_DECIMALS = 3;

/** Cantidad normalizada a la precisión de la base. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Cómo se escribe una cantidad para una persona.
 *
 * `numeric(12,3)` vuelve como "2.000", y "2.000 unidades" en la vitrina de un
 * producto que se vende de a uno se lee como dos mil. Los ceros de relleno se
 * caen; los decimales que significan algo se quedan.
 */
export function formatQty(quantity: number): string {
  if (!Number.isFinite(quantity)) return "0";
  return String(round3(quantity));
}

/**
 * Si esta cantidad se puede vender o mover.
 *
 * `allowsFractions` sale del producto —lo decide su unidad de medida, no una
 * preferencia—: medio kilo de papa es una venta, media unidad de un televisor
 * es un error de tipeo.
 */
export function quantityIsValid(quantity: number, allowsFractions: boolean): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  return allowsFractions || Number.isInteger(quantity);
}

/**
 * Qué cantidad significa lo que hay ESCRITO en el campo, mientras se escribe.
 *
 * Devuelve `null` cuando el texto todavía no es una cantidad — y el vacío es el
 * caso principal, no un error: borrar para escribir otro número es el paso
 * normal de editar. Un input controlado que rechaza el vacío repone el valor
 * anterior y deja el cursor pegado a él, así que el dígito nuevo se suma al
 * viejo en vez de reemplazarlo: 1 + "2" = 12.
 *
 * La coma entra como separador decimal porque es la que trae el teclado de
 * quien vende acá; `parseFloat("1,5")` devuelve 1 y cobraría un kilo entero de
 * papa por medio. El redondeo es el de la base (`numeric(12,3)`): lo que no
 * entra en la columna no puede quedar en el carrito.
 */
export function parseQuantityDraft(raw: string, allowsFractions: boolean): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  if (!/^-?\d*\.?\d+$/.test(text)) return null;
  const quantity = round3(Number(text));
  return quantityIsValid(quantity, allowsFractions) ? quantity : null;
}

/** Unidades por caja utilizables: nunca 0, o el movimiento se anularía. */
function packSize(unitsPerPackage: number | null | undefined): number {
  const n = Number(unitsPerPackage);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Unidades sueltas que mueve una cantidad expresada en `mode`.
 *
 * Una cantidad que no es un entero positivo devuelve 0: media caja no es un
 * movimiento, y dejarla pasar escribiría un stock fraccionario en una columna
 * de enteros.
 */
export function movementUnits(
  quantity: number,
  mode: StockUnitMode,
  unitsPerPackage: number | null | undefined,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return round3(mode === "package" ? quantity * packSize(unitsPerPackage) : quantity);
}

/**
 * Stock que queda tras aplicar un movimiento, en unidades sueltas.
 *
 * `units` ya viene convertido: la conversión de cajas a unidades ocurre una vez,
 * al leer los campos, y de ahí en adelante todo el sistema habla en unidades.
 *
 * `adjust` NO es un delta: reemplaza el conteo. Por eso el 0 es un valor
 * legítimo —así se registra un producto agotado—, mientras que la entrada y la
 * salida en 0 no mueven nada.
 *
 * La salida en exceso devuelve el negativo en vez de recortarlo a cero: la base
 * la rechaza con STOCK_INSUFICIENTE, y la UI necesita ver el número real para
 * avisar ANTES de enviar.
 */
export function applyMovement(
  current: number,
  type: "in" | "out" | "adjust",
  units: number,
): number {
  if (type === "adjust") return round3(units);
  return round3(type === "in" ? current + units : current - units);
}

/**
 * Cantidad no negativa de un campo de formulario. Vacío y basura valen 0.
 *
 * `parseFloat` y no `parseInt`: lo que se vende por peso se carga por peso, y
 * `parseInt("0.75")` es 0 — el medio kilo desaparecía sin un solo aviso.
 */
function countOf(raw: string | null | undefined): number {
  const n = parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Unidades sueltas que representan unas cajas MÁS un resto suelto.
 *
 * Es la cuenta de todo ingreso de mercadería del sistema —el alta del producto,
 * la entrada desde la ficha y el ajuste manual—, porque así es como llega la
 * mercadería: "me entraron 2 cajas y 20 unidades".
 *
 * `unitsPerPackageRaw` NO aporta stock por sí solo: describe el empaque, no la
 * mercadería. Sin cajas cargadas no multiplica nada, y un producto definido como
 * caja de 24 al que se le cargan 23 unidades tiene 23, no 47.
 */
export function stockUnitsOf(
  packagesRaw: string,
  looseUnitsRaw: string,
  unitsPerPackageRaw: string,
): number {
  return round3(
    movementUnits(countOf(packagesRaw), "package", countOf(unitsPerPackageRaw)) +
    movementUnits(countOf(looseUnitsRaw), "unit", 1),
  );
}

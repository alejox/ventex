import { totalUnitsOf } from "@/services/purchases.service";

/**
 * Validación del formulario de compra (D5). Pura y testeada.
 *
 * Antes el botón Guardar se deshabilitaba sin decir por qué, y al guardar se
 * DESCARTABAN en silencio las líneas incompletas. Ahora el botón siempre está
 * activo, y al enviar cada problema vuelve con su lugar: un error por campo y
 * uno por línea ("Línea 3: falta cantidad"), más el id del primero para
 * llevarle el foco.
 */

export interface PurchaseLineDraft {
  product_id: string;
  package_quantity: number;
  loose_quantity: number;
  unit_price: number;
  package_price: number;
  units_per_package: number;
}

export interface PurchaseFormDraft {
  supplierNumber: string;
  distributorId: string;
  issueDate: string;
  dueDate: string;
  /** Tal como está en el campo (texto). */
  discount: string;
  /** Subtotal + impuesto, para no permitir un descuento mayor que la compra. */
  grossTotal: number;
  lines: PurchaseLineDraft[];
}

export interface LineErrors {
  product?: string;
  quantity?: string;
  cost?: string;
}

export interface PurchaseFormErrors {
  supplierNumber?: string;
  distributor?: string;
  issueDate?: string;
  dueDate?: string;
  discount?: string;
  /** Por índice de línea (0-based). */
  lines: Record<number, LineErrors>;
  /** Todos los mensajes, en el orden de la pantalla, para el resumen. */
  messages: string[];
  /** Id del primer campo con error (para llevarle el foco), o null si no hay errores. */
  firstFieldId: string | null;
}

/** Ids de los campos de una línea; los usa el formulario en sus inputs. */
export const lineFieldId = (idx: number, field: "product" | "qty" | "cost" | "boxcost") => `purchase-line-${idx}-${field}`;

export const FIELD_IDS = {
  supplierNumber: "supplier-number",
  issueDate: "issue-date",
  distributor: "purchase-distributor",
  dueDate: "due-date",
  discount: "purchase-discount",
} as const;

const badMoney = (n: number) => !Number.isFinite(n) || n < 0;

export function validatePurchaseForm(draft: PurchaseFormDraft): PurchaseFormErrors {
  const errors: PurchaseFormErrors = { lines: {}, messages: [], firstFieldId: null };
  const mark = (id: string, message: string) => {
    errors.messages.push(message);
    errors.firstFieldId ??= id;
  };

  if (!draft.supplierNumber.trim()) {
    errors.supplierNumber = "Escribe el número de la factura del proveedor.";
    mark(FIELD_IDS.supplierNumber, errors.supplierNumber);
  }
  if (!draft.issueDate) {
    errors.issueDate = "Elige la fecha de compra.";
    mark(FIELD_IDS.issueDate, errors.issueDate);
  }
  if (!draft.distributorId) {
    errors.distributor = "Elige el proveedor.";
    mark(FIELD_IDS.distributor, errors.distributor);
  }
  if (draft.dueDate && draft.issueDate && draft.dueDate < draft.issueDate) {
    errors.dueDate = "El vencimiento no puede ser antes de la fecha de compra.";
    mark(FIELD_IDS.dueDate, errors.dueDate);
  }

  const onlyLine = draft.lines.length === 1;
  draft.lines.forEach((line, idx) => {
    const n = idx + 1;
    const le: LineErrors = {};
    if (!line.product_id) {
      le.product = onlyLine
        ? "Agrega al menos un producto."
        : `Línea ${n}: elige un producto o quita la línea.`;
      mark(lineFieldId(idx, "product"), le.product);
    } else {
      const units = totalUnitsOf(line);
      if (!Number.isFinite(units) || units <= 0) {
        le.quantity = `Línea ${n}: falta cantidad.`;
        mark(lineFieldId(idx, "qty"), le.quantity);
      }
      const unitCostUsed = line.loose_quantity > 0 && badMoney(line.unit_price);
      const boxCostUsed = line.package_quantity > 0 && badMoney(line.package_price);
      if (unitCostUsed || boxCostUsed) {
        le.cost = `Línea ${n}: el costo no es válido.`;
        mark(lineFieldId(idx, unitCostUsed ? "cost" : "boxcost"), le.cost);
      }
    }
    if (le.product || le.quantity || le.cost) errors.lines[idx] = le;
  });

  const discount = draft.discount.trim() === "" ? 0 : Number(draft.discount);
  if (!Number.isFinite(discount) || discount < 0) {
    errors.discount = "El descuento debe ser un número igual o mayor que cero.";
    mark(FIELD_IDS.discount, errors.discount);
  } else if (discount > draft.grossTotal && draft.grossTotal > 0) {
    errors.discount = "El descuento no puede superar el total de la compra.";
    mark(FIELD_IDS.discount, errors.discount);
  }

  return errors;
}

export const hasErrors = (e: PurchaseFormErrors) => e.firstFieldId !== null;

/**
 * D14: "Última compra" sobre un formulario que ya tiene líneas.
 *
 * - `replace` deja SOLO las de la última compra.
 * - `append` las suma después de las que hay, descartando únicamente las filas
 *   en blanco (sin producto), que no son trabajo de nadie.
 */
export function applyLastPurchase<L extends { product_id: string }>(
  current: L[],
  incoming: L[],
  mode: "replace" | "append",
): L[] {
  if (mode === "replace" || incoming.length === 0) return incoming.length ? incoming : current;
  return [...current.filter((l) => l.product_id), ...incoming];
}

/** ¿Hay algo cargado que se perdería al reemplazar? */
export const hasFilledLines = (lines: { product_id: string }[]) => lines.some((l) => l.product_id);

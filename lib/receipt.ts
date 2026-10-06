/**
 * Datos del comprobante (pre-factura) que imprime `components/PosReceipt.tsx`.
 *
 * Hay DOS maneras de llegar a un recibo y las dos tienen que dar el mismo
 * papel:
 *
 * - `buildReceiptFromCart`: recién cobrada en el POS. Sale del carrito que se
 *   acaba de cobrar (el store ya lo limpió, así que la pantalla lo captura
 *   ANTES de cobrar) más lo que solo existe después de `sold`: el id de la
 *   venta y, cuando llega, su número.
 * - `buildReceiptFromSale`: reimpresión de una venta guardada (POS → "Últimas
 *   ventas", o Ventas). Sale de `fetchSaleDetail` + `fetchSaleReceiptExtras`.
 *
 * Son funciones puras —sin red, sin `Date.now()` escondido— para poder
 * testearlas (`tests/receipt.test.ts`) y reusarlas desde otras pantallas.
 */
import type { SaleTotals, CartLine, PaymentMethod, PaymentSplit } from "@/services/pos.service";
import type { SaleDetail, SaleReceiptExtras } from "@/services/sales.service";
import { getTransferMethodName } from "@/config/transferMethods";
import { getCardMethodName } from "@/config/cardMethods";

export interface ReceiptItem {
  name: string;
  sku: string | null;
  quantity: number;
  /** "Caja x24 u." cuando la línea es una caja; null si es unidad suelta. */
  packageLabel: string | null;
  /** Precio unitario de vitrina. */
  unitPrice: number;
  /** Precio × cantidad, ANTES del descuento de la línea. */
  gross: number;
  /** Descuento aplicado a ESTA línea (oferta, premio, puntos o manual). */
  discount: number;
  /** Por qué bajó: el nombre de la oferta, si vino de una. */
  discountLabel: string | null;
  /** Lo que de verdad se cobró por la línea: `gross - discount`. */
  total: number;
}

export interface ReceiptCustomer {
  full_name: string;
  doc_type: string | null;
  identification: string | null;
}

export interface ReceiptPayment {
  /** Texto listo para imprimir: "Transferencia (Nequi)". */
  label: string;
  amount: number;
}

export interface ReceiptBusiness {
  businessName?: string | null;
  logoUrl?: string | null;
  municipality?: string | null;
  phone?: string | null;
  taxResponsibility?: string | null;
}

export interface ReceiptData extends ReceiptBusiness {
  /** Id de la venta en el servidor. null = cobrada sin conexión (en cola). */
  saleId: string | null;
  /** Número consecutivo. null = todavía no se conoce (o venta en cola). */
  saleNumber: number | null;
  /** La venta quedó en la cola del dispositivo, sin número del servidor. */
  queued: boolean;
  items: ReceiptItem[];
  customer: ReceiptCustomer | null;
  totals: SaleTotals;
  /** Medio de pago principal, ya traducido ("Efectivo", "Datáfono (Bold)"). */
  paymentLabel: string;
  /** Detalle de un pago dividido. Vacío = un solo medio (`paymentLabel`). */
  payments: ReceiptPayment[];
  /** Efectivo recibido. null = no fue en efectivo o no se anotó. */
  tendered: number | null;
  /** Cambio entregado. 0 si no hubo. */
  change: number;
  /** Quién cobró (la cuenta que estaba en la caja). */
  cashier: string | null;
  /** El "Atendido por" de la venta, si es distinto de quien cobró. */
  seller: string | null;
  date: Date;
  /** Si el negocio desglosa IVA (responsable de IVA). */
  includeTax: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Datáfono",
  transferencia: "Transferencia",
  credito: "Crédito / Fiado",
};

/** "Transferencia (Nequi)", "Datáfono (Bold)", "Efectivo". */
export function paymentLabelFor(
  method: string,
  transferMethod?: string | null,
  cardMethod?: string | null,
): string {
  const base = METHOD_LABELS[method] ?? method;
  if (method === "transferencia" && transferMethod) {
    return `${base} (${getTransferMethodName(transferMethod)})`;
  }
  if (method === "tarjeta" && cardMethod) {
    return `${base} (${getCardMethodName(cardMethod)})`;
  }
  return base;
}

/** El "Atendido por" solo se imprime si aporta algo: si es quien cobró, sobra. */
function sellerUnlessCashier(seller: string | null, cashier: string | null): string | null {
  if (!seller) return null;
  if (cashier && seller.trim().toLowerCase() === cashier.trim().toLowerCase()) return null;
  return seller;
}

export interface CartReceiptInput {
  /** El carrito tal cual se cobró (capturado ANTES de que el store lo limpie). */
  cart: CartLine[];
  totals: SaleTotals;
  customer: ReceiptCustomer | null;
  paymentMethod: PaymentMethod;
  transferMethod?: string | null;
  cardMethod?: string | null;
  splits: PaymentSplit[];
  tendered: number | null;
  change: number;
  cashier: string | null;
  seller: string | null;
  business: ReceiptBusiness;
  includeTax: boolean;
  date: Date;
  saleId: string | null;
  saleNumber: number | null;
  queued: boolean;
  /** Precio de la línea (`linePrice` del POS): se inyecta para no duplicar la regla. */
  priceOf: (line: CartLine) => number;
}

/** Comprobante de una venta recién cobrada en el POS. */
export function buildReceiptFromCart(input: CartReceiptInput): ReceiptData {
  const items: ReceiptItem[] = input.cart.map((l) => {
    const unitPrice = input.priceOf(l);
    const gross = round2(unitPrice * l.quantity);
    // Nunca más que la línea: un descuento mal cargado no imprime un total negativo.
    const discount = Math.min(round2(l.discountAmount ?? 0), gross);
    return {
      name: l.item.name,
      sku: l.item.sku ?? null,
      quantity: l.quantity,
      packageLabel: l.unitKind === "package" ? `Caja x${l.item.units_per_package} u.` : null,
      unitPrice,
      gross,
      discount,
      discountLabel: discount > 0 ? l.offerName ?? null : null,
      total: round2(gross - discount),
    };
  });

  const payments: ReceiptPayment[] =
    input.splits.length > 0
      ? input.splits.map((s) => ({
          label: paymentLabelFor(s.payment_method, s.transfer_method, s.card_method),
          amount: s.amount,
        }))
      : [];

  return {
    ...input.business,
    saleId: input.saleId,
    saleNumber: input.saleNumber,
    queued: input.queued,
    items,
    customer: input.customer,
    totals: input.totals,
    paymentLabel:
      payments.length > 0
        ? "Pago dividido"
        : paymentLabelFor(input.paymentMethod, input.transferMethod, input.cardMethod),
    payments,
    tendered: payments.length > 0 ? null : input.tendered,
    change: payments.length > 0 ? 0 : input.change,
    cashier: input.cashier,
    seller: sellerUnlessCashier(input.seller, input.cashier),
    date: input.date,
    includeTax: input.includeTax,
  };
}

export interface SaleReceiptInput {
  sale: SaleDetail;
  extras: SaleReceiptExtras;
  business: ReceiptBusiness;
  /**
   * `settings.include_tax` del negocio. Una venta con IVA > 0 se imprime
   * desglosada igual: lo que manda es lo que se cobró, no la config de hoy.
   */
  includeTax: boolean;
  /** Quién reimprime no es quien cobró: se deja en null salvo que se sepa. */
  cashier?: string | null;
}

/**
 * Comprobante de una venta ya guardada (reimpresión).
 *
 * Lo que la base NO guarda no se inventa:
 * - el descuento por línea (`sale_items` no lo tiene; viaja solo el total en
 *   `sales.discount_amount`), así que las líneas salen a precio lleno y el
 *   descuento va en los totales;
 * - el efectivo recibido y el cambio (no hay columna), así que no se imprimen.
 */
export function buildReceiptFromSale(input: SaleReceiptInput): ReceiptData {
  const { sale, extras } = input;
  const items: ReceiptItem[] = sale.items.map((it) => ({
    name: it.product_name,
    sku: it.sku,
    quantity: Number(it.quantity),
    packageLabel: it.unit_kind === "package" ? `Caja x${it.units_per_item} u.` : null,
    unitPrice: Number(it.unit_price),
    gross: Number(it.line_total),
    discount: 0,
    discountLabel: null,
    total: Number(it.line_total),
  }));

  const gross = round2(items.reduce((s, i) => s + i.gross, 0));
  const discount = round2(Number(sale.discount_amount) || 0);
  const total = round2(Number(sale.total) || 0);
  const taxAmount = round2(Number(sale.tax_amount) || 0);
  const includeTax = taxAmount > 0 || input.includeTax;
  // Cliente exento: con IVA en el negocio pero cero en la venta, la diferencia
  // entre el neto y lo cobrado es la rebaja por exención.
  const exemptionDiscount =
    includeTax && taxAmount === 0 ? Math.max(round2(gross - discount - total), 0) : 0;

  const payments: ReceiptPayment[] =
    extras.payments.length > 1
      ? extras.payments.map((p) => ({
          label: paymentLabelFor(p.payment_method, p.transfer_method, p.card_method),
          amount: Number(p.amount),
        }))
      : [];

  return {
    ...input.business,
    saleId: sale.id,
    saleNumber: sale.sale_number,
    queued: false,
    items,
    customer: extras.customer
      ? {
          full_name: extras.customer.full_name,
          doc_type: extras.customer.doc_type,
          identification: extras.customer.identification,
        }
      : sale.customer_name
        ? { full_name: sale.customer_name, doc_type: null, identification: null }
        : null,
    totals: {
      gross,
      subtotal: round2(Number(sale.subtotal) || 0),
      taxAmount,
      discount,
      exemptionDiscount,
      total,
    },
    paymentLabel:
      payments.length > 0
        ? "Pago dividido"
        : paymentLabelFor(sale.payment_method, sale.transfer_method, sale.card_method),
    payments,
    tendered: null,
    change: 0,
    cashier: input.cashier ?? null,
    seller: sellerUnlessCashier(sale.staff_name, input.cashier ?? null),
    date: new Date(sale.created_at),
    includeTax,
  };
}

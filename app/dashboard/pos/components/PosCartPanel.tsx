import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { IconThunder, IconTrash, IconReceipt } from "@/app/assets/icons/DashboardIcons";
import { Select } from "@/components/ui/Select";
import { TransferMethodSelector } from "@/components/TransferMethodSelector";
import { CardMethodSelector } from "@/components/CardMethodSelector";
import {
  cartLineKey,
  linePrice,
  lineUnits,
  type PaymentMethod,
  type CartLine,
  type CustomerOption,
  type SaleTotals,
  type StaffOption,
} from "@/services/pos.service";

import { useProfile } from "@/components/ProfileProvider";
import { formatQty, parseQuantityDraft } from "@/lib/stock";
import { creditAlertText } from "@/lib/credits";
import { useFormatMoney } from "@/lib/useMoney";
import type { DiscountBreakdownEntry } from "@/lib/pos-discount-breakdown";

/**
 * El campo de cantidad de una línea del carrito.
 *
 * Es un componente aparte por una sola razón: mientras se escribe, lo que hay
 * en el campo NO es todavía una cantidad. "" y "1," son pasos válidos del
 * tipeo, y un input controlado contra el número del carrito los revierte al
 * instante — el valor viejo vuelve, el cursor queda pegado a él y el dígito
 * nuevo se suma en vez de reemplazar. Ese borrador necesita estado propio, y
 * el estado propio necesita su propio componente porque las líneas se
 * renderizan con un `.map`.
 *
 * `select()` va en focus Y en click: el focus solo cubre el PRIMER clic, y el
 * segundo —el del que se equivocó y vuelve a tocar el campo— entra sin evento
 * de foco. Verificado en Chrome: sin el handler de click, tocar dos veces y
 * escribir 3 deja 23.
 */
function CartQuantityField({
  quantity,
  allowsFractions,
  min,
  max,
  label,
  onCommit,
}: {
  quantity: number;
  allowsFractions: boolean;
  min: number;
  max: number | undefined;
  label: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="number"
      inputMode={allowsFractions ? "decimal" : "numeric"}
      aria-label={label}
      min={min}
      step={allowsFractions ? 0.001 : 1}
      max={max}
      value={draft ?? formatQty(quantity)}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const v = parseQuantityDraft(raw, allowsFractions);
        if (v != null) onCommit(v);
      }}
      /* Soltar el borrador al salir devuelve a la vista la cantidad que el
         carrito realmente tiene: un campo vacío o un "0" a medio escribir no
         se quedan pegados contradiciendo al total. */
      onBlur={() => setDraft(null)}
      className={`h-10 text-center text-sm font-semibold text-on-surface bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
        allowsFractions ? "w-16" : "w-10"
      }`}
    />
  );
}

interface PosCartPanelProps {
  /**
   * Aviso del premio del cliente, si ganó uno. Entra como slot y no se arma
   * acá porque depende del progreso del cliente y de la configuración de
   * promociones, dos cosas que este panel no conoce ni tiene por qué conocer.
   */
  promoSlot?: React.ReactNode;
  cart: CartLine[];
  totals: SaleTotals;
  /** Descuento por origen (C12); lo arma la pantalla con `discountBreakdown`. */
  discountParts?: DiscountBreakdownEntry[];
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  customerId: string | null;
  setCustomer: (id: string | null) => void;
  staffId: string | null;
  setStaff: (id: string | null) => void;
  customers: CustomerOption[];
  staff: StaffOption[];
  taxRate: number;
  includeTax: boolean;
  isTaxExempt: boolean;
  submitting: boolean;
  salesBlocked: boolean;
  allowOversell: boolean;
  transferMethod: string | null;
  setTransferMethod: (id: string | null) => void;
  cardMethod: string | null;
  setCardMethod: (id: string | null) => void;
  transferMethodsEnabled: string[] | undefined;
  cardMethodsEnabled: string[] | undefined;
  paymentOptions: { value: PaymentMethod; label: string }[];
  asksCardMethod: boolean;
  asksTransferMethod: boolean;
  cartUnits: number;
  isCartOpen: boolean;
  setIsCartOpen: (v: boolean) => void;
  setLineKind: (key: string, kind: "unit" | "package") => void;
  setLineStaff: (key: string, staffId: string | null) => void;
  setLinePrice: (key: string, price: number | null) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  setQuantity: (key: string, v: number) => void;
  removeFromCart: (key: string) => void;
  /** Saca una oferta automática (T5) de una línea, solo para esta venta. */
  removeOffer: (key: string) => void;
  /** "Vaciar venta". La pantalla le pone el "Deshacer" (C5). */
  clearCart: () => void;
  /** Línea recién agregada por el escáner: se resalta un momento (C24). */
  flashKey?: string | null;
  /**
   * Reimprime el comprobante de la última venta cobrada en esta sesión.
   * null = no hay ninguna todavía (el botón queda deshabilitado).
   */
  onReprintLast?: (() => void) | null;
  onCheckout: () => void;
  onOpenDiscountModal: () => void;
  onOpenSaleConfigModal: () => void;
  onOpenRecentSalesModal: () => void;
  onOpenCustomerModal: () => void;
  /** Ya no se usa en el panel (la reimpresión no exige turno); se conserva por compatibilidad. */
  requireShift?: (action: () => void) => void;
  splitsCount: number;
  isDelivery: boolean;
  setDelivery: (enabled: boolean) => void;
}

export function PosCartPanel({
  promoSlot,
  cart,
  totals,
  discountParts = [],
  paymentMethod,
  setPaymentMethod,
  customerId,
  setCustomer,
  staffId,
  setStaff,
  customers,
  staff,
  taxRate,
  includeTax,
  isTaxExempt,
  submitting,
  salesBlocked,
  allowOversell,
  transferMethod,
  setTransferMethod,
  cardMethod,
  setCardMethod,
  transferMethodsEnabled,
  cardMethodsEnabled,
  paymentOptions,
  asksCardMethod,
  asksTransferMethod,
  cartUnits,
  isCartOpen,
  setIsCartOpen,
  setLineKind,
  setLineStaff,
  setLinePrice,
  increment,
  decrement,
  setQuantity,
  removeFromCart,
  removeOffer,
  clearCart,
  flashKey = null,
  onReprintLast = null,
  onCheckout,
  onOpenDiscountModal,
  onOpenSaleConfigModal,
  onOpenRecentSalesModal,
  onOpenCustomerModal,
  splitsCount,
  isDelivery,
  setDelivery,
}: PosCartPanelProps) {
  const fmtMoney = useFormatMoney();
  const profile = useProfile();
  /** Subtotal/IVA plegados: el pie tiene que dejar lugar a las líneas. */
  const [showDetail, setShowDetail] = useState(false);
  // El aviso del dueño sobre este cliente, si lo tiene marcado.
  const avisoDelCliente = (() => {
    const elegido = customers.find((c) => c.id === customerId);
    return elegido?.credit_alert ? creditAlertText(elegido.credit_alert_note) : null;
  })();
  const unpriced = cart.filter((l) => l.item.open_price && l.customPrice == null);
  const missingPrice = unpriced.length > 0;
  const missingPriceNames = unpriced.map((l) => l.item.name).join(", ");

  return (
    <>
      {isCartOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsCartOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[480px] shadow-2xl transition-transform duration-300 ease-out
          lg:static lg:z-auto lg:w-[360px] xl:w-[440px] lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-none
          bg-surface-container-lowest flex flex-col h-full shrink-0 border-l border-outline-variant/10
          ${isCartOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden lg:flex lg:flex-col">

          <div className="shrink-0 p-5 border-b border-outline-variant/10 space-y-4 pt-[max(1.5rem,env(safe-area-inset-top))] lg:pt-6">
            <div className="flex justify-between items-center gap-2">
              <h2 className="text-lg font-bold text-on-surface flex items-center gap-2 min-w-0">
                <span className="truncate">Factura de venta</span>
                <div className="w-6 h-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <IconThunder className="w-3.5 h-3.5" />
                </div>
              </h2>
              <div className="flex items-center gap-3 text-on-surface-variant shrink-0">
                <button onClick={onOpenDiscountModal} className="w-10 h-10 -m-1 flex items-center justify-center rounded-lg hover:text-primary hover:bg-surface-container-high" title="Descuentos globales" aria-label="Descuentos">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </button>
                {/* Imprime el comprobante de la venta ANTERIOR, no la que se
                    está armando: el nombre lo dice para que nadie lo confunda
                    con una pre-cuenta. Sin venta cobrada, no hay qué imprimir. */}
                <button
                  onClick={() => onReprintLast?.()}
                  disabled={!onReprintLast}
                  className="w-10 h-10 -m-1 flex items-center justify-center rounded-lg hover:text-primary hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-on-surface-variant"
                  title={onReprintLast ? "Reimprimir última venta" : "Todavía no hay una venta para reimprimir"}
                  aria-label="Reimprimir última venta"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                </button>
                <button onClick={onOpenSaleConfigModal} className="w-10 h-10 -m-1 flex items-center justify-center rounded-lg hover:text-primary hover:bg-surface-container-high" title="Configuración" aria-label="Configuración">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
                    <line x1="4" y1="21" x2="4" y2="14"/>
                    <line x1="4" y1="10" x2="4" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12" y2="3"/>
                    <line x1="20" y1="21" x2="20" y2="16"/>
                    <line x1="20" y1="12" x2="20" y2="3"/>
                    <line x1="1" y1="14" x2="7" y2="14"/>
                    <line x1="9" y1="8" x2="15" y2="8"/>
                    <line x1="17" y1="16" x2="23" y2="16"/>
                  </svg>
                </button>
                <button
                  onClick={() => setIsCartOpen(false)}
                  aria-label="Cerrar factura"
                  className="lg:hidden -mr-1.5 w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high hover:text-on-surface transition-colors"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Método de pago"
                size="sm"
                value={paymentMethod}
                onChange={(e) => {
                  const newMethod = e.target.value as PaymentMethod;
                  setPaymentMethod(newMethod);
                  if (newMethod === "transferencia" && !transferMethod) {
                    setTransferMethod(transferMethodsEnabled?.[0] ?? null);
                  }
                  if (newMethod === "tarjeta" && !cardMethod) {
                    setCardMethod(cardMethodsEnabled?.[0] ?? null);
                  }
                }}
              >
                {paymentOptions.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>

              <div className="flex gap-2 items-end">
                {/* Con buscador: un negocio con cientos de clientes no puede
                    encontrar a nadie bajando por una lista. El documento va en
                    la etiqueta a propósito — así se puede buscar por cédula,
                    que es lo que la persona dice en el mostrador, y además
                    distingue a dos clientes que se llaman igual. */}
                <Select
                  label="Cliente"
                  size="sm"
                  searchable
                  searchPlaceholder="Buscar por nombre o documento…"
                  containerClassName="flex-1 min-w-0"
                  value={customerId ?? ""}
                  onChange={(e) => setCustomer(e.target.value || null)}
                >
                  <option value="">Consumidor final (22222222222)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                      {c.identification ? ` · ${c.doc_type ?? ""} ${c.identification}`.replace(/\s+/g, " ") : ""}
                      {c.tax_exempt ? " (exento)" : ""}
                    </option>
                  ))}
                </Select>
                <button
                  onClick={onOpenCustomerModal}
                  aria-label="Nuevo cliente"
                  className="h-9 w-10 shrink-0 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </button>
              </div>

              {/* El aviso del dueño, en el único momento en que cambia algo: con
                  el cliente elegido y antes de cobrar. Avisa — no bloquea: el
                  cupo es el que rechaza la venta. */}
              {avisoDelCliente && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-error mt-0.5" />
                  <p className="text-xs font-bold text-error min-w-0">
                    {avisoDelCliente}
                  </p>
                </div>
              )}
            </div>

            {paymentMethod === "transferencia" && asksTransferMethod && (
              <TransferMethodSelector
                enabledMethods={transferMethodsEnabled}
                selectedMethod={transferMethod ?? transferMethodsEnabled?.[0] ?? "nequi"}
                onSelect={(id) => setTransferMethod(id)}
              />
            )}

            {paymentMethod === "tarjeta" && asksCardMethod && (
              <CardMethodSelector
                enabledMethods={cardMethodsEnabled}
                selectedMethod={cardMethod ?? cardMethodsEnabled?.[0] ?? "bold"}
                onSelect={(id) => setCardMethod(id)}
              />
            )}

            {/* Domicilio toggle */}
            {totals.total > 0 && profile?.businessType !== "salon" && (
              <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDelivery}
                  onClick={() => setDelivery(!isDelivery)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                    isDelivery ? "bg-primary" : "bg-outline-variant/30"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isDelivery ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
                <span className="text-sm text-on-surface">Es domicilio</span>
              </label>
            )}

            {/* Split payment indicator */}
            {splitsCount > 0 && totals.total > 0 && (
              <div className="flex items-center gap-2 py-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M2 12h20" />
                  </svg>
                  Pago dividido ({splitsCount} método{splitsCount !== 1 ? "s" : ""})
                </span>
                <span className="text-[11px] text-on-surface-variant">
                  Se configura al confirmar la venta
                </span>
              </div>
            )}

            {staff.length > 0 && (
              <Select
                label="Atendido por"
                size="sm"
                value={staffId ?? ""}
                onChange={(e) => setStaff(e.target.value || null)}
              >
                <option value="">&mdash;</option>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </Select>
            )}

            {/* Con un solo empleado no hay selector por línea: si la venta tiene
                ítems que comisionan y "Atendido por" queda vacío, la comisión
                se pierde en silencio. Por eso se avisa. */}
            {cart.some((l) => l.item.kind === "service" || l.item.has_commission) &&
              staff.length === 1 &&
              !staffId && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  Hay ítems que comisionan: elige &quot;Atendido por&quot; para que la comisión se devengue.
                </p>
              )}
          </div>

          {promoSlot}

          <div className="min-h-[9rem] lg:flex-1 lg:min-h-0 lg:overflow-y-auto p-5 space-y-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-12 h-12 rounded bg-surface-container flex items-center justify-center text-on-surface-variant/50 mb-3">
                  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Aquí verás los ítems que elijas en tu próxima venta
                </p>
              </div>
            ) : (
              <>
                {/* Líneas táctiles (C6): −/+ y quitar de 40px, papelera siempre
                    visible (en una pantalla táctil no hay hover que la revele)
                    y el nombre a 14px. Nombre y total arriba; controles abajo,
                    para que en la factura angosta de tablet entren sin apretarse. */}
                <ul className="divide-y divide-outline-variant/10">
                {cart.map((line) => {
                  const key = cartLineKey(line);
                  const discount = line.discountAmount ?? 0;
                  const atStock =
                    !allowOversell &&
                    line.item.kind === "product" &&
                    line.item.stock_level != null &&
                    line.quantity >= line.item.stock_level;
                  return (
                  <li
                    key={key}
                    // Al resaltarse, se trae a la vista si quedó fuera del scroll:
                    // un resaltado que no se ve no confirma nada.
                    ref={flashKey === key ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                    data-flash={flashKey === key ? "true" : undefined}
                    className={`py-2 px-1.5 -mx-1 rounded-lg transition-colors duration-500 ${
                      flashKey === key
                        ? "bg-primary/15 ring-1 ring-primary/40"
                        : "hover:bg-surface-container-low"
                    } ${line.item.kind === "service" ? "border-l-2 border-emerald-500/60 pl-2.5" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-on-surface leading-snug line-clamp-2 break-words">
                          {line.item.name}
                        </span>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[11px]">
                          {line.item.kind === "service" ? (
                            <span className="text-emerald-500 font-medium">Servicio</span>
                          ) : line.unitKind === "package" ? (
                            <span className="text-primary font-medium">Caja ×{line.item.units_per_package}</span>
                          ) : line.item.sku ? (
                            <span className="text-on-surface-variant/70">{line.item.sku}</span>
                          ) : null}
                          {discount > 0 && line.offerId ? (
                            // Oferta automática (T5): lleva su nombre, para que el
                            // cajero sepa POR QUÉ bajó el precio y no lo confunda
                            // con un descuento que puso alguien a mano.
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <span className="text-accent-fin">
                                {line.offerName} −{fmtMoney(discount)}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeOffer(key)}
                                className="min-h-6 text-on-surface-variant/70 hover:text-error underline underline-offset-2 transition-colors"
                              >
                                Quitar
                              </button>
                            </span>
                          ) : (
                            discount > 0 && (
                              <span className="text-error font-medium">
                                {(line.manualDiscount ?? 0) >= discount ? "Descuento manual" : "Descuento"} −{fmtMoney(discount)}
                              </span>
                            )
                          )}
                          {line.item.kind === "product" &&
                            line.item.stock_level != null &&
                            line.quantity * lineUnits(line) > line.item.stock_level && (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Supera el stock" />
                          )}
                        </div>
                      </div>

                      {/* Precio abierto: el importe es un campo, no una etiqueta.
                          Vacío NO cae al precio del catálogo — el servidor rechaza
                          la venta (PRECIO_REQUERIDO) antes que cobrar el precio de
                          la semana pasada sin que nadie lo haya mirado. */}
                      {line.item.open_price ? (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-on-surface-variant">$</span>
                            <input
                              type="number"
                              min="0"
                              inputMode="decimal"
                              aria-label={`Precio de ${line.item.name}`}
                              value={line.customPrice ?? ""}
                              placeholder={String(line.item.price)}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const v = parseFloat(raw);
                                setLinePrice(key, raw === "" || !Number.isFinite(v) ? null : v);
                              }}
                              className={`w-24 h-10 text-right text-sm font-bold text-on-surface bg-surface-container-lowest border rounded-lg px-2 outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                line.customPrice == null
                                  ? "border-amber-500/60 focus:border-amber-500"
                                  : "border-outline-variant/30 focus:border-primary"
                              }`}
                            />
                          </div>
                          <span className="text-sm font-bold text-on-surface tabular-nums">
                            {fmtMoney(linePrice(line) * line.quantity)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-on-surface tabular-nums shrink-0">
                          {fmtMoney(linePrice(line) * line.quantity)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <div className="flex items-center rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                        <button
                          type="button"
                          onClick={() => decrement(key)}
                          aria-label={`Quitar una unidad de ${line.item.name}`}
                          className="w-10 h-10 flex items-center justify-center rounded-l-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high active:bg-on-surface/10 transition-colors"
                        >
                          <svg fill="none" stroke="currentColor" strokeWidth="2.25" viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path strokeLinecap="round" d="M5 12h14" /></svg>
                        </button>
                        {/* `step` y los decimales salen de la unidad de medida
                            del producto: 1,5 kg es una venta y media unidad de un
                            televisor es un error de tipeo. El servidor revalida
                            con la misma regla (CANTIDAD_ENTERA). */}
                        <CartQuantityField
                          quantity={line.quantity}
                          allowsFractions={line.item.allows_fractions}
                          min={line.item.allows_fractions ? 0.001 : 1}
                          max={allowOversell ? undefined : line.item.stock_level ?? undefined}
                          label={`Cantidad de ${line.item.name}`}
                          onCommit={(v) => setQuantity(key, v)}
                        />
                        <button
                          type="button"
                          onClick={() => increment(key)}
                          disabled={atStock}
                          aria-label={`Agregar una unidad de ${line.item.name}`}
                          className="w-10 h-10 flex items-center justify-center rounded-r-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high active:bg-on-surface/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <svg fill="none" stroke="currentColor" strokeWidth="2.25" viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(key)}
                        className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                        aria-label={`Quitar ${line.item.name} de la venta`}
                        title="Quitar de la venta"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>

              {cart.some((l) => l.item.kind === "product" && l.item.package_price != null) && (
                <div className="space-y-1.5 pt-1 border-t border-outline-variant/10">
                  {cart
                    .filter((l) => l.item.kind === "product" && l.item.package_price != null)
                    .map((line) => (
                      <div key={`pkg-${cartLineKey(line)}`} className="flex gap-1 p-0.5 rounded-lg bg-surface-container-lowest border border-outline-variant/15">
                        {([
                          { kind: "unit" as const, label: "Unidad", price: line.item.price },
                          // El carácter va literal, no como entidad HTML: esto
                          // es un string de JS y nadie lo decodifica, así que
                          // `&times;` se imprimiría tal cual.
                          { kind: "package" as const, label: `Caja ×${line.item.units_per_package}`, price: line.item.package_price },
                        ]).map((opt) => {
                          const active = (line.unitKind ?? "unit") === opt.kind;
                          return (
                            <button
                              key={opt.kind}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setLineKind(cartLineKey(line), opt.kind)}
                              className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition-colors ${
                                active
                                  ? "bg-primary text-on-primary"
                                  : "text-on-surface-variant hover:bg-surface-container"
                              }`}
                            >
                              {opt.label} &middot; {fmtMoney(opt.price ?? 0)}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                </div>
              )}

              {/* Líneas que comisionan. La atribución es lo ÚNICO que decide si
                  la comisión se devenga: create_sale la congela en cero cuando
                  no hay persona, así que dejarla sin asignar la pierde para
                  siempre. Por eso se avisa en vez de fallar en silencio.
                  Con UN solo empleado activo el selector por línea sobra:
                  "Atendido por" ya atribuye la venta entera. El selector por
                  línea solo se muestra con 2+ empleados, que es cuando tiene
                  sentido dividir las comisiones de una misma venta. */}
              {cart.some((l) => l.item.kind === "service" || l.item.has_commission) && staff.length !== 1 && (
                <div className="space-y-1.5 pt-1 border-t border-outline-variant/10">
                  {staff.length === 0 ? (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      Hay productos que comisionan, pero no tienes personal cargado.
                      Agrégalo en Personal para poder asignarles la comisión.
                    </p>
                  ) : (
                    cart
                      .filter((l) => l.item.kind === "service" || l.item.has_commission)
                      .map((line) => (
                        <div key={`stf-${cartLineKey(line)}`} className="flex items-center gap-2">
                          <span className="text-[10px] text-on-surface-variant shrink-0 truncate max-w-[80px]">{line.item.name}</span>
                          <Select
                            size="sm"
                            value={line.staffId ?? ""}
                            onChange={(e) => setLineStaff(cartLineKey(line), e.target.value || null)}
                          >
                            <option value="">Sin comisión</option>
                            {staff.map((m) => (
                              <option key={m.id} value={m.id}>{m.full_name}</option>
                            ))}
                          </Select>
                        </div>
                      ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        </div>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface-container-lowest mt-auto shrink-0 border-t border-outline-variant/10">
          {cart.length > 0 && (
            <div className="flex items-center justify-between gap-2 mb-2">
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                aria-expanded={showDetail}
                aria-controls="pos-cart-detail"
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className={`w-3.5 h-3.5 transition-transform ${showDetail ? "rotate-180" : ""}`} aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
                {showDetail ? "Ocultar detalle" : "Ver detalle"}
              </button>
              {/* Lejos de "Vender" a propósito (C5): pegado al botón de cobrar
                  era fácil vaciar la venta con el dedo equivocado. Igual se
                  puede deshacer unos segundos desde el aviso. */}
              <button
                type="button"
                onClick={clearCart}
                disabled={submitting}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
                Vaciar venta
              </button>
            </div>
          )}

          {cart.length > 0 && showDetail && (
            <div id="pos-cart-detail" className="space-y-1.5 mb-3 bg-surface-container px-4 py-3 rounded-2xl border border-outline-variant/10">
              {isTaxExempt ? (
                <>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>Precio original</span>
                    <span className="font-semibold text-on-surface">{fmtMoney(totals.gross)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-accent-fin">
                    <span>Descuento por exención de IVA</span>
                    <span className="font-semibold">-{fmtMoney(totals.exemptionDiscount)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>Subtotal (base)</span>
                    <span className="font-semibold text-on-surface">{fmtMoney(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>IVA (exento)</span>
                    <span className="font-semibold text-on-surface">{fmtMoney(0)}</span>
                  </div>
                </>
              ) : includeTax ? (
                <>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>Subtotal (base)</span>
                    <span className="font-semibold text-on-surface">{fmtMoney(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>IVA ({(taxRate * 100).toFixed(0)}%)</span>
                    <span className="font-semibold text-on-surface">{fmtMoney(totals.taxAmount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm text-on-surface-variant">
                  <span>Subtotal</span>
                  <span className="font-semibold text-on-surface">{fmtMoney(totals.subtotal)}</span>
                </div>
              )}
            </div>
          )}

          {/* De dónde sale el descuento (C12). Siempre a la vista, no detrás de
              "Ver detalle": es lo que el cliente pregunta al ver el total. */}
          {cart.length > 0 && totals.discount > 0 && (
            <div className="mb-3 space-y-1 px-1" aria-label="Descuentos de la venta">
              {(discountParts.length > 0
                ? discountParts
                : [{ origin: "other" as const, label: "Descuento", amount: totals.discount }]
              ).map((part) => (
                <div key={part.origin} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 text-on-surface-variant">
                    {part.label}
                    {"names" in part && part.names?.length ? (
                      <span className="block truncate text-[11px] text-on-surface-variant/80">
                        {part.names.join(", ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-semibold text-accent-fin tabular-nums">
                    −{fmtMoney(part.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Un ítem de precio abierto sin precio no se puede cobrar. El
              servidor lo rechaza igual; esto es para que el cajero se entere
              ANTES de apretar, con el ítem a la vista. */}
          {missingPrice && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mb-2">
              Falta asignarle precio a {missingPriceNames}.
            </p>
          )}

          {/* El total es lo más visible de la pantalla (C11): fijo al pie,
              justo encima de "Vender", con cuántos ítems lleva. */}
          <div className="flex items-end justify-between gap-3 mb-3 px-1" aria-live="polite">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Total a pagar</p>
              <p className="text-xs text-on-surface-variant tabular-nums">
                {cart.length} ítem{cart.length !== 1 ? "s" : ""} &middot; {formatQty(cartUnits)} unidad{cartUnits !== 1 ? "es" : ""}
              </p>
            </div>
            <p className="min-w-0 truncate text-[32px] xl:text-[40px] leading-none font-bold text-on-surface tabular-nums tracking-tight">
              {fmtMoney(totals.total)}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              title={salesBlocked ? "Abre tu turno para vender" : undefined}
              onClick={onCheckout}
              disabled={salesBlocked || cart.length === 0 || submitting || missingPrice}
              className={`flex-1 min-h-14 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition-all ${
                salesBlocked || cart.length === 0 || missingPrice
                  ? "bg-surface-container-highest cursor-not-allowed opacity-70 text-on-surface-variant/50"
                  : "bg-primary text-on-primary hover:bg-primary-dim shadow-sm"
              }`}
            >
              {submitting ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>
                  <span>Vender</span>
                  <span>{fmtMoney(totals.total)}</span>
                </>
              )}
            </button>
            <div className="relative group">
              <button
                onClick={onOpenRecentSalesModal}
                className="w-[52px] h-full min-h-14 flex-shrink-0 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant/10 text-on-surface hover:bg-surface-container-high transition-colors"
                aria-label="Últimas ventas"
              >
                <IconReceipt className="w-6 h-6" />
              </button>
              <div className="absolute bottom-full right-0 mb-2 w-max opacity-0 scale-95 invisible group-hover:opacity-100 group-hover:scale-100 group-hover:visible transition-all duration-150 ease-out bg-inverse-surface text-inverse-on-surface text-xs font-medium py-1.5 px-2.5 rounded shadow-lg pointer-events-none z-50">
                Últimas ventas
                <div className="absolute top-full right-4 -mt-px border-4 border-transparent border-t-inverse-surface"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

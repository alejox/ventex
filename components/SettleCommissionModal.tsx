"use client";

import { useEffect, useMemo, useState } from "react";
import { useStaffStore } from "@/stores/staff.store";
import {
  fetchStaffSales,
  commissionPeriodOf,
  currentMonthPeriod,
  openShiftForCommission,
} from "@/services/staff.service";
import type { StaffMember, StaffSaleItem, CommissionPeriod } from "@/services/staff.service";
import { Select } from "@/components/ui/Select";
import { notifySuccess } from "@/lib/notifications";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Datáfono / Tarjeta",
};

interface Props {
  member: StaffMember;
  onClose: () => void;
  /** Recibe el id de la liquidación creada, para abrir su comprobante. */
  onSettled: (settlementId: string) => void;
}

/**
 * Liquidar la comisión de una persona por un período.
 *
 * El modal muestra SOLO lo pendiente: una línea ya liquidada no vuelve a
 * aparecer acá, y esa es la mitad visible de la idempotencia. La otra mitad
 * está en la base — `settle_commissions` toma únicamente las líneas con
 * `commission_settlement_id IS NULL` y las bloquea antes de sumarlas—, así que
 * dos pestañas abiertas sobre el mismo período no pueden pagar dos veces por
 * más que las dos muestren el mismo total.
 */
export function SettleCommissionModal({ member, onClose, onSettled }: Props) {
  const settleCommissions = useStaffStore((s) => s.settleCommissions);
  const submitting = useStaffStore((s) => s.submitting);
  const storeError = useStaffStore((s) => s.error);

  const initial = useMemo(() => currentMonthPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [paidOn, setPaidOn] = useState(initial.to);
  const [paymentMethod, setPaymentMethod] =
    useState<"efectivo" | "transferencia" | "tarjeta">("efectivo");

  const period: CommissionPeriod = useMemo(() => commissionPeriodOf(from, to), [from, to]);
  const rangeIsValid = from <= to;
  /** Identidad del período pedido. Es lo que dice si lo cargado sirve o quedó viejo. */
  const periodKey = `${from}|${to}`;

  /**
   * Lo cargado viene ETIQUETADO con el período al que pertenece.
   *
   * Así "está cargando" y "qué líneas hay" se DERIVAN de un solo estado en vez
   * de sincronizarse con `setLoading`/`setItems` desde el cuerpo del efecto,
   * que es lo que el compilador de React rechaza (renders en cascada).
   */
  const [loaded, setLoaded] = useState<{
    key: string;
    items: StaffSaleItem[];
    error: string | null;
  } | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const isFresh = loaded?.key === periodKey;
  const loading = rangeIsValid && !isFresh;
  const items = isFresh ? loaded.items : [];
  const loadError = isFresh ? loaded.error : null;

  useEffect(() => {
    if (!rangeIsValid) return;
    let cancelled = false;
    fetchStaffSales(member.id, period)
      .then((rows) => {
        if (cancelled) return;
        // Solo lo que se puede pagar: pendiente y con comisión real. Una línea
        // sin comisión no es parte de una liquidación, es ruido en el listado.
        setLoaded({
          key: periodKey,
          items: rows.filter((r) => !r.settlementId && r.commissionAmount > 0),
          error: null,
        });
        // Al cambiar el período lo excluido deja de tener sentido: son otras
        // líneas. Se limpia acá —en el callback, no en un efecto aparte— para
        // que no quede un id viejo excluyendo por accidente.
        setExcluded(new Set());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoaded({
          key: periodKey,
          items: [],
          error: e instanceof Error ? e.message : "No se pudo cargar el detalle.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [member.id, period, periodKey, rangeIsValid]);

  /**
   * ¿Hay un turno abierto donde anotar la salida de efectivo?
   *
   * Es solo el AVISO: quien decide es el RPC, que vuelve a resolverlo dentro de
   * su transacción. Pero el dueño tiene que saber antes de confirmar si este
   * pago va a descontar del arqueo o no, porque son dos situaciones distintas
   * y ninguna de las dos es un error.
   */
  const [cashShiftId, setCashShiftId] = useState<string | null | "unknown">("unknown");
  useEffect(() => {
    let cancelled = false;
    openShiftForCommission(member.id)
      .then((id) => {
        if (!cancelled) setCashShiftId(id);
      })
      .catch(() => {
        if (!cancelled) setCashShiftId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  const included = items.filter((i) => !excluded.has(i.id));
  const total = included.reduce((sum, i) => sum + i.commissionAmount, 0);
  const canSettle = rangeIsValid && !loading && included.length > 0 && total > 0 && !submitting;

  const toggle = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSettle) return;
    const id = await settleCommissions({
      staffId: member.id,
      period,
      paymentMethod,
      paidOn,
      excludedItemIds: [...excluded],
    });
    if (id) {
      notifySuccess(
        "Comisión liquidada",
        `$${money(total)} para ${member.full_name}. Ya quedó registrado en Gastos.`,
      );
      onSettled(id);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-title"
        className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92dvh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col"
      >
        <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-start gap-4 bg-surface-container-low shrink-0">
          <div className="min-w-0">
            <h2 id="settle-title" className="text-lg sm:text-xl font-bold text-on-surface truncate">
              Liquidar comisión
            </h2>
            <p className="text-sm text-on-surface-variant mt-0.5 truncate">{member.full_name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="settle-from" className="text-[13px] font-semibold text-on-surface block">
                Desde
              </label>
              <input
                id="settle-from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="settle-to" className="text-[13px] font-semibold text-on-surface block">
                Hasta <span className="font-normal text-on-surface-variant">(incluido)</span>
              </label>
              <input
                id="settle-to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {!rangeIsValid && (
            <p role="alert" className="text-xs font-medium text-error">
              El período termina antes de empezar.
            </p>
          )}

          {/* Detalle. Lo que se destilda sale de la liquidación y queda
              pendiente para la próxima: no se pierde, se posterga. */}
          <div className="rounded-2xl border border-outline-variant/15 overflow-hidden">
            <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant/10 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-on-surface">Comisiones pendientes</h3>
              <span className="text-xs text-on-surface-variant">
                {loading ? "…" : `${included.length} de ${items.length}`}
              </span>
            </div>

            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-on-surface-variant">Buscando…</p>
            ) : loadError ? (
              <p role="alert" className="px-4 py-8 text-center text-sm text-error">{loadError}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-on-surface-variant">
                No hay comisiones pendientes en este período. Si ya las liquidaste, aparecen en el
                historial de abajo.
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant/10 max-h-64 overflow-y-auto">
                {items.map((item) => {
                  const isIncluded = !excluded.has(item.id);
                  return (
                    <li key={item.id}>
                      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-container-low transition-colors">
                        <input
                          type="checkbox"
                          checked={isIncluded}
                          onChange={() => toggle(item.id)}
                          className="w-4 h-4 shrink-0 accent-[#6063ee]"
                          aria-label={`Incluir ${item.product_name} en la liquidación`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${isIncluded ? "text-on-surface" : "text-on-surface-variant line-through"}`}>
                            {item.product_name}
                          </p>
                          <p className="text-xs text-on-surface-variant truncate">
                            #{item.sale_number} ·{" "}
                            {item.created_at
                              ? new Date(item.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })
                              : "—"}
                            {item.customer_name ? ` · ${item.customer_name}` : ""}
                            {item.quantity > 1 ? ` · x${item.quantity}` : ""}
                          </p>
                        </div>
                        <span className={`shrink-0 text-sm font-bold tabular-nums ${isIncluded ? "text-on-surface" : "text-on-surface-variant/50"}`}>
                          ${money(item.commissionAmount)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Método de pago"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
            >
              {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <div className="space-y-1.5">
              <label htmlFor="settle-paid-on" className="text-[13px] font-semibold text-on-surface block">
                Fecha de pago
              </label>
              <input
                id="settle-paid-on"
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/15 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-on-surface">Total a pagar</span>
              <span className="text-2xl font-bold text-on-surface tabular-nums">${money(total)}</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-2">
              Se registra como gasto en la categoría <strong>Comisiones</strong>, con la fecha de pago.
            </p>
            {/* El efectivo sale de un cajón que alguien va a contar. Decirlo
                acá evita las dos sorpresas: creer que descontó cuando no, y
                encontrarse un faltante al cerrar turno sin saber por qué. */}
            {paymentMethod === "efectivo" && cashShiftId !== "unknown" && (
              <p className="text-xs mt-2 pt-2 border-t border-outline-variant/10 text-on-surface-variant">
                {cashShiftId ? (
                  <>
                    <strong className="text-on-surface">Sale de la caja:</strong> se descuenta del
                    arqueo del turno abierto, así al cerrarlo no aparece como faltante.
                  </>
                ) : (
                  <>
                    <strong className="text-on-surface">No hay turno abierto:</strong> el gasto queda
                    registrado igual, pero ningún arqueo lo va a descontar.
                  </>
                )}
              </p>
            )}
            {paymentMethod !== "efectivo" && (
              <p className="text-xs mt-2 pt-2 border-t border-outline-variant/10 text-on-surface-variant">
                No toca la caja del mostrador: la plata sale del banco.
              </p>
            )}
          </div>

          {storeError && (
            <p role="alert" className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
              {storeError}
            </p>
          )}
        </form>

        <div className="p-4 sm:p-6 border-t border-outline-variant/10 flex flex-col sm:flex-row gap-3 shrink-0 bg-surface-container">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-5 py-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSettle}
            className="flex-1 px-5 py-3 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Liquidando…" : `Liquidar $${money(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

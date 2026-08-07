"use client";

import Link from "next/link";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/services/purchase-orders.service";
import { CollectionLoading } from "@/components/CollectionState";

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Borrador",
  issued: "Emitida",
  received: "Recibida",
  cancelled: "Cancelada",
};

const STATUS_STYLE: Record<PurchaseOrderStatus, string> = {
  draft: "bg-surface-container-high text-on-surface-variant",
  issued: "bg-primary/10 text-primary",
  received: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-error-container/20 text-error-dim",
};

const money = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

/**
 * Historial de pedidos del negocio.
 *
 * Un borrador se retoma en el armador; una orden emitida se marca como recibida
 * y ahí se registra la compra que suma el stock. La recibida ya no se toca: es
 * el documento de lo que pasó.
 */
export function SavedOrders({
  orders,
  loading,
  submitting,
  onResume,
  onReceive,
  onCancel,
}: {
  orders: PurchaseOrder[];
  loading: boolean;
  submitting: boolean;
  onResume: (order: PurchaseOrder) => void;
  onReceive: (order: PurchaseOrder) => void;
  onCancel: (id: string) => void;
}) {
  if (loading && orders.length === 0) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10">
        <CollectionLoading label="Cargando pedidos…" />
      </div>
    );
  }

  if (orders.length === 0) return null;

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant/10">
        <h2 className="text-sm font-bold text-on-surface">Pedidos guardados</h2>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Retoma un borrador o marca una orden como recibida para registrar la compra.
        </p>
      </div>

      <ul className="divide-y divide-outline-variant/10">
        {orders.map((order) => {
          const total = order.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
          const unidades = order.items.reduce((sum, i) => sum + i.quantity, 0);

          return (
            <li key={order.id} className="px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-on-surface tabular-nums">
                    #{order.order_number}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${STATUS_STYLE[order.status]}`}
                  >
                    {STATUS_LABEL[order.status]}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {order.distributor_name ?? "Sin proveedor"}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">
                  {order.items.length} producto{order.items.length === 1 ? "" : "s"} ·{" "}
                  {unidades} unidad{unidades === 1 ? "" : "es"} · {money(total)} ·{" "}
                  {fecha(order.created_at)}
                </p>
                {/* Solo pueden quedar así las órdenes emitidas antes de que se
                    exigiera proveedor al emitir. */}
                {order.status === "issued" && !order.distributor_id && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    Sin proveedor: no se puede registrar como compra. Cancélalo y vuelve a armarlo.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {order.status === "draft" && (
                  <>
                    <button
                      type="button"
                      onClick={() => onResume(order)}
                      className="px-4 py-2 rounded-xl border border-outline-variant/20 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
                    >
                      Retomar
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancel(order.id)}
                      disabled={submitting}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                    >
                      Descartar
                    </button>
                  </>
                )}

                {order.status === "issued" && (
                  <>
                    {/* Recibir crea la factura de compra, y una compra sin
                        proveedor no existe. Se avisa acá en vez de dejar que
                        el clic falle. */}
                    <button
                      type="button"
                      onClick={() => onReceive(order)}
                      disabled={submitting || !order.distributor_id}
                      title={
                        !order.distributor_id
                          ? "Asígnale un proveedor al pedido para poder registrarlo como compra"
                          : undefined
                      }
                      className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Recibiendo…" : "Recibir"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancel(order.id)}
                      disabled={submitting}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </>
                )}

                {order.status === "received" && order.invoice_id && (
                  <Link
                    href="/dashboard/purchases"
                    className="px-4 py-2 rounded-xl border border-outline-variant/20 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    Ver compra
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

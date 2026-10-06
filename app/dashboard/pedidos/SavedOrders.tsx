"use client";

import { useState } from "react";
import Link from "next/link";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/services/purchase-orders.service";
import { isOpenStatus } from "@/services/purchase-orders.service";
import { CollectionLoading } from "@/components/CollectionState";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { backdropProps } from "@/components/modal";
import { IconTrash } from "@/app/assets/icons/DashboardIcons";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/components/ui/ConfirmDialog";

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Borrador",
  issued: "Pendiente",
  received: "Recibido",
  completed: "Completado",
  cancelled: "Cancelado",
};

const STATUS_STYLE: Record<PurchaseOrderStatus, string> = {
  draft: "bg-surface-container-high text-on-surface-variant",
  issued: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  received: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-error-container/20 text-error-dim",
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

const totalOf = (order: PurchaseOrder) =>
  order.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

const unitsOf = (order: PurchaseOrder) =>
  order.items.reduce((sum, i) => sum + i.quantity, 0);

function IconEye(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Historial de pedidos del negocio.
 *
 * Los estados ABIERTOS (borrador y pendiente) son los que retienen a sus
 * productos fuera de las sugerencias de reposición: por eso la tabla los marca,
 * para que se entienda por qué un producto bajo de stock no aparece en la lista
 * de faltantes.
 *
 * "Recibir y registrar compra" es la acción principal de un pedido pendiente:
 * crea la factura de compra y suma stock. "Completar" queda como secundaria y
 * pide confirmación, porque cierra el pedido SIN sumar stock — se confundía con
 * recibir y dejaba el inventario corto sin que nadie lo notara. Las tres
 * acciones que cambian el pedido (recibir, completar, cancelar) confirman.
 */
export function SavedOrders({
  orders,
  loading,
  submitting,
  onResume,
  onReceive,
  onComplete,
  onCancel,
}: {
  orders: PurchaseOrder[];
  loading: boolean;
  submitting: boolean;
  onResume: (order: PurchaseOrder) => void;
  onReceive: (order: PurchaseOrder) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const { confirm, dialog } = useConfirm();

  /**
   * Recibir crea una factura de compra pagada y suma stock: desde la fila,
   * donde el dedo va rápido, no puede quedar a un solo clic.
   */
  const askReceive = async (o: PurchaseOrder) => {
    const ok = await confirm({
      title: `¿Recibir el pedido #${o.order_number}?`,
      description: (
        <>
          <p>
            Se registra la compra a {o.distributor_name ?? "el proveedor"} por{" "}
            <strong className="text-on-surface">{formatMoney(totalOf(o))}</strong> y se suman{" "}
            {unitsOf(o)} unidades al stock de {o.items.length} producto
            {o.items.length !== 1 ? "s" : ""}.
          </p>
        </>
      ),
      confirmLabel: "Recibir y registrar",
    });
    if (ok) onReceive(o);
  };

  const askComplete = async (o: PurchaseOrder) => {
    const ok = await confirm({
      title: `¿Completar el pedido #${o.order_number} sin recibirlo?`,
      description: (
        <>
          <p>
            <strong className="text-on-surface">Cierra el pedido sin sumar stock</strong> ni
            registrar la compra. Úsalo solo si la mercancía ya la registraste por otro lado.
          </p>
          <p>Si te llegó la mercancía, usa «Recibir y registrar compra».</p>
        </>
      ),
      confirmLabel: "Completar sin sumar stock",
    });
    if (ok) onComplete(o.id);
  };

  const askCancel = async (o: PurchaseOrder) => {
    const ok = await confirm({
      title: `¿Cancelar el pedido #${o.order_number}?`,
      description:
        "El pedido queda cancelado y sus productos vuelven a sugerirse como faltantes. No se puede reabrir.",
      tone: "danger",
      confirmLabel: "Cancelar pedido",
      cancelLabel: "Volver",
    });
    if (ok) onCancel(o.id);
  };

  if (loading && orders.length === 0) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10">
        <CollectionLoading label="Cargando pedidos…" />
      </div>
    );
  }

  if (orders.length === 0) return null;

  const columns: DataColumn<PurchaseOrder>[] = [
    {
      header: "Pedido",
      mobile: "title",
      sortKey: "order_number",
      sortValue: (o) => o.order_number,
      cell: (o) => (
        <span className="font-bold text-on-surface tabular-nums">#{o.order_number}</span>
      ),
    },
    {
      header: "Proveedor",
      mobile: "subtitle",
      sortKey: "distributor_name",
      cell: (o) => (
        <span className="text-on-surface truncate block">
          {o.distributor_name ?? (
            <span className="text-on-surface-variant">Sin proveedor</span>
          )}
        </span>
      ),
    },
    {
      header: "Estado",
      mobile: "badge",
      sortKey: "status",
      cell: (o) => (
        <span
          className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${STATUS_STYLE[o.status]}`}
        >
          {STATUS_LABEL[o.status]}
        </span>
      ),
    },
    {
      header: "Productos",
      align: "center",
      mobile: "field",
      cell: (o) => (
        <span className="text-on-surface-variant tabular-nums whitespace-nowrap">
          {o.items.length} · {unitsOf(o)} u.
        </span>
      ),
    },
    {
      header: "Valor",
      align: "right",
      mobile: "trailing",
      sortKey: "total",
      sortValue: (o) => totalOf(o),
      cell: (o) => (
        <span className="font-semibold text-on-surface tabular-nums whitespace-nowrap">
          {formatMoney(totalOf(o))}
        </span>
      ),
    },
    {
      header: "Fecha",
      align: "right",
      mobile: "field",
      sortKey: "created_at",
      // El ISO ordena bien como texto; "13 ago 26" no.
      sortValue: (o) => o.created_at,
      cell: (o) => (
        <span className="text-on-surface-variant whitespace-nowrap">{fecha(o.created_at)}</span>
      ),
    },
    {
      header: "Acciones",
      align: "right",
      mobile: "actions",
      cell: (o) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setDetail(o)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label={`Ver el pedido ${o.order_number} completo`}
            title="Ver pedido completo"
          >
            <IconEye className="w-4 h-4" />
          </button>

          {o.status === "draft" && (
            <button
              type="button"
              onClick={() => onResume(o)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/20 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors whitespace-nowrap"
            >
              Retomar
            </button>
          )}

          {o.status === "issued" && (
            <>
              <button
                type="button"
                onClick={() => askReceive(o)}
                disabled={submitting || !o.distributor_id}
                className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title={
                  o.distributor_id
                    ? "Genera la factura de compra y suma el stock"
                    : "Asígnale un proveedor al pedido para poder registrarlo como compra"
                }
              >
                Recibir y registrar compra
              </button>
              {/* Secundario y con confirmación: cierra el pedido y libera sus
                  productos, pero NO toca inventario. */}
              <button
                type="button"
                onClick={() => askComplete(o)}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/20 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50 whitespace-nowrap"
                title="Cierra el pedido sin sumar stock"
              >
                Completar
              </button>
            </>
          )}

          {isOpenStatus(o.status) && (
            <button
              type="button"
              onClick={() => askCancel(o)}
              disabled={submitting}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-error hover:bg-error/10 transition-colors disabled:opacity-50"
              aria-label={`Cancelar el pedido ${o.order_number}`}
              title="Cancelar pedido"
            >
              <IconTrash className="w-4 h-4" />
            </button>
          )}

          {o.status === "received" && o.invoice_id && (
            <Link
              href="/dashboard/purchases"
              className="px-3 py-1.5 rounded-lg border border-outline-variant/20 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors whitespace-nowrap"
            >
              Ver compra
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant/10">
        <h2 className="text-sm font-bold text-on-surface">Pedidos</h2>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Mientras un pedido esté en borrador o pendiente, sus productos no se vuelven a sugerir
          como faltantes. Recibirlo, completarlo o cancelarlo los libera; solo recibirlo suma
          stock.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        rowKey={(o) => o.id}
        caption="Pedidos de reposición"
        minWidth={860}
      />

      {detail && <OrderDetail order={detail} submitting={submitting} onReceive={askReceive} onClose={() => setDetail(null)} />}
      {dialog}
    </div>
  );
}

/**
 * Detalle completo del pedido: sus líneas, con cantidades y costos.
 *
 * También ofrece "Recibir", con la misma confirmación que la fila: crea una
 * factura de compra pagada y suma stock.
 */
function OrderDetail({
  order,
  submitting,
  onReceive,
  onClose,
}: {
  order: PurchaseOrder;
  submitting: boolean;
  onReceive: (order: PurchaseOrder) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropProps(onClose)}
    >
      <div className="bg-surface-container rounded-3xl w-full max-w-2xl max-h-[88dvh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-start gap-4 bg-surface-container-low shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-on-surface tabular-nums">
                Pedido #{order.order_number}
              </h2>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${STATUS_STYLE[order.status]}`}
              >
                {STATUS_LABEL[order.status]}
              </span>
            </div>
            <p className="text-sm text-on-surface-variant mt-1 truncate">
              {order.distributor_name ?? "Sin proveedor"} · {fecha(order.created_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
            aria-label="Cerrar"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <ul className="divide-y divide-outline-variant/10">
            {order.items.map((item) => (
              <li key={item.id} className="py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate">
                    {item.product_name}
                  </p>
                  {item.sku && (
                    <p className="text-[11px] text-on-surface-variant font-mono">{item.sku}</p>
                  )}
                </div>
                <span className="text-sm text-on-surface-variant tabular-nums shrink-0">
                  {item.quantity} × {formatMoney(item.unit_price)}
                </span>
                <span className="text-sm font-bold text-on-surface tabular-nums shrink-0 w-28 text-right">
                  {formatMoney(item.quantity * item.unit_price)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex justify-between items-baseline border-t border-outline-variant/20 pt-3">
            <span className="text-sm font-semibold text-on-surface">
              Total · {unitsOf(order)} unidades
            </span>
            <span className="text-lg font-bold text-on-surface tabular-nums">
              {formatMoney(totalOf(order))}
            </span>
          </div>

          {order.notes && (
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Notas
              </p>
              <p className="text-sm text-on-surface whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
        </div>

        {order.status === "issued" && (
          <div className="p-6 border-t border-outline-variant/10 bg-surface-container-low shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-on-surface-variant">
              Recibir genera la factura de compra y suma el stock.
            </p>
            <button
              type="button"
              onClick={() => {
                onReceive(order);
                onClose();
              }}
              disabled={submitting || !order.distributor_id}
              title={
                !order.distributor_id
                  ? "Asígnale un proveedor al pedido para poder registrarlo como compra"
                  : undefined
              }
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {submitting ? "Recibiendo…" : "Recibir y registrar compra"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import type {
  PurchaseOrder,
  ReceivePurchaseOrderOptions,
  ReceivedPurchaseStatus,
} from "@/services/purchase-orders.service";
import { orderTotal } from "@/lib/purchase-order-lines";
import { purchaseTotalsOf } from "@/lib/purchase-totals";
import { useBusinessTax } from "@/lib/useBusinessTax";
import { useFormatMoney } from "@/lib/useMoney";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

/**
 * Confirmación de "Recibir y registrar compra".
 *
 * Antes era un sí/no y la compra quedaba SIEMPRE pagada y sin IVA: un pedido
 * recibido a crédito aparecía como gasto pagado, y uno con IVA registraba un
 * costo menor al facturado. Acá se elige el estado y el impuesto, igual que en
 * el formulario de Compras. El IVA arranca en la tasa configurada del negocio
 * (`rawRate`: un negocio no responsable igual le paga IVA al proveedor).
 */
export function ReceiveOrderModal({
  order,
  submitting,
  onConfirm,
  onClose,
}: {
  order: PurchaseOrder;
  submitting: boolean;
  onConfirm: (order: PurchaseOrder, options: ReceivePurchaseOrderOptions) => void;
  onClose: () => void;
}) {
  const fmtMoney = useFormatMoney();
  const { rawRate, rawPercentLabel } = useBusinessTax();
  const [status, setStatus] = useState<ReceivedPurchaseStatus>("paid");
  const [taxOption, setTaxOption] = useState<"IVA" | "Ninguno">(rawRate > 0 ? "IVA" : "Ninguno");

  // Solo las líneas con producto del catálogo entran a la compra.
  const lines = order.items.filter((i) => i.product_id !== null);
  const skipped = order.items.length - lines.length;
  const units = lines.reduce((sum, i) => sum + i.quantity, 0);
  const taxRate = taxOption === "IVA" ? rawRate : 0;
  const totals = purchaseTotalsOf(orderTotal(lines), 0, taxRate);

  return (
    <Modal
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={`¿Recibir el pedido #${order.order_number}?`}
      description={`Se registra la compra a ${order.distributor_name ?? "el proveedor"} y se suman ${units} unidades al stock de ${lines.length} producto${lines.length !== 1 ? "s" : ""}.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Volver
          </Button>
          <Button
            onClick={() => onConfirm(order, { status, taxRate })}
            loading={submitting}
            loadingLabel="Recibiendo…"
          >
            Recibir y registrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Estado de la compra"
            value={status}
            onChange={(e) => setStatus(e.target.value as ReceivedPurchaseStatus)}
          >
            <option value="paid">Pagada</option>
            <option value="pending">Pendiente</option>
          </Select>
          <Select
            label="Impuesto"
            value={taxOption}
            onChange={(e) => setTaxOption(e.target.value as "IVA" | "Ninguno")}
          >
            <option value="IVA">IVA {rawPercentLabel}</option>
            <option value="Ninguno">Ninguno</option>
          </Select>
        </div>

        <dl className="rounded-xl bg-surface-container-low p-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Subtotal</dt>
            <dd className="tabular-nums text-on-surface">{fmtMoney(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">IVA</dt>
            <dd className="tabular-nums text-on-surface">{fmtMoney(totals.taxAmount)}</dd>
          </div>
          <div className="flex justify-between border-t border-outline-variant/20 pt-1.5">
            <dt className="font-semibold text-on-surface">Total</dt>
            <dd className="font-bold tabular-nums text-on-surface">{fmtMoney(totals.total)}</dd>
          </div>
        </dl>

        {status === "pending" && (
          <p className="text-xs text-on-surface-variant">
            Queda como cuenta por pagar al proveedor. La marcas como pagada desde Compras.
          </p>
        )}
        {skipped > 0 && (
          <p className="text-xs text-on-surface-variant">
            {skipped} producto{skipped !== 1 ? "s" : ""} escrito{skipped !== 1 ? "s" : ""} a mano no
            {skipped !== 1 ? " están" : " está"} en el catálogo y no entra
            {skipped !== 1 ? "n" : ""} a la compra.
          </p>
        )}
      </div>
    </Modal>
  );
}

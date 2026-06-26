"use client";

import { useEffect, useState } from "react";
import type { PurchaseInvoice, PurchaseInvoiceItem } from "@/services/purchases.service";
import * as purchasesService from "@/services/purchases.service";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  invoice: PurchaseInvoice;
  onClose: () => void;
}

export function PurchaseInvoiceDetailModal({ invoice, onClose }: Props) {
  const [items, setItems] = useState<PurchaseInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    purchasesService
      .fetchPurchaseInvoiceItems(invoice.id)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [invoice.id]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest rounded-[24px] w-full max-w-lg border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-6 pb-4 flex justify-between items-center border-b border-outline-variant/10 shrink-0">
          <h2 className="text-xl font-bold text-on-surface">
            Factura #{invoice.invoice_number}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-on-surface-variant text-xs font-medium">Proveedor</span>
              <p className="text-on-surface font-semibold mt-0.5">
                {invoice.distributors?.business_name ?? "—"}
              </p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs font-medium">Factura Proveedor</span>
              <p className="text-on-surface font-semibold mt-0.5 font-mono">
                {invoice.supplier_invoice_number || "—"}
              </p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs font-medium">Fecha</span>
              <p className="text-on-surface font-semibold mt-0.5">
                {new Date(invoice.issue_date).toLocaleDateString("es-ES")}
              </p>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs font-medium">Estado</span>
              <p className="text-on-surface font-semibold mt-0.5">
                {invoice.status === "paid" ? "Pagada" : invoice.status}
              </p>
            </div>
          </div>

          <div className="border-t border-outline-variant/10 pt-4">
            <h3 className="text-sm font-bold text-on-surface mb-3">Productos</h3>
            {loading ? (
              <p className="text-sm text-on-surface-variant text-center py-4">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-4">Sin productos</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between bg-surface-container-low rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {item.products?.name || item.description}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {item.quantity} × {money(item.unit_price)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-on-surface font-mono shrink-0 ml-4">
                      {money(item.line_total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-outline-variant/10 pt-4 flex justify-between items-center">
            <span className="text-sm font-semibold text-on-surface">Total</span>
            <span className="text-xl font-bold text-on-surface font-mono">
              {money(Number(invoice.total))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

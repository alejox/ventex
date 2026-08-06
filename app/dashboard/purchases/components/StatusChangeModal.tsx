import { useState } from "react";
import type { PurchaseInvoice } from "@/services/purchases.service";

/**
 * Estados a los que una compra puede moverse desde esta pantalla.
 *
 * "Anulada" NO está acá a propósito: además de cambiar la etiqueta devuelve el
 * stock al inventario, así que es una reversa y no un cambio de estado. Tiene su
 * propia acción, su propio modal, y es un camino de ida.
 */
const SELECTABLE_STATUSES = [
  { value: "paid", label: "Pagada", hint: "Ya se le pagó al proveedor." },
  { value: "pending", label: "Pendiente", hint: "Queda como deuda con el proveedor." },
];

interface StatusChangeModalProps {
  /** No admite null: el padre monta el modal solo cuando hay factura, así el
   *  estado de la selección se reinicia en cada apertura. */
  invoice: PurchaseInvoice;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (status: string) => void;
}

export function StatusChangeModal({
  invoice,
  submitting,
  onCancel,
  onConfirm,
}: StatusChangeModalProps) {
  const [selected, setSelected] = useState(invoice.status);

  const unchanged = selected === invoice.status;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-on-surface mb-2">
          Cambiar estado de la compra #{invoice.invoice_number}
        </h3>
        <p className="text-sm text-on-surface-variant mb-5">
          Elige el nuevo estado y confirma el cambio.
        </p>

        <div className="flex flex-col gap-2 mb-6">
          {SELECTABLE_STATUSES.map((option) => {
            const isSelected = selected === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelected(option.value)}
                className={`flex items-start gap-3 text-left px-4 py-3 rounded-xl border transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-outline-variant/20 hover:bg-surface-container-highest"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    option.value === "paid" ? "bg-[#10b981]" : "bg-amber-500"
                  }`}
                />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-on-surface">
                    {option.label}
                    {option.value === invoice.status && (
                      <span className="ml-2 text-xs font-normal text-on-surface-variant">
                        (actual)
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-on-surface-variant">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={submitting || unchanged}
            className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dim transition-colors disabled:opacity-50"
          >
            {submitting ? "Guardando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

import type { PurchaseInvoice } from "@/services/purchases.service";

interface CancelConfirmModalProps {
  invoice: PurchaseInvoice | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CancelConfirmModal({
  invoice,
  submitting,
  onCancel,
  onConfirm,
}: CancelConfirmModalProps) {
  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-on-surface mb-2">Anular compra</h3>
        <p className="text-sm text-on-surface-variant mb-6">
          Se devolverá el stock de todos los productos al inventario. ¿Estás seguro?
        </p>
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
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-error text-white hover:bg-error/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Anulando…" : "Sí, anular"}
          </button>
        </div>
      </div>
    </div>
  );
}

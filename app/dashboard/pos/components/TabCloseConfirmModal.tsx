import { AlertTriangle } from "lucide-react";

interface TabCloseConfirmModalProps {
  tabName: string;
  tabCartUnits: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function TabCloseConfirmModal({ tabName, tabCartUnits, onConfirm, onClose }: TabCloseConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-container-lowest rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
      >
        <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-on-surface">Eliminar esta venta</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            &laquo;{tabName}&raquo; tiene {tabCartUnits} unidad{tabCartUnits !== 1 ? "es" : ""} cargada{tabCartUnits !== 1 ? "s" : ""}. Se pierden al eliminarla.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-12 rounded-xl bg-error text-white text-sm font-semibold hover:bg-error/90 transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

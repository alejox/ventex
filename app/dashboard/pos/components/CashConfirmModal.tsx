import type { SaleTotals } from "@/services/pos.service";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const QUICK_AMOUNTS = [2000, 5000, 10000, 20000, 50000, 100000];

interface CashConfirmModalProps {
  totals: SaleTotals;
  submitting: boolean;
  amountTendered: string;
  setAmountTendered: (v: string | ((prev: string) => string)) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function CashConfirmModal({
  totals,
  submitting,
  amountTendered,
  setAmountTendered,
  onConfirm,
  onClose,
}: CashConfirmModalProps) {
  const tendered = parseFloat(amountTendered) || 0;
  const change = tendered - totals.total;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-[24px] w-full max-w-sm border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 flex justify-between items-center border-b border-outline-variant/10">
          <h2 className="text-xl font-bold text-on-surface">Pago en efectivo</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-center">
            <p className="text-sm text-on-surface-variant mb-1">Total a pagar</p>
            <p className="text-2xl sm:text-3xl font-bold text-on-surface tabular-nums tracking-tight truncate">${money(totals.total)}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-on-surface">Monto recibido ($)</label>
            <input
              autoFocus
              type="number"
              step="100"
              min="0"
              value={amountTendered}
              onChange={(e) => setAmountTendered(e.target.value)}
              placeholder="0.00"
              className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-lg text-on-surface font-bold text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setAmountTendered((prev) => String((parseFloat(prev) || 0) + amount))}
                className="py-2.5 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface transition-colors"
              >
                ${money(amount)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAmountTendered(String(totals.total))}
              className="py-2.5 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface transition-colors"
            >
              Valor exacto
            </button>
            <button
              type="button"
              onClick={() => setAmountTendered("")}
              disabled={!amountTendered}
              className="py-2.5 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-error/30 hover:text-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-outline-variant/20 disabled:hover:text-on-surface-variant"
            >
              Limpiar
            </button>
          </div>

          {tendered > 0 && (
            <div className={`flex justify-between items-center gap-3 p-3 rounded-xl ${change >= 0 ? "bg-[#10b981]/5 border border-[#10b981]/20" : "bg-error/5 border border-error/20"}`}>
              <span className="font-semibold text-sm text-on-surface-variant shrink-0">Cambio</span>
              <span className={`text-lg sm:text-xl font-bold tabular-nums tracking-tight truncate ${change >= 0 ? "text-[#10b981]" : "text-error"}`}>
                {change >= 0 ? `$${money(change)}` : `Faltan $${money(Math.abs(change))}`}
              </span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={tendered < totals.total || submitting}
              className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                "Confirmar pago"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

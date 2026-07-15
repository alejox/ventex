"use client";

import { usePosStore } from "@/stores/pos.store";
import type { PaymentMethod } from "@/services/pos.service";
import { backdropProps } from "@/components/modal";

interface SaleConfigModalProps {
  onClose: () => void;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
];

export function SaleConfigModal({ onClose }: SaleConfigModalProps) {
  const staff = usePosStore((s) => s.staff);
  const customers = usePosStore((s) => s.customers);
  const includeTax = usePosStore((s) => s.includeTax);
  const setIncludeTax = usePosStore((s) => s.setIncludeTax);
  const defaultPaymentMethod = usePosStore((s) => s.defaultPaymentMethod);
  const setDefaultPaymentMethod = usePosStore((s) => s.setDefaultPaymentMethod);
  const defaultStaffId = usePosStore((s) => s.defaultStaffId);
  const setDefaultStaffId = usePosStore((s) => s.setDefaultStaffId);
  const defaultCustomerId = usePosStore((s) => s.defaultCustomerId);
  const setDefaultCustomerId = usePosStore((s) => s.setDefaultCustomerId);

  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200" {...backdropProps(onClose)}>
      <div
        className="bg-surface-container-lowest h-full w-[400px] max-w-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
          <h2 className="text-xl font-bold text-on-surface">Configuración de venta</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-on-surface">Método de pago predefinido</label>
            <select
              value={defaultPaymentMethod}
              onChange={(e) => setDefaultPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full bg-transparent border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary appearance-none"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {staff.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface">Vendedor por defecto</label>
              <select
                value={defaultStaffId ?? ""}
                onChange={(e) => setDefaultStaffId(e.target.value || null)}
                className="w-full bg-transparent border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary appearance-none"
              >
                <option value="">—</option>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
          )}

          {customers.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface">Cliente por defecto</label>
              <select
                value={defaultCustomerId ?? ""}
                onChange={(e) => setDefaultCustomerId(e.target.value || null)}
                className="w-full bg-transparent border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary appearance-none"
              >
                <option value="">Consumidor final (22222222222)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.tax_exempt ? " (exento)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Incluir IVA */}
          <div className="space-y-2 pt-4 border-t border-outline-variant/10">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-on-surface">Incluir IVA</h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={includeTax}
                  onChange={(e) => setIncludeTax(e.target.checked)}
                />
                <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Si desactivas esta opción, el cálculo de impuestos se omitirá en el total de la venta actual.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-outline-variant/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-outline-variant/30 hover:bg-surface-container-low text-on-surface font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

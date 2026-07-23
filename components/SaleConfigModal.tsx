"use client";

import { useState } from "react";
import { usePosStore } from "@/stores/pos.store";
import { useProfile } from "@/components/ProfileProvider";
import type { PaymentMethod } from "@/services/pos.service";
import { backdropProps } from "@/components/modal";
import { Select } from "@/components/ui/Select";
import { notifySuccess, notifyError } from "@/lib/notifications";

interface SaleConfigModalProps {
  onClose: () => void;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Datáfono" },
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

  const [saving, setSaving] = useState(false);
  // Espejo de la RLS de `settings`: el dueño siempre, el empleado solo con el
  // permiso `settings`. Acá es UX (deshabilitar y explicar); quien manda es la
  // policy, que devuelve 0 filas si no corresponde.
  const profile = useProfile();
  const canEditTax = !profile?.isWorker || Boolean(profile?.workerPermissions?.settings);

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
          <Select
            label="Método de pago predefinido"
            value={defaultPaymentMethod}
            onChange={(e) => setDefaultPaymentMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>

          {staff.length > 0 && (
            <Select
              label="Vendedor por defecto"
              value={defaultStaffId ?? ""}
              onChange={(e) => setDefaultStaffId(e.target.value || null)}
            >
              <option value="">—</option>
              {staff.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </Select>
          )}

          {customers.length > 0 && (
            <Select
              label="Cliente por defecto"
              value={defaultCustomerId ?? ""}
              onChange={(e) => setDefaultCustomerId(e.target.value || null)}
            >
              <option value="">Consumidor final (22222222222)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.tax_exempt ? " (exento)" : ""}
                </option>
              ))}
            </Select>
          )}

          {/* Desglosar IVA. Es configuración del NEGOCIO y queda guardada:
              la misma columna `settings.include_tax` que edita Configuración. */}
          <div className="space-y-2 pt-4 border-t border-outline-variant/10">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-on-surface">Desglosar IVA</h3>
              <label
                className={`relative inline-flex items-center ${canEditTax ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
              >
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={includeTax}
                  disabled={!canEditTax || saving}
                  onChange={async (e) => {
                    setSaving(true);
                    const ok = await setIncludeTax(e.target.checked);
                    setSaving(false);
                    if (ok) {
                      notifySuccess(
                        e.target.checked ? "IVA desglosado" : "IVA sin desglosar",
                        "Queda guardado para las próximas ventas.",
                      );
                    } else {
                      notifyError(
                        "No se pudo guardar",
                        "No tenés permiso para cambiar la configuración del negocio.",
                      );
                    }
                  }}
                />
                <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {canEditTax
                ? "Se guarda en la configuración del negocio y vale para todas las ventas, no solo para esta. Los precios del catálogo ya incluyen el IVA: esto decide si la venta y el recibo separan la base del impuesto."
                : "Solo el dueño (o un empleado con permiso de configuración) puede cambiar el desglose de IVA."}
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

"use client";

import { useState } from "react";
import { usePosStore } from "@/stores/pos.store";
import { useProfile } from "@/components/ProfileProvider";
import type { PaymentMethod } from "@/services/pos.service";
import { Select } from "@/components/ui/Select";
import { notifySuccess, notifyError } from "@/lib/notifications";
import { Switch } from "@/components/ui/Switch";
import { Modal } from "@/components/ui/Modal";

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
    <Modal
      open
      onClose={onClose}
      title="Configuración de venta"
      placement="right"
      className="max-w-[400px]!"
      bodyClassName="flex flex-col border-t border-outline-variant/10"
    >
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
              <h3 id="sale-config-include-tax" className="text-sm font-semibold text-on-surface">Desglosar IVA</h3>
              <Switch
                aria-labelledby="sale-config-include-tax"
                checked={includeTax}
                disabled={!canEditTax || saving}
                onCheckedChange={async (next) => {
                  setSaving(true);
                  const ok = await setIncludeTax(next);
                  setSaving(false);
                  if (ok) {
                    notifySuccess(
                      next ? "IVA desglosado" : "IVA sin desglosar",
                      "Queda guardado para las próximas ventas.",
                    );
                  } else {
                    notifyError(
                      "No se pudo guardar",
                      "No tienes permiso para cambiar la configuración del negocio.",
                    );
                  }
                }}
              />
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
    </Modal>
  );
}

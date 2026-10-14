"use client";

import { usePosStore } from "@/stores/pos.store";
import type { PaymentMethod } from "@/services/pos.service";
import { Select } from "@/components/ui/Select";
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
  const defaultPaymentMethod = usePosStore((s) => s.defaultPaymentMethod);
  const setDefaultPaymentMethod = usePosStore((s) => s.setDefaultPaymentMethod);
  const defaultStaffId = usePosStore((s) => s.defaultStaffId);
  const setDefaultStaffId = usePosStore((s) => s.setDefaultStaffId);
  const defaultCustomerId = usePosStore((s) => s.defaultCustomerId);
  const setDefaultCustomerId = usePosStore((s) => s.setDefaultCustomerId);

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
                  {includeTax && c.tax_exempt ? " (exento)" : ""}
                </option>
              ))}
            </Select>
          )}
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

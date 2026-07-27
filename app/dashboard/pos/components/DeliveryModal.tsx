"use client";

import { useEffect } from "react";
import { useDeliveryStore } from "@/stores/delivery.store";
import type { DeliveryData } from "@/stores/pos.store";

interface DeliveryModalProps {
  totals: { total: number };
  deliveryData: DeliveryData;
  setDeliveryData: (data: Partial<DeliveryData>) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeliveryModal({
  totals,
  deliveryData,
  setDeliveryData,
  onConfirm,
  onClose,
}: DeliveryModalProps) {
  const persons = useDeliveryStore((s) => s.persons);
  const fetchPersons = useDeliveryStore((s) => s.fetchPersons);
  const addPerson = useDeliveryStore((s) => s.addPerson);

  useEffect(() => {
    fetchPersons();
  }, [fetchPersons]);

  const valid =
    deliveryData.address.trim().length > 0 &&
    deliveryData.personId !== null;

  return (
    <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-t-[24px] sm:rounded-[24px] w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="p-6 pb-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-on-surface">Domicilio</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 pt-0 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Dirección <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={deliveryData.address}
              onChange={(e) => setDeliveryData({ address: e.target.value })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Cra 10 #15-20, Barrio Centro"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Valor envío
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">$</span>
                <input
                  type="number"
                  step="500"
                  min="0"
                  value={deliveryData.fee || ""}
                  onChange={(e) => setDeliveryData({ fee: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 pl-7 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Domiciliario <span className="text-primary">*</span>
              </label>
              <div className="flex gap-1.5">
                <select
                  value={deliveryData.personId ?? ""}
                  onChange={(e) => setDeliveryData({ personId: e.target.value || null })}
                  className="flex-1 min-w-0 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Seleccionar</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    const name = window.prompt("Nombre del domiciliario:");
                    if (!name?.trim()) return;
                    const phone = window.prompt("Teléfono:") ?? "";
                    const person = await addPerson({ name: name.trim(), phone });
                    if (person && typeof person !== "boolean") {
                      setDeliveryData({ personId: person.id });
                    }
                  }}
                  className="shrink-0 w-11 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                  title="Nuevo domiciliario"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Notas
            </label>
            <input
              type="text"
              value={deliveryData.notes}
              onChange={(e) => setDeliveryData({ notes: e.target.value })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Ej. Timbre 301, llamar antes"
            />
          </div>

          <div className="pt-2 flex justify-between text-sm">
            <span className="text-on-surface-variant">Total venta</span>
            <span className="text-on-surface font-bold">
              ${totals.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!valid}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-primary hover:bg-primary-dim text-on-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirmar y cobrar
          </button>
        </div>
      </div>
    </div>
  );
}

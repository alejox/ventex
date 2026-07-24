"use client";

import { useState } from "react";
import { useDistributorsStore } from "@/stores/distributors.store";
import { Select } from "@/components/ui/Select";
import { notifySuccess } from "@/lib/notifications";

interface DistributorQuickModalProps {
  onClose: () => void;
  onCreated: (id: string, businessName: string) => void;
}

const DOC_TYPES = ["NIT", "CC", "RUT", "RFC"];

export function DistributorQuickModal({ onClose, onCreated }: DistributorQuickModalProps) {
  const addDistributor = useDistributorsStore((s) => s.addDistributor);
  const submitting = useDistributorsStore((s) => s.submitting);
  const storeError = useDistributorsStore((s) => s.error);

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [docType, setDocType] = useState("NIT");
  const [rfcRut, setRfcRut] = useState("");
  const [dv, setDv] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addDistributor({
      business_name: businessName,
      contact_name: contactName,
      email: "",
      phone,
      whatsapp: phone,
      address: "",
      rfc_rut: rfcRut,
      doc_type: docType,
      dv,
    });
    if (ok) {
      notifySuccess(
        "¡Proveedor creado con éxito! 🎉",
        "El proveedor ya está disponible en tu base de datos."
      );
      onCreated("", businessName);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-surface-container-lowest rounded-[24px] w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-3 flex justify-between items-center">
          <h2 className="text-lg font-bold text-on-surface">Nuevo Proveedor</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 pt-2 space-y-4">
          {storeError && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {storeError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">Nombre del Negocio *</label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="Ej. Distribuidora XYZ"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">Contacto</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="Nombre"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">Teléfono</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="+57 300..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">Documento</label>
            <div className="flex gap-2">
              <Select
                aria-label="Tipo de documento"
                containerClassName="w-24 shrink-0"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <input
                type="text"
                value={rfcRut}
                onChange={(e) => setRfcRut(e.target.value)}
                className="flex-1 bg-surface-container-low border border-outline-variant/20 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                placeholder="Número"
              />
              <input
                type="text"
                maxLength={2}
                value={dv}
                onChange={(e) => setDv(e.target.value.replace(/\D/g, ""))}
                className="w-14 shrink-0 bg-surface-container-low border border-outline-variant/20 rounded-xl py-2.5 px-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-center"
                placeholder="DV"
                title="Dígito de verificación"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando…" : "Guardar Proveedor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";
import { usePosStore } from "@/stores/pos.store";
import { notifySuccess } from "@/lib/notifications";
import { Modal } from "@/components/ui/Modal";

interface CustomerModalProps {
  onClose: () => void;
}

const DOC_TYPES = [
  { value: "CC", label: "Cédula de Ciudadanía" },
  { value: "CE", label: "Cédula de Extranjería" },
  { value: "NIT", label: "NIT" },
  { value: "PP", label: "Pasaporte" },
];

export function CustomerModal({ onClose }: CustomerModalProps) {
  const addCustomer = usePosStore((s) => s.addCustomer);
  const [name, setName] = useState("");
  const [docType, setDocType] = useState("CC");
  const [identification, setIdentification] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    const ok = await addCustomer({
      name: name.trim(),
      doc_type: docType,
      identification: identification.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
    });
    setLoading(false);

    if (ok) {
      notifySuccess(
        "¡Cliente registrado con éxito! 🎉",
        "El cliente ha sido añadido a tu base de datos."
      );
      onClose();
    }
  };

  return (
    <Modal open className="max-w-md!" onClose={onClose} title="Registrar Cliente" bodyClassName="border-t border-outline-variant/10">

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
              Nombre completo <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Juan Pérez"
              required
              data-autofocus
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Select
              label="Tipo"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value}
                </option>
              ))}
            </Select>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-on-surface">Identificación</label>
              <input
                type="text"
                value={identification}
                onChange={(e) => setIdentification(e.target.value)}
                placeholder="Número"
                inputMode="numeric"
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Opcionales, y sin asterisco: en el mostrador hay una fila esperando.
              Pero cargarlos acá evita tener que ir a Clientes después para poder
              mandar un domicilio o un comprobante. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="customer-phone" className="text-sm font-semibold text-on-surface">
                Tel&eacute;fono
              </label>
              <input
                id="customer-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Opcional"
                inputMode="tel"
                autoComplete="tel"
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="customer-email" className="text-sm font-semibold text-on-surface">
                Correo
              </label>
              <input
                id="customer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Opcional"
                inputMode="email"
                autoComplete="email"
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Guardando..." : "Guardar Cliente"}
            </button>
          </div>
        </form>
    </Modal>
  );
}

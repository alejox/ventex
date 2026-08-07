"use client";

import { useEffect, useState } from "react";
import { useDistributorsStore } from "@/stores/distributors.store";
import { Select } from "@/components/ui/Select";
import { CitySelect } from "@/components/CitySelect";
import { notifySuccess } from "@/lib/notifications";

interface DistributorQuickModalProps {
  onClose: () => void;
  /** Recibe el id real del proveedor creado, para dejarlo seleccionado. */
  onCreated: (id: string, businessName: string) => void;
}

const DOC_TYPES = ["NIT", "CC", "RUT", "RFC"];

/**
 * Alta rápida de proveedor, como panel lateral.
 *
 * Es un drawer y no un modal centrado porque siempre se abre ENCIMA de un
 * formulario a medio llenar —una compra, un producto—: dejar el formulario a la
 * vista al costado hace evidente que no se perdió nada, cosa que un modal
 * centrado que tapa la pantalla no comunica.
 */
export function DistributorQuickModal({ onClose, onCreated }: DistributorQuickModalProps) {
  const addDistributor = useDistributorsStore((s) => s.addDistributor);
  const submitting = useDistributorsStore((s) => s.submitting);
  const storeError = useDistributorsStore((s) => s.error);

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [docType, setDocType] = useState("NIT");
  const [rfcRut, setRfcRut] = useState("");
  const [dv, setDv] = useState("");

  // Escape cierra: el drawer se abre sobre otro formulario y quedar atrapado en
  // él sin poder volver con el teclado es la queja clásica de este patrón.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await addDistributor({
      business_name: businessName,
      contact_name: contactName,
      email,
      phone,
      whatsapp: phone,
      address,
      city,
      rfc_rut: rfcRut,
      doc_type: docType,
      dv,
    });
    if (created) {
      notifySuccess(
        "¡Proveedor creado con éxito! 🎉",
        "El proveedor ya está disponible en tu base de datos."
      );
      onCreated(created.id, created.business_name);
      onClose();
    }
  };

  // Sin ancho: quien lo usa decide. Si el estilo base trajera `w-full`, en una
  // fila flex chocaría con el `w-14` del DV y el ganador lo decide el orden del
  // CSS generado, no el de la cadena de clases.
  const field =
    "bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/40";
  const labelClass = "text-[13px] font-semibold text-on-surface block";

  return (
    <div
      className="fixed inset-0 z-[200] flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo proveedor"
        className="bg-surface-container-lowest w-full sm:max-w-md h-full border-l border-outline-variant/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 pt-5 pb-4 flex justify-between items-start gap-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Nuevo proveedor</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Crea los proveedores que asociarás a tus facturas de compra.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-4">
            <div className="border-t border-outline-variant/10 pt-4">
              <h3 className="text-sm font-semibold text-on-surface">Datos generales</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Ingresa la información principal de tu proveedor.
              </p>
            </div>

            {storeError && (
              <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                {storeError}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="dist-name" className={labelClass}>
                Razón social / Nombre completo <span className="text-error">*</span>
              </label>
              <input
                id="dist-name"
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value.toUpperCase())}
                className={`${field} w-full`}
                placeholder="Ej. Distribuidora XYZ"
              />
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Identificación</label>
              <div className="flex gap-2">
                <Select
                  aria-label="Tipo de identificación"
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
                  className={`${field} flex-1 min-w-0 font-mono`}
                  placeholder="Número"
                  aria-label="Número de identificación"
                />
                <input
                  type="text"
                  maxLength={2}
                  value={dv}
                  onChange={(e) => setDv(e.target.value.replace(/\D/g, ""))}
                  className={`${field} w-14 shrink-0 px-2 font-mono text-center`}
                  placeholder="DV"
                  aria-label="Dígito de verificación"
                  title="Dígito de verificación"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="dist-contact" className={labelClass}>Contacto</label>
                <input
                  id="dist-contact"
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={`${field} w-full`}
                  placeholder="Nombre"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="dist-phone" className={labelClass}>Teléfono</label>
                <input
                  id="dist-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`${field} w-full`}
                  placeholder="+57 300…"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-email" className={labelClass}>Correo</label>
              <input
                id="dist-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${field} w-full`}
                placeholder="proveedor@correo.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-address" className={labelClass}>Dirección</label>
              <input
                id="dist-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value.toUpperCase())}
                className={`${field} w-full`}
                placeholder="Calle 72 # 23-08"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-city" className={labelClass}>Ciudad</label>
              <CitySelect
                id="dist-city"
                value={city}
                onChange={setCity}
                className={`${field} w-full`}
              />
            </div>
          </div>

          <footer className="shrink-0 px-5 py-4 border-t border-outline-variant/10 bg-surface-container-low flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !businessName.trim()}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando…" : "Guardar proveedor"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { IconPlus } from "@/app/assets/icons/DashboardIcons";
import { useDistributorsStore } from "@/stores/distributors.store";
import type { NewDistributorInput } from "@/services/distributors.service";

function IconTruck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

const DOC_TYPES = ["NIT", "CC", "RUT", "RFC"];

const EMPTY_DISTRIBUTOR: NewDistributorInput = {
  business_name: "",
  contact_name: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  rfc_rut: "",
  doc_type: "NIT",
};

export default function DistributorsPage() {
  const distributors = useDistributorsStore((s) => s.distributors);
  const loading = useDistributorsStore((s) => s.loading);
  const error = useDistributorsStore((s) => s.error);
  const submitting = useDistributorsStore((s) => s.submitting);
  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);
  const addDistributor = useDistributorsStore((s) => s.addDistributor);
  const updateDistributor = useDistributorsStore((s) => s.updateDistributor);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<NewDistributorInput>(EMPTY_DISTRIBUTOR);

  useEffect(() => {
    fetchDistributors();
  }, [fetchDistributors]);

  const openCreateModal = () => {
    setEditId(null);
    setForm(EMPTY_DISTRIBUTOR);
    setModalOpen(true);
  };

  const openEditModal = (d: typeof distributors[number]) => {
    setEditId(d.id);
    setForm({
      business_name: d.business_name,
      contact_name: d.contact_name ?? "",
      email: d.email ?? "",
      phone: d.phone ?? "",
      whatsapp: d.whatsapp ?? "",
      address: d.address ?? "",
      rfc_rut: d.rfc_rut ?? "",
      doc_type: d.doc_type ?? "NIT",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = editId
      ? await updateDistributor(editId, form)
      : await addDistributor(form);
    if (ok) {
      setModalOpen(false);
      setEditId(null);
      setForm(EMPTY_DISTRIBUTOR);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditId(null);
    setForm(EMPTY_DISTRIBUTOR);
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Proveedores</h1>
          <p className="text-sm text-on-surface-variant mt-1">Gestiona tus proveedores.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Añadir Proveedor</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando proveedores…</p>
      ) : distributors.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconTruck />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay proveedores</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Registra a tus proveedores para gestionar pedidos, pagos y stock de forma centralizada.
          </p>
          <button
            onClick={openCreateModal}
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Añadir tu primer proveedor
          </button>
        </div>
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                  <th className="p-4 pl-6">Negocio</th>
                  <th className="p-4">Contacto</th>
                  <th className="p-4">Teléfono</th>
                  <th className="p-4">WhatsApp</th>
                  <th className="p-4">Documento</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5 text-sm">
                {distributors.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="p-4 pl-6 font-medium text-on-surface">{d.business_name}</td>
                    <td className="p-4 text-on-surface-variant">
                      <div>{d.contact_name ?? "—"}</div>
                      <div className="text-xs text-on-surface-variant/70">{d.email ?? ""}</div>
                    </td>
                    <td className="p-4 text-on-surface-variant">{d.phone ?? "—"}</td>
                    <td className="p-4 text-on-surface-variant">{d.whatsapp ?? "—"}</td>
                    <td className="p-4 text-on-surface-variant font-mono text-xs">{d.doc_type ? `${d.doc_type} ${d.rfc_rut}` : (d.rfc_rut ?? "—")}</td>
                    <td className="p-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                          d.status === "active"
                            ? "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20"
                            : "bg-surface-variant text-on-surface-variant border-transparent"
                        }`}
                      >
                        {d.status === "active" ? "Activo" : d.status}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(d)}
                          className="w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Editar proveedor"
                        >
                          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuevo / Editar Proveedor */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                {editId ? "Editar Proveedor" : "Nuevo Proveedor"}
              </h2>
              <button
                onClick={handleCloseModal}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
              {error && (
                <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Nombre del Negocio</label>
                <input
                  type="text"
                  required
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej. Proveedora del Norte S.A."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Nombre del Contacto</label>
                  <input
                    type="text"
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="Ej. Juan Pérez"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Correo Electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="contacto@proveedora.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Teléfono</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="+52 55 1234 5678"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">
                  WhatsApp para pedidos
                </label>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="+52 55 1234 5678"
                />
                <p className="text-xs text-on-surface-variant/60">N&uacute;mero al que se enviar&aacute;n las &oacute;rdenes de compra.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Documento</label>
                <div className="flex gap-2">
                  <select
                    value={form.doc_type}
                    onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
                    className="w-24 shrink-0 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={form.rfc_rut}
                    onChange={(e) => setForm({ ...form, rfc_rut: e.target.value })}
                    className="flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono placeholder:text-on-surface-variant/50"
                    placeholder="Número de documento"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Dirección</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 resize-none"
                  placeholder="Calle, ciudad, estado, código postal"
                />
              </div>

              <div className="pt-4 flex flex-col-reverse sm:flex-row gap-3 border-t border-outline-variant/10">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Guardando…" : editId ? "Actualizar Proveedor" : "Guardar Proveedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

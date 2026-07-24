"use client";

import { useEffect, useState } from "react";
import { IconUsers, IconPlus } from "@/app/assets/icons/DashboardIcons";
import { useCustomersStore } from "@/stores/customers.store";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { Select } from "@/components/ui/Select";
import type { Customer, NewCustomerInput } from "@/services/customers.service";

const DOC_TYPES = ["CC", "NIT", "RUT", "RFC"];

const CUSTOMER_COLUMNS: DataColumn<Customer>[] = [
  {
    header: "Nombre",
    mobile: "title",
    className: "pl-6 font-medium text-on-surface",
    headerClassName: "pl-6",
    cell: (c) => c.full_name,
  },
  {
    header: "Contacto",
    mobile: "subtitle",
    className: "text-on-surface-variant",
    cell: (c) => (
      <>
        <div>{c.email ?? "—"}</div>
        <div className="text-xs text-on-surface-variant/70">{c.phone ?? ""}</div>
      </>
    ),
  },
  {
    header: "Documento",
    className: "text-on-surface-variant font-mono text-xs",
    cell: (c) => (
      <span className="font-mono text-xs">
        {c.doc_type ? `${c.doc_type} ${c.identification}` : (c.identification ?? "—")}
      </span>
    ),
  },
  {
    header: "Impuestos",
    align: "center",
    mobile: "badge",
    cell: (c) =>
      c.tax_exempt ? (
        <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20">
          Exento
        </span>
      ) : (
        <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold bg-surface-variant text-on-surface-variant">
          Aplica IVA
        </span>
      ),
  },
];

const EMPTY_CUSTOMER: NewCustomerInput = {
  full_name: "",
  email: "",
  phone: "",
  identification: "",
  doc_type: "CC",
  tax_exempt: false,
};

export default function CustomersPage() {
  const customers = useCustomersStore((s) => s.customers);
  const loading = useCustomersStore((s) => s.loading);
  const error = useCustomersStore((s) => s.error);
  const submitting = useCustomersStore((s) => s.submitting);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);
  const addCustomer = useCustomersStore((s) => s.addCustomer);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NewCustomerInput>(EMPTY_CUSTOMER);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addCustomer(form);
    if (ok) {
      setModalOpen(false);
      setForm(EMPTY_CUSTOMER);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setForm(EMPTY_CUSTOMER);
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Clientes</h1>
          <p className="text-sm text-on-surface-variant mt-1">Gestiona el directorio de tus clientes y su historial.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Añadir Cliente</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando clientes…</p>
      ) : customers.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconUsers className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay clientes</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Comienza añadiendo a tu primer cliente para hacer seguimiento de sus compras y ofrecer un mejor servicio.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Añadir tu primer cliente
          </button>
        </div>
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <DataTable
            rows={customers}
            rowKey={(c) => c.id}
            minWidth={700}
            caption="Directorio de clientes"
            columns={CUSTOMER_COLUMNS}
          />
        </div>
      )}

      {/* Modal Nuevo Cliente */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">Nuevo Cliente</h2>
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
                <label className="text-[13px] font-semibold text-on-surface block">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej. María González"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <label className="text-[13px] font-semibold text-on-surface block">Correo Electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="maria@ejemplo.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Documento</label>
                <div className="flex gap-2">
                  <Select
                    aria-label="Tipo de documento"
                    containerClassName="w-24 shrink-0"
                    value={form.doc_type}
                    onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                  <input
                    type="text"
                    value={form.identification}
                    onChange={(e) => setForm({ ...form, identification: e.target.value })}
                    className="flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono placeholder:text-on-surface-variant/50"
                    placeholder="Número de documento"
                  />
                </div>
                <p className="text-xs text-on-surface-variant">Requerido para facturación.</p>
              </div>

              {/* Tax Exempt Toggle */}
              <div className="flex items-center justify-between p-3 sm:p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                <div>
                  <p className="text-sm font-bold text-on-surface">Cliente Exento de Impuestos</p>
                  <p className="text-xs text-on-surface-variant mt-1">No aplicar IVA a las compras de este cliente.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tax_exempt: !form.tax_exempt })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ml-4 ${
                    form.tax_exempt ? "bg-[#6063ee]" : "bg-outline-variant/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.tax_exempt ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
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
                  {submitting ? "Guardando…" : "Guardar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

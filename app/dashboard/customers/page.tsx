"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { IconUsers, IconPlus, IconShoppingCart } from "@/app/assets/icons/DashboardIcons";
import { useCustomersStore } from "@/stores/customers.store";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { Select } from "@/components/ui/Select";
import { fetchCustomerSales } from "@/services/customers.service";
import type { Customer, NewCustomerInput, CustomerSale } from "@/services/customers.service";

const DOC_TYPES = ["CC", "NIT", "RUT", "RFC"];

const EMPTY_CUSTOMER: NewCustomerInput = {
  full_name: "",
  email: "",
  phone: "",
  identification: "",
  doc_type: "CC",
  tax_exempt: false,
};

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export default function CustomersPage() {
  const customers = useCustomersStore((s) => s.customers);
  const loading = useCustomersStore((s) => s.loading);
  const error = useCustomersStore((s) => s.error);
  const submitting = useCustomersStore((s) => s.submitting);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);
  const addCustomer = useCustomersStore((s) => s.addCustomer);
  const updateCustomer = useCustomersStore((s) => s.updateCustomer);
  const deleteCustomer = useCustomersStore((s) => s.deleteCustomer);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewCustomerInput>(EMPTY_CUSTOMER);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<CustomerSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_CUSTOMER);
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({
      full_name: c.full_name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      identification: c.identification ?? "",
      doc_type: c.doc_type ?? "CC",
      tax_exempt: c.tax_exempt,
    });
    setModalOpen(true);
  };

  const openDetail = useCallback(async (c: Customer) => {
    setDetailCustomer(c);
    setSalesLoading(true);
    try {
      const sales = await fetchCustomerSales(c.id);
      setCustomerSales(sales);
    } catch {
      setCustomerSales([]);
    } finally {
      setSalesLoading(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = editingId
      ? await updateCustomer(editingId, form)
      : await addCustomer(form);
    if (ok) {
      setModalOpen(false);
      setEditingId(null);
      setForm(EMPTY_CUSTOMER);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_CUSTOMER);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const ok = await deleteCustomer(deletingId);
    if (ok) setDeletingId(null);
  };

  const handleDetailEdit = (c: Customer) => {
    setDetailCustomer(null);
    openEdit(c);
  };

  const totalSpent = customerSales.reduce((sum, s) => sum + s.total, 0);
  const lastSale = customerSales.length > 0 ? customerSales[0] : null;

  const columns: DataColumn<Customer>[] = [
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
    {
      header: "",
      align: "right",
      mobile: "actions",
      className: "pr-4",
      cell: (c) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openDetail(c)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            title="Ver historial"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => openEdit(c)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            title="Editar"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setDeletingId(c.id)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
            title="Eliminar"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Clientes</h1>
          <p className="text-sm text-on-surface-variant mt-1">Gestiona el directorio de tus clientes y su historial.</p>
        </div>
        <button
          onClick={openCreate}
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
            onClick={openCreate}
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
            minWidth={800}
            caption="Directorio de clientes"
            columns={columns}
          />
        </div>
      )}

      {/* Modal crear/editar cliente */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                {editingId ? "Editar Cliente" : "Nuevo Cliente"}
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
                  {submitting ? "Guardando…" : editingId ? "Guardar Cambios" : "Guardar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmación eliminar */}
      {deletingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-2xl w-full max-w-sm border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-error-container/20 flex items-center justify-center mx-auto mb-4">
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-6 h-6 text-error-dim">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-on-surface mb-2">¿Eliminar cliente?</h3>
              <p className="text-sm text-on-surface-variant">
                Esta acción no se puede deshacer. Si el cliente tiene ventas asociadas, no podrá eliminarse.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDelete}
                className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-error hover:bg-error/80 text-on-error transition-all disabled:opacity-50"
              >
                {submitting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle del Cliente */}
      {detailCustomer && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-start bg-surface-container-low shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold">{detailCustomer.full_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-on-surface truncate">
                      {detailCustomer.full_name}
                    </h2>
                    <p className="text-xs text-on-surface-variant">
                      {detailCustomer.doc_type ? `${detailCustomer.doc_type} ${detailCustomer.identification}` : detailCustomer.identification ?? "Sin documento"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-on-surface-variant">
                  {detailCustomer.phone && <span>{detailCustomer.phone}</span>}
                  {detailCustomer.email && <span>{detailCustomer.email}</span>}
                  <span className={detailCustomer.tax_exempt ? "text-amber-500 font-semibold" : ""}>
                    {detailCustomer.tax_exempt ? "Exento de IVA" : "Aplica IVA"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Link
                  href={`/dashboard/pos?customerId=${detailCustomer.id}`}
                  className="h-9 px-3.5 rounded-xl bg-primary hover:bg-primary-dim text-on-primary text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center gap-1.5"
                >
                  <IconShoppingCart className="w-3.5 h-3.5" />
                  Nueva Venta
                </Link>
                <button
                  onClick={() => handleDetailEdit(detailCustomer)}
                  className="h-9 w-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                  title="Editar"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => setDetailCustomer(null)}
                  className="h-9 w-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                  aria-label="Cerrar"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="18" height="18">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-container-low rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-on-surface tabular-nums">
                    {salesLoading ? <span className="inline-block w-12 h-6 rounded bg-surface-container-high animate-pulse" /> : customerSales.length}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1 font-medium uppercase tracking-wider">Ventas</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-on-surface tabular-nums">
                    {salesLoading ? <span className="inline-block w-20 h-6 rounded bg-surface-container-high animate-pulse" /> : `$${money(totalSpent)}`}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1 font-medium uppercase tracking-wider">Total Gastado</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-on-surface tabular-nums">
                    {salesLoading ? <span className="inline-block w-16 h-6 rounded bg-surface-container-high animate-pulse" /> : lastSale ? new Date(lastSale.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" }) : "—"}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1 font-medium uppercase tracking-wider">Última Visita</p>
                </div>
              </div>

              {/* Historial de Ventas */}
              <div>
                <h3 className="text-sm font-bold text-on-surface mb-3">Historial de Ventas</h3>
                {salesLoading ? (
                  <p className="text-center text-sm text-on-surface-variant py-8">Cargando ventas…</p>
                ) : customerSales.length === 0 ? (
                  <div className="text-center py-8 bg-surface-container-low rounded-xl border border-dashed border-outline-variant/20">
                    <IconShoppingCart className="w-8 h-8 mx-auto text-on-surface-variant/30 mb-2" />
                    <p className="text-sm text-on-surface-variant">Este cliente aún no tiene compras registradas.</p>
                    <Link
                      href={`/dashboard/pos?customerId=${detailCustomer.id}`}
                      className="inline-block mt-3 text-xs font-semibold text-primary hover:text-primary-dim underline underline-offset-2"
                    >
                      Registrar primera venta
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[480px]">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold border-b border-outline-variant/10">
                          <th className="pb-3 pr-3">Venta</th>
                          <th className="pb-3 pr-3">Fecha</th>
                          <th className="pb-3 pr-3">Método</th>
                          <th className="pb-3 pr-3 text-center">Items</th>
                          <th className="pb-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/5">
                        {customerSales.map((s) => (
                          <tr key={s.id} className="hover:bg-surface-container-lowest transition-colors">
                            <td className="py-3 pr-3 font-mono text-xs text-on-surface-variant">
                              #{s.sale_number}
                            </td>
                            <td className="py-3 pr-3 text-xs text-on-surface-variant whitespace-nowrap">
                              {new Date(s.created_at).toLocaleDateString("es-CO", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}
                            </td>
                            <td className="py-3 pr-3 text-xs text-on-surface-variant">
                              {PAYMENT_LABELS[s.payment_method] ?? s.payment_method}
                            </td>
                            <td className="py-3 pr-3 text-center text-xs text-on-surface-variant tabular-nums">
                              {s.item_count}
                            </td>
                            <td className="py-3 text-right text-xs font-bold text-on-surface tabular-nums">
                              ${money(s.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { IconUserBadge, IconPlus } from "@/app/assets/icons/DashboardIcons";
import { useStaffStore } from "@/stores/staff.store";
import { useSubscriptionStore } from "@/stores/subscription.store";
import { fetchStaffSales } from "@/services/staff.service";
import type { NewStaffInput, StaffMember, StaffSaleItem } from "@/services/staff.service";

const ROLES = ["Barbero", "Estilista", "Colorista", "Manicurista", "Lavador", "Detailer", "Consultor", "Profesional", "Recepción", "Otro"];

const EMPTY_STAFF: NewStaffInput = {
  full_name: "",
  role: "Barbero",
  phone: "",
  email: "",
  commission_rate: "0",
  commission_type: "percentage",
  status: "active",
};

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function StaffPage() {
  const staff = useStaffStore((s) => s.staff);
  const loading = useStaffStore((s) => s.loading);
  const error = useStaffStore((s) => s.error);
  const submitting = useStaffStore((s) => s.submitting);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const addStaff = useStaffStore((s) => s.addStaff);
  const updateStaff = useStaffStore((s) => s.updateStaff);
  const commissions = useStaffStore((s) => s.commissions);
  const commissionsLoading = useStaffStore((s) => s.commissionsLoading);
  const fetchCommissions = useStaffStore((s) => s.fetchCommissions);

  const subscription = useSubscriptionStore((s) => s.subscription);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchAll);
  const refreshUsage = useSubscriptionStore((s) => s.refreshUsage);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewStaffInput>(EMPTY_STAFF);

  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [salesStaff, setSalesStaff] = useState<StaffMember | null>(null);
  const [sales, setSales] = useState<StaffSaleItem[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);

  const openSales = useCallback(async (m: StaffMember) => {
    setSalesStaff(m);
    setSales([]);
    setSalesLoading(true);
    setSalesModalOpen(true);
    try {
      const data = await fetchStaffSales(m.id);
      setSales(data);
    } catch {
      setSales([]);
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    fetchCommissions();
    fetchSubscription();
  }, [fetchStaff, fetchCommissions, fetchSubscription]);

  const activeCount = staff.filter((m) => m.status === "active").length;
  const maxCollaborators = subscription?.max_collaborators ?? Infinity;
  const atCollaboratorLimit = activeCount >= maxCollaborators;

  const openCreate = () => {
    if (atCollaboratorLimit) return;
    setEditingId(null);
    setForm(EMPTY_STAFF);
    setModalOpen(true);
  };

  const openEdit = (m: StaffMember) => {
    setEditingId(m.id);
    setForm({
      full_name: m.full_name,
      role: m.role ?? "Barbero",
      phone: m.phone ?? "",
      email: m.email ?? "",
      commission_rate: String(m.commission_rate),
      commission_type: m.commission_type || "percentage",
      status: m.status,
    });
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_STAFF);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = editingId
      ? await updateStaff(editingId, form)
      : await addStaff(form);
    if (ok) {
      handleClose();
      refreshUsage();
    }
  };

  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Personal</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Administra tu equipo y la comisión que gana cada uno por servicio.
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={atCollaboratorLimit}
          title={atCollaboratorLimit ? "Alcanzaste el límite de colaboradores de tu plan" : undefined}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#6063ee] disabled:hover:text-white"
        >
          <IconPlus className="w-4 h-4" />
          <span>Añadir Personal</span>
        </button>
      </div>

      {subscription && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-on-surface-variant">
            Colaboradores:{" "}
            <strong className="text-on-surface tabular-nums">
              {activeCount}
              {Number.isFinite(maxCollaborators) ? ` / ${maxCollaborators}` : ""}
            </strong>{" "}
            <span className="text-on-surface-variant/70">· Plan {subscription.plan_name}</span>
          </span>
        </div>
      )}

      {atCollaboratorLimit && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            Alcanzaste el máximo de colaboradores del plan <strong>{subscription?.plan_name}</strong>.
          </span>
          <Link href="/dashboard/subscription" className="font-semibold underline whitespace-nowrap">
            Ver planes
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando equipo…</p>
      ) : staff.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconUserBadge className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay miembros del equipo</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Añade a tu personal para asignarle citas y llevar el control de sus comisiones.
          </p>
          <button
            onClick={openCreate}
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Añadir tu primer miembro
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((m) => (
            <div
              key={m.id}
              onClick={() => openEdit(m)}
              className="text-left bg-surface-container rounded-2xl border border-outline-variant/10 shadow-sm p-5 hover:border-primary/30 hover:shadow-md transition-all group relative cursor-pointer"
            >
              <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-surface-container-lowest/80 border border-outline-variant/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3.5 h-3.5 text-on-surface-variant">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{initials(m.full_name)}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-on-surface truncate group-hover:text-primary transition-colors">{m.full_name}</h3>
                  <p className="text-xs text-on-surface-variant">{m.role ?? "—"}</p>
                </div>
                {m.status !== "active" && (
                  <span className="ml-auto inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-surface-variant text-on-surface-variant shrink-0">
                    Inactivo
                  </span>
                )}
              </div>
              <div className="space-y-1 text-sm text-on-surface-variant">
                {m.phone && <div className="truncate">{m.phone}</div>}
                {m.email && <div className="truncate text-xs">{m.email}</div>}
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-outline-variant/10">
                <span className="text-xs font-medium text-on-surface-variant">Comisión</span>
                <span className="text-base font-bold text-on-surface tabular-nums">
                  {m.commission_type === "fixed" ? `$${money(m.commission_rate)}/und` : `${m.commission_rate}%`}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); openSales(m); }}
                className="mt-3 w-full py-1.5 rounded-lg border border-outline-variant/20 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              >
                Ver Ventas
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Comisiones del mes */}
      {(commissionsLoading || commissions.length > 0) && (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-low">
            <h2 className="text-sm font-bold text-on-surface">Comisiones del mes</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Calculadas sobre los servicios vendidos atribuidos a cada miembro.
            </p>
          </div>
          {commissionsLoading ? (
            <p className="text-center text-sm text-on-surface-variant py-8">Calculando…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[520px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold border-b border-outline-variant/10">
                    <th className="p-4 pl-6">Miembro</th>
                    <th className="p-4 text-center">Ventas</th>
                    <th className="p-4 text-right">Servicios</th>
                    <th className="p-4 text-center">Tasa</th>
                    <th className="p-4 pr-6 text-right">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5 text-sm">
                  {commissions.map((c) => (
                    <tr key={c.staff_id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-4 pl-6 font-medium text-on-surface">{c.full_name}</td>
                      <td className="p-4 text-center text-on-surface-variant">{c.salesCount}</td>
                      <td className="p-4 text-right text-on-surface-variant tabular-nums">${money(c.servicesTotal)}</td>
                      <td className="p-4 text-center text-on-surface-variant">
                        {c.commission_type === "fixed" ? `$${money(c.commission_rate)}/und` : `${c.commission_rate}%`}
                      </td>
                      <td className="p-4 pr-6 text-right font-bold text-on-surface tabular-nums">${money(c.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Ventas del Personal */}
      {salesModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                  {salesStaff?.full_name}
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">Ventas realizadas</p>
              </div>
              <button
                onClick={() => setSalesModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {salesLoading ? (
                <p className="text-center text-sm text-on-surface-variant py-12">Cargando ventas…</p>
              ) : sales.length === 0 ? (
                <p className="text-center text-sm text-on-surface-variant py-12">Sin ventas registradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold border-b border-outline-variant/10">
                        <th className="p-3 pl-0">Venta N.°</th>
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Cliente</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-center">Cant</th>
                        <th className="p-3 text-right">Total</th>
                        <th className="p-3 pr-0 text-right">Comisión</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/5 text-sm">
                      {sales.map((s) => (
                        <tr key={s.id} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="p-3 pl-0 font-mono text-xs text-on-surface-variant">#{s.sale_number}</td>
                          <td className="p-3 text-xs text-on-surface-variant whitespace-nowrap">
                            {new Date(s.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })}
                          </td>
                          <td className="p-3 text-xs text-on-surface max-w-[120px] truncate">
                            {s.customer_name ?? "De Paso"}
                          </td>
                          <td className="p-3 text-xs text-on-surface max-w-[160px] truncate">{s.product_name}</td>
                          <td className="p-3 text-center text-xs text-on-surface-variant">{s.quantity}</td>
                          <td className="p-3 text-right text-xs font-bold text-on-surface tabular-nums">
                            ${money(s.line_total)}
                          </td>
                          <td className="p-3 pr-0 text-right text-xs font-semibold text-emerald-600 tabular-nums">
                            ${money(s.commissionAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-outline-variant/10">
                        <td colSpan={6} className="p-3 pl-0 text-right text-xs font-bold text-on-surface">
                          Total comisiones
                        </td>
                        <td className="p-3 pr-0 text-right text-sm font-bold text-emerald-600 tabular-nums">
                          ${money(sales.reduce((s, i) => s + i.commissionAmount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                {editingId ? "Editar Personal" : "Nuevo Personal"}
              </h2>
              <button
                onClick={handleClose}
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
                  placeholder="Ej. Carlos Pérez"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Rol</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Tipo</label>
                  <select
                    value={form.commission_type}
                    onChange={(e) => setForm({ ...form, commission_type: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                  >
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed">Valor fijo por unidad ($)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">
                    {form.commission_type === "fixed" ? "Valor por unidad ($)" : "Comisión (%)"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={form.commission_type === "fixed" ? "999999" : "100"}
                    value={form.commission_rate}
                    onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Teléfono</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="+57 300 123 4567"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Correo Electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="carlos@ejemplo.com"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 sm:p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                <div>
                  <p className="text-sm font-bold text-on-surface">Activo</p>
                  <p className="text-xs text-on-surface-variant mt-1">Disponible para asignarle citas.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, status: form.status === "active" ? "inactive" : "active" })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ml-4 ${
                    form.status === "active" ? "bg-[#6063ee]" : "bg-outline-variant/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.status === "active" ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="pt-4 flex flex-col-reverse sm:flex-row gap-3 border-t border-outline-variant/10">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Guardando…" : editingId ? "Guardar Cambios" : "Añadir al Equipo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { IconCar, IconPlus, IconClock } from "@/app/assets/icons/DashboardIcons";
import { useVehiclesStore } from "@/stores/vehicles.store";
import { useCustomersStore } from "@/stores/customers.store";
import type { NewVehicleInput, Vehicle } from "@/services/vehicles.service";

const EMPTY_VEHICLE: NewVehicleInput = {
  plate: "",
  make_model: "",
  color: "",
  customer_id: null,
  notes: "",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  confirmed: { label: "Confirmada", cls: "bg-[#6063ee]/10 text-[#6063ee] border-[#6063ee]/20" },
  completed: { label: "Completada", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Cancelada", cls: "bg-error-container/20 text-error-dim border-error-container/30" },
};

const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

export default function VehiclesPage() {
  const vehicles = useVehiclesStore((s) => s.vehicles);
  const loading = useVehiclesStore((s) => s.loading);
  const error = useVehiclesStore((s) => s.error);
  const submitting = useVehiclesStore((s) => s.submitting);
  const fetchVehicles = useVehiclesStore((s) => s.fetchVehicles);
  const addVehicle = useVehiclesStore((s) => s.addVehicle);
  const updateVehicle = useVehiclesStore((s) => s.updateVehicle);
  const history = useVehiclesStore((s) => s.history);
  const historyLoading = useVehiclesStore((s) => s.historyLoading);
  const fetchHistory = useVehiclesStore((s) => s.fetchHistory);

  const customers = useCustomersStore((s) => s.customers);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewVehicleInput>(EMPTY_VEHICLE);
  const [detail, setDetail] = useState<Vehicle | null>(null);

  useEffect(() => {
    fetchVehicles();
    if (customers.length === 0) fetchCustomers();
  }, [fetchVehicles, customers.length, fetchCustomers]);

  const ownerName = (v: Vehicle) => v.customers?.full_name ?? null;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_VEHICLE);
    setFormOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setForm({
      plate: v.plate,
      make_model: v.make_model ?? "",
      color: v.color ?? "",
      customer_id: v.customer_id,
      notes: v.notes ?? "",
    });
    setFormOpen(true);
  };

  const openDetail = (v: Vehicle) => {
    setDetail(v);
    fetchHistory(v.id);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_VEHICLE);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = editingId
      ? await updateVehicle(editingId, form)
      : await addVehicle(form);
    if (ok) closeForm();
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Vehículos</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Historial por placa: cada vehículo, su dueño y todas sus visitas.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Registrar Vehículo</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando vehículos…</p>
      ) : vehicles.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconCar className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay vehículos</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Los vehículos se registran solos al crear una cita con placa, o puedes añadirlos manualmente aquí.
          </p>
          <button
            onClick={openCreate}
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Registrar tu primer vehículo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((v) => (
            <button
              key={v.id}
              onClick={() => openDetail(v)}
              className="text-left bg-surface-container rounded-2xl border border-outline-variant/10 shadow-sm p-5 hover:border-primary/30 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <IconCar className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-on-surface font-mono tracking-wider group-hover:text-primary transition-colors">{v.plate}</h3>
                  <p className="text-xs text-on-surface-variant truncate">{v.make_model || "—"}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm pt-4 border-t border-outline-variant/10">
                <span className="text-on-surface-variant truncate">{ownerName(v) ?? "Sin dueño"}</span>
                {v.color && (
                  <span className="text-xs font-medium text-on-surface-variant px-2 py-0.5 rounded-md bg-surface-variant shrink-0 ml-2">{v.color}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal alta / edición */}
      {formOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                {editingId ? "Editar Vehículo" : "Registrar Vehículo"}
              </h2>
              <button
                onClick={closeForm}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Placa</label>
                  <input
                    type="text"
                    required
                    value={form.plate}
                    onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono uppercase placeholder:text-on-surface-variant/50"
                    placeholder="ABC123"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Color</label>
                  <input
                    type="text"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="Gris"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Marca / Modelo</label>
                <input
                  type="text"
                  value={form.make_model}
                  onChange={(e) => setForm({ ...form, make_model: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej. Mazda 3 2021"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Dueño</label>
                <select
                  value={form.customer_id || ""}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value || null })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                >
                  <option value="">Sin dueño</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Notas</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 resize-none"
                  placeholder="Detalles del vehículo (opcional)"
                />
              </div>

              <div className="pt-4 flex flex-col-reverse sm:flex-row gap-3 border-t border-outline-variant/10">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Guardando…" : editingId ? "Guardar Cambios" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Panel de historial */}
      {detail && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-on-surface font-mono tracking-wider">{detail.plate}</h2>
                <p className="text-xs text-on-surface-variant truncate">
                  {[detail.make_model, detail.color, detail.customers?.full_name].filter(Boolean).join(" · ") || "Sin datos"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { const v = detail; setDetail(null); openEdit(v); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => setDetail(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                  aria-label="Cerrar"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto">
              <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Historial de visitas</h3>
              {historyLoading ? (
                <p className="text-center text-sm text-on-surface-variant py-8">Cargando historial…</p>
              ) : history.length === 0 ? (
                <p className="text-center text-sm text-on-surface-variant py-8">Este vehículo aún no tiene visitas registradas.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => {
                    const st = STATUS_LABELS[h.status] ?? STATUS_LABELS.pending;
                    return (
                      <div key={h.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">{h.services?.name ?? h.title}</p>
                          <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1.5">
                            <IconClock className="w-3.5 h-3.5" />
                            {formatDate(h.appointment_date)} · {h.start_time.slice(0, 5)}
                            {h.staff?.full_name ? ` · ${h.staff.full_name}` : ""}
                          </p>
                        </div>
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border shrink-0 ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { IconCar, IconPlus, IconClock } from "@/app/assets/icons/DashboardIcons";
import { useVehiclesStore } from "@/stores/vehicles.store";
import { useCustomersStore } from "@/stores/customers.store";
import { vehicleMatches, type NewVehicleInput, type Vehicle } from "@/services/vehicles.service";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { formatDateOnly } from "@/lib/date";
import { useTableUrlState } from "@/lib/useUrlState";
import { DOC_TYPES, PHONE_PLACEHOLDER } from "@/lib/import/doc-types";

const EMPTY_VEHICLE: NewVehicleInput = {
  plate: "",
  make_model: "",
  color: "",
  customer_id: null,
  notes: "",
};

const EMPTY_CUSTOMER = { full_name: "", phone: "", doc_type: "CC", identification: "" };

/** Valor del selector de dueño que abre el alta rápida en vez de elegir a alguien. */
const NEW_CUSTOMER = "__new__";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  confirmed: { label: "Confirmada", cls: "bg-primary/10 text-primary border-primary/20" },
  completed: { label: "Completada", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Cancelada", cls: "bg-error-container/20 text-error-dim border-error-container/30" },
};

const INPUT =
  "w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/80";

const formatDate = (iso: string) =>
  formatDateOnly(iso, { day: "2-digit", month: "short", year: "numeric" }, "es-CO");

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
  const addCustomer = useCustomersStore((s) => s.addCustomer);
  const customerSubmitting = useCustomersStore((s) => s.submitting);

  // Búsqueda, orden y página en la URL: volver del detalle o refrescar deja
  // la lista donde estaba.
  const table = useTableUrlState("", { sort: "plate" });

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewVehicleInput>(EMPTY_VEHICLE);
  const [detail, setDetail] = useState<Vehicle | null>(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState(EMPTY_CUSTOMER);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  useEffect(() => {
    fetchVehicles();
    if (customers.length === 0) fetchCustomers();
  }, [fetchVehicles, customers.length, fetchCustomers]);

  const ownerName = (v: Vehicle) => v.customers?.full_name ?? null;
  const filtered = vehicles.filter((v) => vehicleMatches(v, table.state.q));

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
    setNewCustomerOpen(false);
    setNewCustomer(EMPTY_CUSTOMER);
    setNewCustomerError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = editingId ? await updateVehicle(editingId, form) : await addVehicle(form);
    if (ok) closeForm();
  };

  /** Alta rápida del dueño sin salir del formulario: al crearlo queda elegido. */
  const createOwner = async () => {
    if (!newCustomer.full_name.trim()) {
      setNewCustomerError("Escribe el nombre del cliente.");
      return;
    }
    setNewCustomerError(null);
    const created = await addCustomer({
      full_name: newCustomer.full_name.trim(),
      phone: newCustomer.phone.trim(),
      email: "",
      identification: newCustomer.identification.trim(),
      doc_type: newCustomer.identification.trim() ? newCustomer.doc_type : "",
      tax_exempt: false,
    });
    if (!created) {
      setNewCustomerError(useCustomersStore.getState().error ?? "No se pudo crear el cliente.");
      return;
    }
    setForm((f) => ({ ...f, customer_id: created.id }));
    setNewCustomerOpen(false);
    setNewCustomer(EMPTY_CUSTOMER);
  };

  const columns: DataColumn<Vehicle>[] = [
    {
      header: "Placa",
      mobile: "title",
      sortKey: "plate",
      sortValue: (v) => v.plate,
      cell: (v) => <span className="font-mono font-bold tracking-wider text-on-surface">{v.plate}</span>,
    },
    {
      header: "Marca / Modelo",
      mobile: "subtitle",
      sortKey: "model",
      sortValue: (v) => v.make_model ?? "",
      cell: (v) => v.make_model || "—",
    },
    {
      header: "Dueño",
      sortKey: "owner",
      sortValue: (v) => ownerName(v) ?? "￿",
      cell: (v) => ownerName(v) ?? <span className="text-on-surface-variant">Sin dueño</span>,
    },
    { header: "Color", cell: (v) => v.color || "—" },
    {
      header: "Acciones",
      mobile: "actions",
      align: "right",
      cell: (v) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openDetail(v)} aria-label={`Ver historial de ${v.plate}`}>
            Historial
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEdit(v)} aria-label={`Editar ${v.plate}`}>
            Editar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Vehículos</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Historial por placa: cada vehículo, su dueño y todas sus visitas.
          </p>
        </div>
        <Button onClick={openCreate} icon={<IconPlus className="w-4 h-4" />}>
          Registrar vehículo
        </Button>
      </div>

      {error && !formOpen && <CollectionError message={error} onRetry={fetchVehicles} />}

      {loading ? (
        <CollectionLoading label="Cargando vehículos…" />
      ) : vehicles.length === 0 ? (
        <CollectionEmpty
          icon={<IconCar className="w-8 h-8" />}
          title="Aún no hay vehículos"
          description="Los vehículos se registran solos al crear una cita con placa, o puedes añadirlos manualmente aquí."
          action={{ label: "Registrar tu primer vehículo", onClick: openCreate }}
        />
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <DataTable
            caption="Vehículos"
            columns={columns}
            rows={filtered}
            rowKey={(v) => v.id}
            onRowClick={openDetail}
            minWidth={640}
            state={table.state}
            onStateChange={table.setState}
            toolbar={
              <div className="relative w-full sm:w-80">
                <input
                  type="search"
                  value={table.state.q}
                  onChange={(e) => table.setState({ q: e.target.value, page: 1 })}
                  placeholder="Buscar por placa, cliente o modelo"
                  aria-label="Buscar por placa, cliente o modelo"
                  className={`${INPUT} pl-9`}
                />
                <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
            }
          />
          {filtered.length === 0 && (
            <p role="status" className="px-4 py-10 text-center text-sm text-on-surface-variant">
              Ningún vehículo coincide con «{table.state.q.trim()}».
            </p>
          )}
        </div>
      )}

      {/* Alta / edición */}
      <Modal
        open={formOpen}
        onClose={() => !submitting && closeForm()}
        title={editingId ? "Editar vehículo" : "Registrar vehículo"}
        footer={
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <Button variant="ghost" className="flex-1" onClick={closeForm}>Cancelar</Button>
            <Button type="submit" form="vehicle-form" className="flex-1" loading={submitting} loadingLabel="Guardando…">
              {editingId ? "Guardar cambios" : "Registrar"}
            </Button>
          </div>
        }
      >
        <form id="vehicle-form" onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="vehicle-plate" className="text-[13px] font-semibold text-on-surface block">Placa</label>
              <input
                id="vehicle-plate"
                type="text"
                required
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
                className={`${INPUT} font-mono uppercase`}
                placeholder="ABC123"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vehicle-color" className="text-[13px] font-semibold text-on-surface block">Color</label>
              <input
                id="vehicle-color"
                type="text"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className={INPUT}
                placeholder="Gris"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="vehicle-model" className="text-[13px] font-semibold text-on-surface block">Marca / Modelo</label>
            <input
              id="vehicle-model"
              type="text"
              value={form.make_model}
              onChange={(e) => setForm({ ...form, make_model: e.target.value })}
              className={INPUT}
              placeholder="Ej. Mazda 3 2021"
            />
          </div>

          <div className="space-y-2">
            <Select
              label="Dueño"
              searchable
              searchPlaceholder="Buscar cliente…"
              value={form.customer_id || ""}
              onChange={(e) => {
                if (e.target.value === NEW_CUSTOMER) {
                  setNewCustomerOpen(true);
                  return;
                }
                setForm({ ...form, customer_id: e.target.value || null });
              }}
            >
              <option value="">Sin dueño</option>
              <option value={NEW_CUSTOMER}>+ Nuevo cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </Select>
            {!newCustomerOpen && (
              <button
                type="button"
                onClick={() => setNewCustomerOpen(true)}
                className="text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                + Nuevo cliente
              </button>
            )}
          </div>

          {newCustomerOpen && (
            <fieldset className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 space-y-3">
              <legend className="px-1 text-sm font-semibold text-on-surface">Nuevo cliente</legend>
              <div className="space-y-1.5">
                <label htmlFor="new-owner-name" className="text-[13px] font-semibold text-on-surface block">Nombre</label>
                <input
                  id="new-owner-name"
                  type="text"
                  value={newCustomer.full_name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
                  className={INPUT}
                  placeholder="Nombre y apellido"
                  aria-invalid={newCustomerError ? true : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-owner-phone" className="text-[13px] font-semibold text-on-surface block">Teléfono</label>
                <input
                  id="new-owner-phone"
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className={INPUT}
                  placeholder={PHONE_PLACEHOLDER}
                />
              </div>
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <Select
                  aria-label="Tipo de documento"
                  value={newCustomer.doc_type}
                  onChange={(e) => setNewCustomer({ ...newCustomer, doc_type: e.target.value })}
                >
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>{d.value}</option>
                  ))}
                </Select>
                <input
                  type="text"
                  aria-label="Número de documento"
                  value={newCustomer.identification}
                  onChange={(e) => setNewCustomer({ ...newCustomer, identification: e.target.value })}
                  className={INPUT}
                  placeholder="Documento (opcional)"
                />
              </div>
              {newCustomerError && <p role="alert" className="text-sm text-error">{newCustomerError}</p>}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewCustomerOpen(false);
                    setNewCustomer(EMPTY_CUSTOMER);
                    setNewCustomerError(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={createOwner} loading={customerSubmitting} loadingLabel="Creando…">
                  Crear y elegir
                </Button>
              </div>
            </fieldset>
          )}

          <div className="space-y-1.5">
            <label htmlFor="vehicle-notes" className="text-[13px] font-semibold text-on-surface block">Notas</label>
            <textarea
              id="vehicle-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={`${INPUT} resize-none`}
              placeholder="Detalles del vehículo (opcional)"
            />
          </div>
        </form>
      </Modal>

      {/* Historial */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={<span className="font-mono tracking-wider">{detail?.plate}</span>}
        description={
          detail
            ? [detail.make_model, detail.color, detail.customers?.full_name].filter(Boolean).join(" · ") || "Sin datos"
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const v = detail!;
                setDetail(null);
                openEdit(v);
              }}
            >
              Editar
            </Button>
            <Button variant="ghost" onClick={() => setDetail(null)}>Cerrar</Button>
          </div>
        }
      >
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
                <div key={h.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/10">
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
      </Modal>
    </div>
  );
}

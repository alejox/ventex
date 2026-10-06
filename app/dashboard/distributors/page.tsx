"use client";

import { useEffect, useMemo, useState } from "react";
import { IconPlus } from "@/app/assets/icons/DashboardIcons";
import { useDistributorsStore } from "@/stores/distributors.store";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { Select } from "@/components/ui/Select";
import { CitySelect } from "@/components/CitySelect";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import type { Distributor, NewDistributorInput } from "@/services/distributors.service";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useTableUrlState, useUrlParams } from "@/lib/useUrlState";
import { ImportWizard } from "@/lib/import/ImportWizard";
import { DISTRIBUTOR_IMPORT, existingDistributorKeys } from "@/lib/import/distributors";
import { distributorsExportRows, exportFileName } from "@/lib/import/export";
import { downloadCsv } from "@/lib/import/spreadsheet";
import { docTypeOptionsFor, PHONE_PLACEHOLDER } from "@/lib/import/doc-types";
import { parsePhone } from "@/lib/import/values";
import {
  distributorImpact,
  filterDistributorsByStatus,
  isArchivedDistributor,
  parseDistributorStatusFilter,
  type DistributorStatusFilter,
} from "./distributor-list";

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

const STATUS_OPTIONS: { value: DistributorStatusFilter; label: string }[] = [
  { value: "active", label: "Activos" },
  { value: "archived", label: "Archivados" },
  { value: "all", label: "Todos" },
];

const EMPTY_DISTRIBUTOR: NewDistributorInput = {
  business_name: "",
  contact_name: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  city: "",
  rfc_rut: "",
  doc_type: "NIT",
  dv: "",
};

export default function DistributorsPage() {
  const distributors = useDistributorsStore((s) => s.distributors);
  const loading = useDistributorsStore((s) => s.loading);
  const error = useDistributorsStore((s) => s.error);
  const submitting = useDistributorsStore((s) => s.submitting);
  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);
  const addDistributor = useDistributorsStore((s) => s.addDistributor);
  const updateDistributor = useDistributorsStore((s) => s.updateDistributor);
  const deleteDistributorOrError = useDistributorsStore((s) => s.deleteDistributorOrError);
  const setDistributorStatus = useDistributorsStore((s) => s.setDistributorStatus);
  const fetchImpact = useDistributorsStore((s) => s.fetchImpact);
  const importDistributors = useDistributorsStore((s) => s.importDistributors);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<NewDistributorInput>(EMPTY_DISTRIBUTOR);
  const [phoneErrors, setPhoneErrors] = useState<{ phone?: string; whatsapp?: string }>({});
  const [importOpen, setImportOpen] = useState(false);

  // Búsqueda, orden, página y estado viven en la URL.
  const table = useTableUrlState();
  const [filters, setFilters] = useUrlParams({ estado: "active" });
  const statusFilter = parseDistributorStatusFilter(filters.estado);
  const visibleDistributors = filterDistributorsByStatus(distributors, statusFilter);
  const existingKeys = useMemo(() => existingDistributorKeys(distributors), [distributors]);

  // Diálogo de borrado: impacto antes de confirmar, error adentro.
  const [deleting, setDeleting] = useState<Distributor | null>(null);
  const [impact, setImpact] = useState<{ purchases: number; products: number } | null>(null);
  const [impactError, setImpactError] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchDistributors();
  }, [fetchDistributors]);

  const openCreateModal = () => {
    setEditId(null);
    setForm(EMPTY_DISTRIBUTOR);
    setPhoneErrors({});
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
      city: d.city ?? "",
      rfc_rut: d.rfc_rut ?? "",
      doc_type: d.doc_type ?? "NIT",
      dv: d.dv ?? "",
    });
    setPhoneErrors({});
    setModalOpen(true);
  };

  const phoneErrorOf = (value: string) => {
    const r = parsePhone(value);
    return r.ok ? undefined : r.error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // El WhatsApp recibe las órdenes de compra: uno mal escrito falla en
    // silencio el día que se manda el pedido.
    const errors = { phone: phoneErrorOf(form.phone), whatsapp: phoneErrorOf(form.whatsapp) };
    setPhoneErrors(errors);
    if (errors.phone || errors.whatsapp) {
      document.getElementById(errors.phone ? "distributor-phone" : "distributor-whatsapp")?.focus();
      return;
    }
    const input = { ...form, business_name: form.business_name.trim() };
    const ok = editId
      ? await updateDistributor(editId, input)
      : await addDistributor(input);
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

  const askDelete = async (d: Distributor) => {
    setDeleting(d);
    setImpact(null);
    setImpactError(false);
    setDialogError(null);
    try {
      setImpact(await fetchImpact(d.id));
    } catch {
      setImpactError(true);
    }
  };

  const closeDelete = () => {
    if (submitting) return;
    setDeleting(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const err = await deleteDistributorOrError(deleting.id);
    if (err) setDialogError(err);
    else setDeleting(null);
  };

  /** Archivar desde el diálogo de borrado: la alternativa que no rompe nada. */
  const archiveFromDialog = async () => {
    if (!deleting) return;
    const err = await setDistributorStatus(deleting.id, "inactive");
    if (err) setDialogError(err);
    else setDeleting(null);
  };

  const toggleArchived = async (d: Distributor) => {
    setActionError(null);
    const err = await setDistributorStatus(d.id, isArchivedDistributor(d) ? "active" : "inactive");
    if (err) setActionError(`No se pudo actualizar ${d.business_name}: ${err}`);
  };

  const exportCsv = () => {
    downloadCsv(exportFileName("proveedores"), distributorsExportRows(visibleDistributors));
  };

  const deleteInfo = impact ? distributorImpact(impact) : null;

  // Vive dentro del componente porque la acción de editar cierra sobre el estado.
  const columns: DataColumn<Distributor>[] = [
    {
      header: "Negocio",
      mobile: "title",
      sortKey: "negocio",
      className: "pl-6 font-medium text-on-surface",
      headerClassName: "pl-6",
      cell: (d) => d.business_name,
    },
    {
      header: "Contacto",
      mobile: "subtitle",
      sortKey: "contacto",
      sortValue: (d) => d.contact_name ?? "",
      className: "text-on-surface-variant",
      cell: (d) => (
        <>
          <div>{d.contact_name ?? "—"}</div>
          <div className="text-xs text-on-surface-variant/70">{d.email ?? ""}</div>
        </>
      ),
    },
    {
      header: "Ciudad",
      sortKey: "ciudad",
      className: "text-on-surface-variant",
      cell: (d) => d.city ?? "—",
    },
    {
      header: "Teléfono",
      sortKey: "telefono",
      className: "text-on-surface-variant",
      cell: (d) => d.phone ?? "—",
    },
    {
      header: "WhatsApp",
      className: "text-on-surface-variant",
      cell: (d) => d.whatsapp ?? "—",
    },
    {
      header: "Documento",
      sortKey: "doc",
      sortValue: (d) => d.rfc_rut ?? "",
      className: "text-on-surface-variant font-mono text-xs",
      cell: (d) => (
        <span className="font-mono text-xs">
          {d.doc_type ? `${d.doc_type} ${d.rfc_rut}${d.dv ? `-${d.dv}` : ""}` : (d.rfc_rut ?? "—")}
        </span>
      ),
    },
    {
      header: "Estado",
      align: "center",
      mobile: "badge",
      cell: (d) => (
        <span
          className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${
            isArchivedDistributor(d)
              ? "bg-surface-container-highest text-on-surface-variant border-outline-variant/30"
              : "bg-[#10b981]/10 text-[#047857] dark:text-[#10b981] border-[#10b981]/20"
          }`}
        >
          {isArchivedDistributor(d) ? "Archivado" : "Activo"}
        </span>
      ),
    },
    {
      header: "Acciones",
      align: "center",
      mobile: "actions",
      cell: (d) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => openEditModal(d)}
            className="w-11 h-11 lg:w-9 lg:h-9 inline-flex items-center justify-center rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            title="Editar proveedor"
            aria-label={`Editar ${d.business_name}`}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => toggleArchived(d)}
            className="w-11 h-11 lg:w-9 lg:h-9 inline-flex items-center justify-center rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            title={isArchivedDistributor(d) ? "Reactivar proveedor" : "Archivar proveedor"}
            aria-label={isArchivedDistributor(d) ? `Reactivar ${d.business_name}` : `Archivar ${d.business_name}`}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => askDelete(d)}
            className="w-11 h-11 lg:w-9 lg:h-9 inline-flex items-center justify-center rounded-xl text-on-surface-variant hover:text-error-dim hover:bg-error-container/10 transition-colors"
            title="Eliminar proveedor"
            aria-label={`Eliminar ${d.business_name}`}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
          <h1 className="text-2xl font-bold text-on-surface">Proveedores</h1>
          <p className="text-sm text-on-surface-variant mt-1">Gestiona tus proveedores.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            Importar
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={visibleDistributors.length === 0}>
            Exportar CSV
          </Button>
          <Button onClick={openCreateModal} icon={<IconPlus className="w-4 h-4" />} className="col-span-2">
            Añadir proveedor
          </Button>
        </div>
      </div>

      {error && !modalOpen && <CollectionError message={error} onRetry={fetchDistributors} />}
      {actionError && (
        <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {actionError}
        </p>
      )}

      {loading ? (
        <CollectionLoading label="Cargando proveedores…" />
      ) : distributors.length === 0 ? (
        <CollectionEmpty icon={<IconTruck className="h-8 w-8" />} title="Aún no hay proveedores" description="Registra a tus proveedores para gestionar pedidos, pagos y stock de forma centralizada." action={{ label: "Añadir tu primer proveedor", onClick: openCreateModal }} />
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <DataTable
            rows={visibleDistributors}
            rowKey={(d) => d.id}
            minWidth={760}
            caption="Directorio de proveedores"
            columns={columns}
            state={table.state}
            onStateChange={table.setState}
            searchable
            searchPlaceholder="Buscar por nombre, contacto, NIT, teléfono o correo"
            getSearchText={(d) =>
              [d.business_name, d.contact_name, d.rfc_rut, d.phone, d.whatsapp, d.email, d.city].filter(Boolean).join(" ")
            }
            toolbar={
              <div role="group" aria-label="Filtrar por estado" className="flex gap-1.5">
                {STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={statusFilter === o.value}
                    onClick={() => {
                      setFilters({ estado: o.value });
                      table.setState({ page: 1 });
                    }}
                    className={`h-9 px-3.5 rounded-full border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      statusFilter === o.value
                        ? "bg-primary text-on-primary border-primary"
                        : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:text-on-surface"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            }
          />
        </div>
      )}

      <Modal
        open={deleting !== null}
        onClose={closeDelete}
        role="alertdialog"
        size="sm"
        title="¿Eliminar proveedor?"
        description={deleting ? `Vas a eliminar ${deleting.business_name}. Esta acción no se puede deshacer.` : undefined}
        dismissible={!submitting}
        closeOnEscape={!submitting}
        footer={
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="ghost" onClick={closeDelete} disabled={submitting}>
              Cancelar
            </Button>
            {deleting && !isArchivedDistributor(deleting) && (
              <Button variant="secondary" onClick={archiveFromDialog} disabled={submitting}>
                Archivar
              </Button>
            )}
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={submitting}
              loadingLabel="Eliminando…"
              disabled={(impact === null && !impactError) || (deleteInfo !== null && !deleteInfo.canDelete)}
            >
              Eliminar
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          {impact === null && !impactError ? (
            <p className="text-on-surface-variant" role="status">Revisando qué tiene asociado…</p>
          ) : deleteInfo === null ? (
            <p className="text-on-surface-variant">
              No pudimos revisar sus compras y productos. Si tiene productos asociados, la eliminación fallará.
            </p>
          ) : deleteInfo.lines.length === 0 ? (
            <p className="text-on-surface-variant">No tiene compras ni productos asociados.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-on-surface">
              {deleteInfo.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <p className="text-on-surface-variant">
            Archivar lo oculta de las listas sin borrar su historial, y puedes reactivarlo cuando quieras.
          </p>
          {dialogError && (
            <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-error">
              No se pudo completar: {dialogError}
            </p>
          )}
        </div>
      </Modal>

      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="proveedores"
        entity={DISTRIBUTOR_IMPORT}
        existing={existingKeys}
        templateFileName="plantilla-proveedores.xlsx"
        previewKeys={["business_name", "rfc_rut", "phone"]}
        onImport={importDistributors}
        note="Un proveedor que ya existe se reconoce por su NIT o documento."
      />

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
                <label htmlFor="distributor-name" className="text-[13px] font-semibold text-on-surface block">Nombre del negocio</label>
                <input
                  id="distributor-name"
                  type="text"
                  required
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej. Distribuidora El Sol S.A.S."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Nombre del contacto</label>
                  <input
                    type="text"
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="Ej. Juan Pérez"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Correo electrónico</label>
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
                <label htmlFor="distributor-phone" className="text-[13px] font-semibold text-on-surface block">Teléfono</label>
                <input
                  id="distributor-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => {
                    setForm({ ...form, phone: e.target.value });
                    if (phoneErrors.phone) setPhoneErrors({ ...phoneErrors, phone: undefined });
                  }}
                  onBlur={() => setPhoneErrors({ ...phoneErrors, phone: phoneErrorOf(form.phone) })}
                  aria-invalid={phoneErrors.phone ? true : undefined}
                  aria-describedby={phoneErrors.phone ? "distributor-phone-error" : undefined}
                  className={`w-full bg-surface-container-lowest border rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/80 ${phoneErrors.phone ? "border-error" : "border-outline-variant/30"}`}
                  placeholder={PHONE_PLACEHOLDER}
                />
                {phoneErrors.phone && (
                  <p id="distributor-phone-error" className="text-xs text-error">{phoneErrors.phone}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="distributor-whatsapp" className="text-[13px] font-semibold text-on-surface block">
                  WhatsApp para pedidos
                </label>
                <input
                  id="distributor-whatsapp"
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => {
                    setForm({ ...form, whatsapp: e.target.value });
                    if (phoneErrors.whatsapp) setPhoneErrors({ ...phoneErrors, whatsapp: undefined });
                  }}
                  onBlur={() => setPhoneErrors({ ...phoneErrors, whatsapp: phoneErrorOf(form.whatsapp) })}
                  aria-invalid={phoneErrors.whatsapp ? true : undefined}
                  aria-describedby="distributor-whatsapp-hint"
                  className={`w-full bg-surface-container-lowest border rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/80 ${phoneErrors.whatsapp ? "border-error" : "border-outline-variant/30"}`}
                  placeholder={PHONE_PLACEHOLDER}
                />
                <p id="distributor-whatsapp-hint" className={`text-xs ${phoneErrors.whatsapp ? "text-error" : "text-on-surface-variant"}`}>
                  {phoneErrors.whatsapp
                    ? `${phoneErrors.whatsapp}. Escríbelo con indicativo, por ejemplo ${PHONE_PLACEHOLDER}.`
                    : "Número al que se enviarán las órdenes de compra."}
                </p>
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
                    {docTypeOptionsFor(form.doc_type).map((t) => (
                      <option key={t.value} value={t.value}>{t.value}</option>
                    ))}
                  </Select>
                  <input
                    type="text"
                    aria-label="Número de documento"
                    value={form.rfc_rut}
                    onChange={(e) => setForm({ ...form, rfc_rut: e.target.value })}
                    className="flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono placeholder:text-on-surface-variant/50"
                    placeholder="Número de documento"
                  />
                  <input
                    type="text"
                    maxLength={2}
                    value={form.dv}
                    onChange={(e) => setForm({ ...form, dv: e.target.value.replace(/\D/g, "") })}
                    className="w-14 shrink-0 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-center placeholder:text-on-surface-variant/50"
                    placeholder="DV"
                    title="Dígito de verificación"
                    aria-label="Dígito de verificación"
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
                  placeholder="Ej. Cra 7 # 12-34, barrio"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Ciudad</label>
                <CitySelect
                  value={form.city}
                  onChange={(city) => setForm({ ...form, city })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                />
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-outline-variant/10">
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

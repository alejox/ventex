"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { IconUsers, IconPlus, IconShoppingCart } from "@/app/assets/icons/DashboardIcons";
import { useCustomersStore } from "@/stores/customers.store";
import { CustomerPaymentModal } from "@/components/CustomerPaymentModal";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { Select } from "@/components/ui/Select";
import { fetchCustomerSales, isVoidSale, summarizeCustomerSales } from "@/services/customers.service";
import type { Customer, NewCustomerInput, CustomerSale } from "@/services/customers.service";
import { usePromosStore } from "@/stores/promos.store";
import { availableReward, renderPromoMessage, whatsappLink, businessDisplayName } from "@/services/promos.service";
import { promoTemplateFor } from "@/config/promo-nouns";
import { useLoyaltyStore } from "@/stores/loyalty.store";
import type { LoyaltyLedgerEntry } from "@/services/loyalty.service";
import { useProfile } from "@/components/ProfileProvider";
import { useSettingsStore } from "@/stores/settings.store";
import { useFormatMoney } from "@/lib/useMoney";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Switch } from "@/components/ui/Switch";
import { useTableUrlState, useUrlParams } from "@/lib/useUrlState";
import { ImportWizard } from "@/lib/import/ImportWizard";
import { CUSTOMER_IMPORT, existingCustomerKeys } from "@/lib/import/customers";
import { customersExportRows, exportFileName } from "@/lib/import/export";
import { downloadCsv } from "@/lib/import/spreadsheet";
import { docTypeOptionsFor, PHONE_PLACEHOLDER } from "@/lib/import/doc-types";
import { parsePhone } from "@/lib/import/values";
import type { CustomerImpact } from "@/services/customers.service";
import { customerImpactLines, filterCustomersByDebt } from "./customer-list";

const EMPTY_CUSTOMER: NewCustomerInput = {
  full_name: "",
  email: "",
  phone: "",
  identification: "",
  doc_type: "CC",
  tax_exempt: false,
  credit_limit: null,
};

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export default function CustomersPage() {
  const fmtMoney = useFormatMoney();
  const customers = useCustomersStore((s) => s.customers);
  const loading = useCustomersStore((s) => s.loading);
  const error = useCustomersStore((s) => s.error);
  const submitting = useCustomersStore((s) => s.submitting);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);
  const addCustomer = useCustomersStore((s) => s.addCustomer);
  const updateCustomer = useCustomersStore((s) => s.updateCustomer);
  const deleteCustomerOrError = useCustomersStore((s) => s.deleteCustomerOrError);
  const fetchImpact = useCustomersStore((s) => s.fetchImpact);
  const importCustomers = useCustomersStore((s) => s.importCustomers);

  // Búsqueda, orden, página y "Con deuda" viven en la URL: volver de la ficha
  // o refrescar deja la lista donde estaba.
  const table = useTableUrlState();
  const [filters, setFilters] = useUrlParams({ deuda: "" });
  const onlyWithDebt = filters.deuda === "1";
  const [importOpen, setImportOpen] = useState(false);
  const existingKeys = useMemo(() => existingCustomerKeys(customers), [customers]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewCustomerInput>(EMPTY_CUSTOMER);
  // Cupo como texto crudo (lo maneja MoneyInput); vacío = sin cupo.
  const [creditLimitRaw, setCreditLimitRaw] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [impact, setImpact] = useState<CustomerImpact | null>(null);
  const [impactError, setImpactError] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  // El contador y el mensaje salen de Configuración → Promociones. Si el
  // negocio no lo encendió, esta pantalla no cambia en nada.
  const promoConfig = usePromosStore((s) => s.config);
  const milestones = usePromosStore((s) => s.milestones);
  const fetchPromos = usePromosStore((s) => s.fetchAll);
  // Igual que el contador de cortes: se pide siempre y no cambia nada para un
  // negocio que no es tienda o que nunca activó los puntos (ver
  // `loyaltyConfig.enabled` más abajo).
  const loyaltyConfig = useLoyaltyStore((s) => s.config);
  const fetchLoyaltyConfig = useLoyaltyStore((s) => s.fetchConfig);
  const fetchLoyaltyLedger = useLoyaltyStore((s) => s.fetchLedger);
  const profile = useProfile();
  const isTienda = profile?.businessType === "tienda";
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<CustomerSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [loyaltyLedger, setLoyaltyLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [loyaltyLedgerLoading, setLoyaltyLedgerLoading] = useState(false);
  const [showLoyaltyHistory, setShowLoyaltyHistory] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchCustomers();
    fetchPromos();
    fetchLoyaltyConfig();
  }, [fetchCustomers, fetchPromos, fetchSettings, fetchLoyaltyConfig]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_CUSTOMER);
    setCreditLimitRaw("");
    setPhoneError(null);
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
      credit_limit: c.credit_limit,
    });
    setCreditLimitRaw(c.credit_limit != null ? String(c.credit_limit) : "");
    setPhoneError(null);
    setModalOpen(true);
  };

  const openDetail = useCallback(async (c: Customer) => {
    setDetailCustomer(c);
    setShowLoyaltyHistory(false);
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

  /**
   * Historial de puntos, pedido bajo demanda (el dueño lo abre solo si le
   * interesa) y no junto con `openDetail`: es una consulta más contra una
   * ficha que ya hace dos, y la mayoría de las visitas a Clientes ni siquiera
   * son de una cuenta `tienda`.
   */
  const toggleLoyaltyHistory = useCallback(async () => {
    if (showLoyaltyHistory) {
      setShowLoyaltyHistory(false);
      return;
    }
    if (!detailCustomer) return;
    setShowLoyaltyHistory(true);
    setLoyaltyLedgerLoading(true);
    try {
      const ledger = await fetchLoyaltyLedger(detailCustomer.id);
      setLoyaltyLedger(ledger);
    } catch {
      setLoyaltyLedger([]);
    } finally {
      setLoyaltyLedgerLoading(false);
    }
  }, [detailCustomer, showLoyaltyHistory, fetchLoyaltyLedger]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // El teléfono se usa para WhatsApp: si no parece uno, se avisa acá y no
    // después, cuando el enlace no abre nada.
    const phone = parsePhone(form.phone);
    if (!phone.ok) {
      setPhoneError(phone.error);
      document.getElementById("customer-phone")?.focus();
      return;
    }
    const limit = parseFloat(creditLimitRaw);
    const input: NewCustomerInput = {
      ...form,
      full_name: form.full_name.trim(),
      credit_limit: creditLimitRaw.trim() !== "" && Number.isFinite(limit) ? limit : null,
    };
    const ok = editingId
      ? await updateCustomer(editingId, input)
      : await addCustomer(input);
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

  /** Abre el diálogo y pide qué arrastra el borrado ANTES de confirmar. */
  const askDelete = async (c: Customer) => {
    setDeleting(c);
    setImpact(null);
    setImpactError(false);
    setDeleteError(null);
    try {
      setImpact(await fetchImpact(c.id));
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
    // El error se queda DENTRO del diálogo: antes quedaba detrás del modal.
    const err = await deleteCustomerOrError(deleting.id);
    if (err) setDeleteError(err);
    else setDeleting(null);
  };

  const visibleCustomers = filterCustomersByDebt(customers, onlyWithDebt);

  const exportCsv = () => {
    downloadCsv(exportFileName("clientes"), customersExportRows(visibleCustomers));
  };

  const handleDetailEdit = (c: Customer) => {
    setDetailCustomer(null);
    openEdit(c);
  };

  // Las anuladas se listan en el historial, pero no cuentan en los totales.
  const { count: salesCount, totalSpent, lastSale } = summarizeCustomerSales(customerSales);

  const columns: DataColumn<Customer>[] = [
    {
      header: "Nombre",
      mobile: "title",
      sortKey: "nombre",
      className: "pl-6 font-medium text-on-surface",
      headerClassName: "pl-6",
      cell: (c) => c.full_name,
    },
    {
      header: "Contacto",
      mobile: "subtitle",
      sortKey: "email",
      sortValue: (c) => c.email ?? c.phone ?? "",
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
      sortKey: "doc",
      sortValue: (c) => c.identification ?? "",
      className: "text-on-surface-variant font-mono text-xs",
      cell: (c) => (
        <span className="font-mono text-xs">
          {c.doc_type && c.identification ? `${c.doc_type} ${c.identification}` : (c.identification ?? "—")}
        </span>
      ),
    },
    {
      header: "Debe",
      align: "right",
      sortKey: "deuda",
      // El dato crudo: la celda es "$1,234.00" y ordenarla como texto mezcla montos.
      sortValue: (c) => Number(c.credit_balance ?? 0),
      className: "font-bold",
      cell: (c) =>
        c.credit_balance > 0 ? (
          <span className="text-warning">{fmtMoney(c.credit_balance)}</span>
        ) : (
          <span className="text-on-surface-variant">{fmtMoney(0)}</span>
        ),
    },
    {
      header: "Impuestos",
      align: "center",
      mobile: "badge",
      cell: (c) =>
        c.tax_exempt ? (
          <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold bg-warning/10 text-warning border border-warning/20">
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
            onClick={() => setPaymentCustomer(c)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
              c.credit_balance > 0
                ? "text-warning hover:text-on-warning hover:bg-warning"
                : "text-on-surface-variant hover:text-primary hover:bg-primary/10"
            }`}
            title={c.credit_balance > 0 ? `Registrar abono (debe ${fmtMoney(c.credit_balance)})` : "Registrar abono"}
            aria-label={`Registrar abono de ${c.full_name}`}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => openDetail(c)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            title="Ver historial"
            aria-label={`Ver historial de ${c.full_name}`}
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
            aria-label={`Editar ${c.full_name}`}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => askDelete(c)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
            title="Eliminar"
            aria-label={`Eliminar ${c.full_name}`}
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
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            Importar
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={visibleCustomers.length === 0}>
            Exportar CSV
          </Button>
          <Button onClick={openCreate} icon={<IconPlus className="w-4 h-4" />} className="col-span-2">
            Añadir cliente
          </Button>
        </div>
      </div>

      {error && <CollectionError message={error} onRetry={fetchCustomers} />}

      {loading ? (
        <CollectionLoading label="Cargando clientes…" />
      ) : customers.length === 0 ? (
        <CollectionEmpty icon={<IconUsers className="w-8 h-8" />} title="Aún no hay clientes" description="Comienza añadiendo a tu primer cliente para hacer seguimiento de sus compras y ofrecer un mejor servicio." action={{ label: "Añadir tu primer cliente", onClick: openCreate }} />
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <DataTable
            rows={visibleCustomers}
            rowKey={(c) => c.id}
            state={table.state}
            onStateChange={table.setState}
            onRowClick={openDetail}
            toolbar={
              <button
                type="button"
                aria-pressed={onlyWithDebt}
                onClick={() => {
                  setFilters({ deuda: onlyWithDebt ? null : "1" });
                  table.setState({ page: 1 });
                }}
                className={`h-9 px-3.5 rounded-full border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  onlyWithDebt
                    ? "bg-primary text-on-primary border-primary"
                    : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:text-on-surface"
                }`}
              >
                Con deuda
              </button>
            }
            minWidth={800}
            caption="Directorio de clientes"
            columns={columns}
            searchable
            searchPlaceholder="Buscar por nombre, teléfono, documento o email"
            getSearchText={(c) =>
              [c.full_name, c.phone, c.identification, c.email].filter(Boolean).join(" ")
            }
          />
        </div>
      )}

      {/* Modal crear/editar cliente */}
      {modalOpen && (
        <Modal
          open
          onClose={handleCloseModal}
          title={editingId ? "Editar Cliente" : "Nuevo Cliente"}
          placement="sheet"
          dismissible={false}
          bodyClassName="border-t border-outline-variant/10"
        >
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {error && (
                <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="customer-name" className="text-[13px] font-semibold text-on-surface block">Nombre completo</label>
                <input
                  id="customer-name"
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
                  <label htmlFor="customer-phone" className="text-[13px] font-semibold text-on-surface block">Teléfono</label>
                  <input
                    id="customer-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => {
                      setForm({ ...form, phone: e.target.value });
                      if (phoneError) setPhoneError(null);
                    }}
                    onBlur={() => {
                      const r = parsePhone(form.phone);
                      setPhoneError(r.ok ? null : r.error);
                    }}
                    aria-invalid={phoneError ? true : undefined}
                    aria-describedby={phoneError ? "customer-phone-error" : undefined}
                    className={`w-full bg-surface-container-lowest border rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/80 ${phoneError ? "border-error" : "border-outline-variant/30"}`}
                    placeholder={PHONE_PLACEHOLDER}
                  />
                  {phoneError && (
                    <p id="customer-phone-error" className="text-xs text-error">{phoneError}. Lo usamos para WhatsApp.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="customer-email" className="text-[13px] font-semibold text-on-surface block">Correo electrónico</label>
                  <input
                    id="customer-email"
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
                    {docTypeOptionsFor(form.doc_type).map((t) => (
                      <option key={t.value} value={t.value}>{t.value}</option>
                    ))}
                  </Select>
                  <input
                    type="text"
                    aria-label="Número de documento"
                    value={form.identification}
                    onChange={(e) => setForm({ ...form, identification: e.target.value })}
                    className="flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono placeholder:text-on-surface-variant/50"
                    placeholder="Número de documento"
                  />
                </div>
                <p className="text-xs text-on-surface-variant">Requerido para facturación.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="customer-credit-limit" className="text-[13px] font-semibold text-on-surface block">
                  Cupo de crédito
                </label>
                <MoneyInput
                  id="customer-credit-limit"
                  value={creditLimitRaw}
                  onChange={setCreditLimitRaw}
                  placeholder="Sin cupo"
                  aria-describedby="customer-credit-limit-hint"
                />
                <p id="customer-credit-limit-hint" className="text-xs text-on-surface-variant">
                  Hasta cuánto le puedes fiar. Déjalo vacío si no tiene cupo definido.
                </p>
              </div>

              <div className="p-3 sm:p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                <Switch
                  checked={form.tax_exempt}
                  onCheckedChange={(v) => setForm({ ...form, tax_exempt: v })}
                  label="Cliente exento de impuestos"
                  description="No aplicar IVA a las compras de este cliente."
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
                  {submitting ? "Guardando…" : editingId ? "Guardar Cambios" : "Guardar Cliente"}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Confirmación eliminar: con el impacto a la vista y el error adentro. */}
      <Modal
        open={deleting !== null}
        onClose={closeDelete}
        role="alertdialog"
        size="sm"
        title="¿Eliminar cliente?"
        description={deleting ? `Vas a eliminar a ${deleting.full_name}. Esta acción no se puede deshacer.` : undefined}
        dismissible={!submitting}
        closeOnEscape={!submitting}
        footer={
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="ghost" onClick={closeDelete} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={submitting}
              loadingLabel="Eliminando…"
              disabled={impact === null && !impactError}
            >
              Eliminar
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          {impact === null && !impactError ? (
            <p className="text-on-surface-variant" role="status">Revisando qué tiene asociado…</p>
          ) : impact === null ? (
            <p className="text-on-surface-variant">
              No pudimos revisar lo que tiene asociado. Sus ventas quedarían sin cliente y sus abonos se borrarían.
            </p>
          ) : customerImpactLines(impact).length === 0 ? (
            <p className="text-on-surface-variant">No tiene ventas, abonos, citas ni vehículos asociados.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-on-surface">
              {customerImpactLines(impact).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {deleting && deleting.credit_balance > 0 && (
            <p className="text-on-surface">
              Te debe <strong>{fmtMoney(deleting.credit_balance)}</strong>: al borrarlo pierdes el registro de esa deuda.
            </p>
          )}
          {deleteError && (
            <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-error">
              No se pudo eliminar: {deleteError}
            </p>
          )}
        </div>
      </Modal>

      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="clientes"
        entity={CUSTOMER_IMPORT}
        existing={existingKeys}
        templateFileName="plantilla-clientes.xlsx"
        previewKeys={["full_name", "identification", "phone"]}
        onImport={importCustomers}
        note="Un cliente que ya existe se reconoce por su documento."
      />

      {/* Modal Detalle del Cliente */}
      {detailCustomer && (
        <Modal
          open
          onClose={() => setDetailCustomer(null)}
          title={detailCustomer.full_name}
          icon={
            <div className="w-10 h-10 rounded-full bg-primary/15 text-primary-ink flex items-center justify-center shrink-0">
              <span className="text-sm font-bold">{detailCustomer.full_name.charAt(0).toUpperCase()}</span>
            </div>
          }
          description={
            <>
              <span className="block text-xs">
                {detailCustomer.doc_type ? `${detailCustomer.doc_type} ${detailCustomer.identification}` : detailCustomer.identification ?? "Sin documento"}
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-on-surface-variant">
                {detailCustomer.phone && <span>{detailCustomer.phone}</span>}
                {detailCustomer.email && <span>{detailCustomer.email}</span>}
                <span className={detailCustomer.tax_exempt ? "text-warning font-semibold" : ""}>
                  {detailCustomer.tax_exempt ? "Exento de IVA" : "Aplica IVA"}
                </span>
              </span>
            </>
          }
          size="lg"
          placement="sheet"
          bodyClassName="border-t border-outline-variant/10"
        >
            <div className="px-4 sm:px-6 pt-4 flex items-center justify-end gap-2">
              <Link
                href={`/dashboard/pos?customerId=${detailCustomer.id}`}
                className="h-9 px-3.5 rounded-xl bg-primary hover:bg-primary-dim text-on-primary text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center gap-1.5"
              >
                <IconShoppingCart className="w-3.5 h-3.5" />
                Nueva Venta
              </Link>
              <button
                type="button"
                onClick={() => handleDetailEdit(detailCustomer)}
                className="h-9 px-3 flex items-center gap-1.5 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-container-low rounded-xl p-3 sm:p-4 text-center min-w-0">
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-on-surface tabular-nums tracking-tight truncate">
                    {salesLoading ? <span className="inline-block w-12 h-6 rounded bg-surface-container-high animate-pulse" /> : salesCount}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1 font-medium uppercase tracking-wider truncate">Ventas</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3 sm:p-4 text-center min-w-0">
                  {/* Cifra larga en una columna angosta: baja de tamaño antes de recortar. */}
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-on-surface tabular-nums tracking-tight truncate">
                    {salesLoading ? <span className="inline-block w-20 h-6 rounded bg-surface-container-high animate-pulse" /> : fmtMoney(totalSpent)}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1 font-medium uppercase tracking-wider truncate">Total Gastado</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3 sm:p-4 text-center min-w-0">
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-on-surface tabular-nums tracking-tight truncate">
                    {salesLoading ? <span className="inline-block w-16 h-6 rounded bg-surface-container-high animate-pulse" /> : lastSale ? new Date(lastSale.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" }) : "—"}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1 font-medium uppercase tracking-wider truncate">Última Visita</p>
                </div>
              </div>

              {/* Cortes acumulados + el mensaje de WhatsApp.
                  Solo aparece si el negocio encendió el contador y eligió qué
                  servicios cuentan: en una tienda de barrio esto no significa
                  nada, y una tarjeta que siempre dice 0 es ruido. */}
              {promoConfig.enabled && promoConfig.serviceIds.length > 0 && (
                <div className="rounded-xl border border-[#25D366]/25 bg-[#25D366]/5 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-2xl font-bold text-on-surface tabular-nums">
                      {detailCustomer.haircuts_since_reward}
                      <span className="text-sm font-medium text-on-surface-variant ml-2">
                        corte{detailCustomer.haircuts_since_reward !== 1 ? "s" : ""} hacia el premio
                      </span>
                    </p>
                    {(() => {
                      const hito = availableReward(detailCustomer.haircuts_since_reward, milestones);
                      return hito ? (
                        <p className="text-xs font-semibold text-[#16a34a] mt-1">
                          🎉 Le toca premio: {hito.reward}
                        </p>
                      ) : (
                        <p className="text-xs text-on-surface-variant mt-1">
                          {detailCustomer.haircut_count} en total contigo. Se actualiza solo en cada venta.
                        </p>
                      );
                    })()}
                  </div>
                  {(() => {
                    const hito = availableReward(detailCustomer.haircuts_since_reward, milestones);
                    const texto = renderPromoMessage(promoTemplateFor(promoConfig.message, profile?.businessType), {
                      cliente: detailCustomer.full_name.split(" ")[0],
                      cortes: detailCustomer.haircuts_since_reward,
                      total: detailCustomer.haircut_count,
                      negocio: businessDisplayName(settings?.business_profile?.businessName, profile?.businessName),
                      premio: hito?.reward ?? null,
                    });
                    const link = whatsappLink(detailCustomer.phone, texto);
                    // Sin teléfono no hay a dónde mandar: se dice por qué en vez
                    // de ofrecer un botón que no puede hacer nada.
                    return link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white text-sm font-bold transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.6-.8-2.7-1.5-3.8-3.4-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.4 1.9.8 2.6.9 3.5.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z" />
                          <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
                        </svg>
                        Enviar por WhatsApp
                      </a>
                    ) : (
                      <span className="shrink-0 text-xs text-on-surface-variant">
                        Sin teléfono: agrégalo para poder escribirle.
                      </span>
                    );
                  })()}
                </div>
              )}

              {/* Puntos de fidelización (tienda). Misma idea que el contador de
                  cortes de arriba, pero acá SÍ hay algo que puede reconstruirse
                  movimiento a movimiento — por eso el historial es expandible en
                  vez de un solo número. */}
              {isTienda && loyaltyConfig.enabled && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-2xl font-bold text-on-surface tabular-nums">
                        {detailCustomer.loyalty_points}
                        <span className="text-sm font-medium text-on-surface-variant ml-2">
                          punto{detailCustomer.loyalty_points === 1 ? "" : "s"} disponible
                          {detailCustomer.loyalty_points === 1 ? "" : "s"}
                        </span>
                      </p>
                      <p className="text-xs text-on-surface-variant mt-1">
                        Se ganan y se canjean solos en el Punto de Venta.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleLoyaltyHistory}
                      className="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-surface-container-high text-on-surface text-xs font-bold hover:bg-surface-container-highest transition-colors"
                    >
                      {showLoyaltyHistory ? "Ocultar movimientos" : "Ver movimientos"}
                    </button>
                  </div>

                  {showLoyaltyHistory && (
                    <div className="mt-3 pt-3 border-t border-primary/15">
                      {loyaltyLedgerLoading ? (
                        <p className="text-xs text-on-surface-variant py-2">Cargando movimientos…</p>
                      ) : loyaltyLedger.length === 0 ? (
                        <p className="text-xs text-on-surface-variant py-2">Todavía no hay movimientos.</p>
                      ) : (
                        <ul className="divide-y divide-outline-variant/10 max-h-56 overflow-y-auto">
                          {loyaltyLedger.map((m) => (
                            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                              <div className="min-w-0">
                                <p className="font-semibold text-on-surface capitalize">
                                  {{ earn: "Ganados", redeem: "Canjeados", reverse: "Anulación", adjust: "Ajuste" }[m.kind]}
                                </p>
                                <p className="text-on-surface-variant">
                                  {new Date(m.createdAt).toLocaleDateString("es-CO", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                  })}
                                  {m.note ? ` · ${m.note}` : ""}
                                </p>
                              </div>
                              <span className={`shrink-0 font-bold tabular-nums ${m.points > 0 ? "text-success" : "text-error"}`}>
                                {m.points > 0 ? "+" : ""}
                                {m.points}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

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
                        <tr className="text-[11px] uppercase tracking-wider text-on-surface-variant font-bold border-b border-outline-variant/10">
                          <th className="pb-3 pr-3">Venta</th>
                          <th className="pb-3 pr-3">Fecha</th>
                          <th className="pb-3 pr-3">Método</th>
                          <th className="pb-3 pr-3 text-center">Items</th>
                          <th className="pb-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/5">
                        {customerSales.map((s) => {
                          const voided = isVoidSale(s);
                          return (
                          <tr
                            key={s.id}
                            className={`hover:bg-surface-container-lowest transition-colors ${voided ? "opacity-60" : ""}`}
                          >
                            <td className="py-3 pr-3 font-mono text-xs text-on-surface-variant whitespace-nowrap">
                              <span className={voided ? "line-through" : ""}>#{s.sale_number}</span>
                              {voided && (
                                <span className="ml-2 inline-flex px-1.5 py-0.5 rounded-md font-sans text-[11px] font-bold bg-error/10 text-error border border-error/20 no-underline">
                                  Anulada
                                </span>
                              )}
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
                            <td
                              className={`py-3 text-right text-xs font-bold tabular-nums ${voided ? "line-through text-on-surface-variant" : "text-on-surface"}`}
                            >
                              {fmtMoney(s.total)}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
        </Modal>
      )}

      {paymentCustomer && (
        <CustomerPaymentModal
          customer={paymentCustomer}
          onClose={() => setPaymentCustomer(null)}
        />
      )}
    </div>
  );
}

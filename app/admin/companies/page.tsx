"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminStore } from "@/stores/admin.store";
import type { AdminCompany } from "@/services/admin.service";
import {
  formatMoney,
  planAccent,
  licenseAccent,
  LICENSE_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/config/plans";
import { BUSINESS_OPTIONS } from "@/config/business";
import { GrantCreditsModal } from "@/components/GrantCreditsModal";
import { backdropProps } from "@/components/modal";
import { IconUsers } from "@/app/assets/icons/DashboardIcons";
import { CollectionEmpty, CollectionError, CollectionFilteredEmpty, CollectionLoading } from "@/components/CollectionState";
import { Pagination } from "@/components/Pagination";
import { Select } from "@/components/ui/Select";
import { ExpiryCell } from "@/components/ui/ExpiryCell";
import {
  buildCompanyRows,
  countCompanies,
  isWithinDays,
  matchesCompanyFilter,
  sortCompanyRows,
  type CompanyFilter,
  type CompanyRow,
  type CompanySortKey,
  type SortDirection,
} from "@/app/admin/company-metrics";

const STATUSES = ["active", "past_due", "cancelled"] as const;

const ACTIVATION_LABELS: Record<NonNullable<CompanyRow["activity"]>["activation_stage"], string> = {
  registered: "Solo registrada",
  setup_started: "Configuración iniciada",
  catalog_ready: "Catálogo listo",
  activated: "Activada con ventas",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "Sin registro";
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" });
}

function businessTypeLabel(type: string | null | undefined): string {
  return BUSINESS_OPTIONS.find((option) => option.id === type)?.label ?? "Sin tipo definido";
}

/**
 * Vencimiento que quedará tras sumar `months`, replicando lo que hace la RPC:
 * si la licencia sigue vigente los meses se apilan sobre su fin; si ya venció
 * (o nunca tuvo), cuentan desde hoy.
 */
function projectedEnd(periodEnd: string | null, months: number): Date {
  const now = new Date();
  const base = periodEnd && new Date(periodEnd) > now ? new Date(periodEnd) : now;
  const end = new Date(base);
  end.setMonth(end.getMonth() + months);
  return end;
}

/** Columnas ordenables. Las demás (etapa, acciones) no tienen un orden natural. */
const SORTABLE_COLUMNS: { key: CompanySortKey; label: string; align?: "right"; defaultDirection: SortDirection }[] = [
  { key: "name", label: "Empresa", defaultDirection: "asc" },
  { key: "plan", label: "Plan", defaultDirection: "asc" },
  { key: "gmv", label: "GMV del mes", align: "right", defaultDirection: "desc" },
  { key: "registered", label: "Registro", defaultDirection: "desc" },
  { key: "lastActivity", label: "Última actividad", defaultDirection: "desc" },
  { key: "expiry", label: "Vencimiento", defaultDirection: "asc" },
];

export default function AdminCompaniesPage() {
  const companies = useAdminStore((s) => s.companies);
  const companyActivity = useAdminStore((s) => s.companyActivity);
  const companyActivityAvailable = useAdminStore((s) => s.companyActivityAvailable);
  const companyActivityError = useAdminStore((s) => s.companyActivityError);
  const plans = useAdminStore((s) => s.plans);
  const resellers = useAdminStore((s) => s.resellers);
  const loading = useAdminStore((s) => s.loading);
  const error = useAdminStore((s) => s.error);
  const fetchCompanies = useAdminStore((s) => s.fetchCompanies);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CompanyFilter>("all");
  const [sortKey, setSortKey] = useState<CompanySortKey>("registered");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<AdminCompany | null>(null);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const granting = resellers.find((r) => r.user_id === grantingId) ?? null;
  // Un solo "ahora" por visita: los KPIs y los filtros cuentan contra el mismo
  // instante, y el render no lee el reloj.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const activityByCompany = useMemo(
    () => new Map(companyActivity.map((activity) => [activity.user_id, activity])),
    [companyActivity],
  );

  // La RPC excluye workers en el servidor. Cuando está disponible, su conjunto
  // de IDs también evita que admin_companies cuele cuentas de trabajadores.
  const rows = useMemo(() => {
    const visible = companyActivityAvailable
      ? companies.filter((company) => activityByCompany.has(company.user_id))
      : companies;
    return buildCompanyRows(visible, activityByCompany);
  }, [activityByCompany, companies, companyActivityAvailable]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = rows.filter((row) => {
      if (!matchesCompanyFilter(row, filter, now)) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.company.full_name ?? "").toLowerCase().includes(q) ||
        (row.company.email ?? "").toLowerCase().includes(q) ||
        businessTypeLabel(row.activity?.business_type).toLowerCase().includes(q)
      );
    });
    return sortCompanyRows(matching, sortKey, sortDirection);
  }, [rows, filter, now, query, sortKey, sortDirection]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

  const hasActivity = companyActivity.length > 0;
  const monthlyGmv = useMemo(() => rows.reduce((total, row) => total + row.monthlyGmv, 0), [rows]);

  /**
   * Cada KPI filtra la tabla (F17). Los que dependen de la RPC de actividad se
   * muestran "—" y no se pueden tocar mientras esa RPC no responda.
   */
  const kpiItems: { filter: CompanyFilter; label: string; needsActivity: boolean }[] = [
    { filter: "new7", label: "Altas · 7 días", needsActivity: false },
    { filter: "new30", label: "Altas · 30 días", needsActivity: false },
    { filter: "activatedNew", label: "Nuevas activadas · 30 días", needsActivity: true },
    { filter: "active7", label: "Activas · últimos 7 días", needsActivity: true },
    { filter: "noActivity", label: "Sin actividad operativa", needsActivity: true },
    { filter: "expiring", label: "Vencen en 7 días", needsActivity: false },
  ];

  const resetPage = () => setCurrentPage(1);

  const toggleSort = (column: (typeof SORTABLE_COLUMNS)[number]) => {
    if (sortKey === column.key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column.key);
      setSortDirection(column.defaultDirection);
    }
    resetPage();
  };

  const activeFilterLabel = kpiItems.find((item) => item.filter === filter)?.label;

  return (
    <div className="w-full max-w-7xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Empresas</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {rows.length} empresa{rows.length === 1 ? "" : "s"} registrada
            {rows.length === 1 ? "" : "s"}. Seguimiento de adquisición y uso real.
          </p>
        </div>
        <input
          type="search"
          value={query}
          aria-label="Buscar empresas"
          onChange={(event) => {
            setQuery(event.target.value);
            resetPage();
          }}
          placeholder="Buscar por empresa, correo o tipo…"
          className="bg-surface-container border border-outline-variant/40 rounded-full py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary-ink focus:ring-1 focus:ring-primary-ink transition-all placeholder:text-on-surface-variant/80 w-full sm:w-80"
        />
      </div>

      {error && <div className="mb-4"><CollectionError message={error} onRetry={fetchCompanies} /></div>}
      {companyActivityError && (
        <div className="rounded-xl bg-warning/10 border border-warning/25 px-4 py-3 text-sm text-warning mb-4">
          {companyActivityError}
        </div>
      )}

      <section aria-label="Indicadores de empresas (tocar uno filtra la tabla)" className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
        {kpiItems.map((item) => {
          const disabled = item.needsActivity && !hasActivity;
          const active = filter === item.filter;
          const value = disabled ? "—" : countCompanies(rows, item.filter, now);
          return (
            <button
              key={item.filter}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => {
                setFilter(active ? "all" : item.filter);
                resetPage();
              }}
              className={`text-left rounded-2xl border p-4 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink disabled:cursor-not-allowed ${
                active
                  ? "bg-primary/10 border-primary-ink/50"
                  : "bg-surface-container-lowest border-outline-variant/40 hover:bg-surface-container-low"
              }`}
            >
              <span className="block text-xs text-on-surface-variant min-h-8">{item.label}</span>
              <span className={`block text-xl font-bold tabular-nums mt-1 ${active ? "text-primary-ink" : "text-on-surface"}`}>
                {value}
              </span>
            </button>
          );
        })}
        {/* El GMV no es un subconjunto de empresas: informa, no filtra. */}
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 p-4 shadow-sm">
          <p className="text-xs text-on-surface-variant min-h-8">GMV de inquilinos · mes</p>
          <p className="text-xl font-bold text-on-surface tabular-nums mt-1 break-words">{formatMoney(monthlyGmv)}</p>
        </div>
      </section>

      {filter !== "all" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
          <span>
            Filtrando por <strong className="text-on-surface">{activeFilterLabel}</strong> · {filtered.length} empresa
            {filtered.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              resetPage();
            }}
            className="rounded-lg px-2 py-1 font-semibold text-primary-ink hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
          >
            Quitar filtro
          </button>
        </div>
      )}

      {loading && companies.length === 0 ? (
        <CollectionLoading label="Cargando empresas…" />
      ) : rows.length === 0 ? (
        <CollectionEmpty
          icon={<IconUsers className="h-8 w-8" />}
          title="Aún no hay empresas"
          description="Las empresas aparecerán aquí cuando completen su registro en la plataforma."
        />
      ) : filtered.length === 0 ? (
        <CollectionFilteredEmpty
          title="Ninguna empresa coincide con la búsqueda"
          action={{
            label: "Limpiar filtros",
            onClick: () => {
              setQuery("");
              setFilter("all");
              resetPage();
            },
          }}
        />
      ) : (
        <>
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <caption className="sr-only">Empresas registradas. Las columnas con botón se pueden ordenar.</caption>
                <thead>
                  <tr className="border-b border-outline-variant/40 text-left text-xs text-on-surface-variant">
                    {SORTABLE_COLUMNS.slice(0, 2).map((column) => (
                      <SortableHeader key={column.key} column={column} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} />
                    ))}
                    <th scope="col" className="px-3 py-3 font-semibold">Etapa</th>
                    {SORTABLE_COLUMNS.slice(2).map((column) => (
                      <SortableHeader key={column.key} column={column} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} />
                    ))}
                    <th scope="col" className="px-3 py-3"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <CompanyTableRow
                      key={row.company.user_id}
                      row={row}
                      now={now}
                      onManage={() => setEditing(row.company)}
                      onGrant={() => setGrantingId(row.company.user_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={pageSize}
            pageSizeOptions={[25, 50, 100]}
            className="mt-3 rounded-2xl border border-outline-variant/40 shadow-sm"
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              resetPage();
            }}
          />
        </>
      )}

      {editing && <ManagePlanModal company={editing} plans={plans} onClose={() => setEditing(null)} />}
      {granting && <GrantCreditsModal reseller={granting} onClose={() => setGrantingId(null)} />}
    </div>
  );
}

function SortableHeader({
  column,
  sortKey,
  sortDirection,
  onSort,
}: {
  column: (typeof SORTABLE_COLUMNS)[number];
  sortKey: CompanySortKey;
  sortDirection: SortDirection;
  onSort: (column: (typeof SORTABLE_COLUMNS)[number]) => void;
}) {
  const active = sortKey === column.key;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2 font-semibold ${column.align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 rounded-lg px-1 py-1 -mx-1 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink ${
          active ? "text-on-surface" : ""
        }`}
      >
        {column.label}
        <span aria-hidden="true" className={active ? "text-primary-ink" : "opacity-60"}>
          {active ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

function CompanyTableRow({
  row,
  now,
  onManage,
  onGrant,
}: {
  row: CompanyRow;
  now: number;
  onManage: () => void;
  onGrant: () => void;
}) {
  const { company, activity } = row;
  const accent = planAccent(company.plan_id);
  const isNew = isWithinDays(row.registeredAt, 7, now);
  const stage = activity ? ACTIVATION_LABELS[activity.activation_stage] : "Información pendiente";
  const counts = activity
    ? `${activity.customers_count} clientes · ${activity.products_count} productos · ${activity.services_count} servicios · ${activity.staff_count} colaboradores`
    : `${company.staff_count} colaboradores`;

  return (
    <tr className="border-b border-outline-variant/20 last:border-0 align-top hover:bg-surface-container-low/60">
      <td className="px-3 py-3 max-w-[260px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-on-surface truncate">{row.name}</span>
          {isNew && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary-ink">Nueva</span>
          )}
          {company.is_super_admin && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary-ink">Admin</span>
          )}
          {company.is_reseller && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">Revendedor</span>
          )}
        </div>
        <span className="block text-xs text-on-surface-variant truncate">{company.email}</span>
        <span className="block text-xs text-on-surface-variant">
          {businessTypeLabel(activity?.business_type)}
          {company.reseller_name ? ` · Cliente de ${company.reseller_name}` : ""}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}>
          {company.plan_name ?? company.plan_id}
        </span>
        <span className="block text-[11px] text-on-surface-variant mt-1">
          {SUBSCRIPTION_STATUS_LABELS[company.status] ?? company.status}
        </span>
        {company.license_status && (
          <span className={`inline-block mt-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full ring-1 ${licenseAccent(company.license_status).bg} ${licenseAccent(company.license_status).text} ${licenseAccent(company.license_status).ring}`}>
            Licencia: {LICENSE_STATUS_LABELS[company.license_status] ?? company.license_status}
          </span>
        )}
      </td>
      <td className="px-3 py-3 max-w-[220px]">
        <span className="block text-xs font-semibold text-on-surface">{stage}</span>
        <span className="block text-[11px] text-on-surface-variant mt-0.5">{counts}</span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        <span className="block font-semibold text-on-surface">{formatMoney(row.monthlyGmv)}</span>
        <span className="block text-[11px] text-on-surface-variant">
          {activity ? `${activity.monthly_sales_count} ventas` : "—"} · hist. {formatMoney(company.total_sales)}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-on-surface whitespace-nowrap">{formatShortDate(row.registeredAt)}</td>
      <td className="px-3 py-3 text-xs whitespace-nowrap">
        <span className="block text-on-surface">{formatShortDate(row.lastActivityAt)}</span>
        <span className="block text-[11px] text-on-surface-variant">
          Ingreso: {formatShortDate(activity?.last_sign_in_at ?? null)}
        </span>
      </td>
      <td className="px-3 py-3 text-xs whitespace-nowrap">
        <ExpiryCell periodEnd={company.period_end} />
      </td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-2">
          {company.is_reseller && (
            <button
              type="button"
              onClick={onGrant}
              className="h-9 px-3 rounded-xl border border-warning/40 text-warning text-xs font-semibold hover:bg-warning/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
            >
              Créditos
            </button>
          )}
          <button
            type="button"
            onClick={onManage}
            className="h-9 px-3 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-dim transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Gestionar
          </button>
        </div>
      </td>
    </tr>
  );
}

function ManagePlanModal({
  company,
  plans,
  onClose,
}: {
  company: AdminCompany;
  plans: ReturnType<typeof useAdminStore.getState>["plans"];
  onClose: () => void;
}) {
  const setCompanyPlan = useAdminStore((s) => s.setCompanyPlan);
  const rechargeCompany = useAdminStore((s) => s.rechargeCompany);
  const periods = useAdminStore((s) => s.periods);
  const submitting = useAdminStore((s) => s.submitting);
  const error = useAdminStore((s) => s.error);

  const [planId, setPlanId] = useState(company.plan_id);
  const [status, setStatus] = useState(company.status);
  /** "none" (no tocar el vencimiento), el id de un tiempo del plan, o "custom". */
  const [option, setOption] = useState<string>("none");
  const [customMonths, setCustomMonths] = useState("1");

  // El plan gratis no tiene vigencia: la regla es el precio, no el id. Se mira
  // el plan SELECCIONADO, no el actual: al pasar a uno de pago hay que fijarle
  // vencimiento en el mismo paso, o quedaría activo para siempre.
  const selectedPlan = plans.find((p) => p.id === planId);
  const chargeable = Boolean(selectedPlan && selectedPlan.price > 0);
  /** Los tiempos que el plan vende, tal como se configuran en /admin/plans. */
  const options = periods.filter((p) => p.plan_id === planId && p.is_active);
  const selectedPeriod = options.find((p) => p.id === option) ?? null;

  const custom = option === "custom";
  const months = custom
    ? Math.min(60, Math.max(1, parseInt(customMonths, 10) || 1))
    : (selectedPeriod?.months ?? 0);

  /** Al pasar a un plan de pago distinto, proponemos su primer tiempo. */
  const handlePlanChange = (id: string) => {
    setPlanId(id);
    const plan = plans.find((p) => p.id === id);
    const paid = Boolean(plan && plan.price > 0);
    const first = periods.find((p) => p.plan_id === id && p.is_active);
    setOption(paid && id !== company.plan_id && first ? first.id : "none");
  };

  const handleSave = async () => {
    const ok = await setCompanyPlan(company.user_id, planId, status);
    if (!ok) return;
    // El plan debe estar guardado antes de recargar: la RPC lee el plan vigente
    // en la base para validar que no sea el gratis.
    if (chargeable && option !== "none") {
      const periodEnd = await rechargeCompany(company.user_id, months);
      if (!periodEnd) return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropProps(onClose)}
    >
      <div
        className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Gestionar suscripción</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {company.business_name || company.full_name || company.email}
          </p>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          <Select
            label="Plan"
            value={planId}
            onChange={(e) => handlePlanChange(e.target.value)}
          >
              {/* Solo planes vigentes; se conserva el actual aunque se haya desactivado. */}
              {plans
                .filter((p) => p.is_active || p.id === company.plan_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.price > 0 ? ` — ${formatMoney(p.price)}/mes` : " — Gratis"}
                  </option>
                ))}
            </Select>

          <Select
            label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>

          {/* Vigencia: el admin no consume créditos, él es la fuente de los meses. */}
          {chargeable && (
            <div className="pt-5 border-t border-outline-variant/10">
              <label className="block text-sm font-semibold text-on-surface mb-1">
                Vigencia
              </label>
              <p className="text-xs text-on-surface-variant mb-3">
                Vence actualmente:{" "}
                <strong className="text-on-surface">
                  {company.period_end ? formatDate(company.period_end) : "sin vencimiento"}
                </strong>
                . Los meses se suman al periodo vigente; si ya venció, cuentan desde
                hoy. Se aplican al guardar.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  aria-label="Recarga a aplicar"
                  containerClassName="flex-1 min-w-0"
                  value={option}
                  onChange={(e) => setOption(e.target.value)}
                >
                  <option value="none">Sin recarga (no cambiar el vencimiento)</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — +{o.months} {o.months === 1 ? "mes" : "meses"} (
                      {formatMoney(o.price)})
                    </option>
                  ))}
                  <option value="custom">Personalizado…</option>
                </Select>

                {custom && (
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={customMonths}
                    onChange={(e) => setCustomMonths(e.target.value)}
                    aria-label="Meses a recargar"
                    className="w-full sm:w-24 px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow tabular-nums"
                  />
                )}
              </div>

              {option !== "none" && selectedPlan && (
                <div className="mt-3 rounded-xl bg-surface-container-low border border-outline-variant/20 px-4 py-3 text-xs text-on-surface-variant space-y-1">
                  <p>
                    Activa{" "}
                    <strong className="text-on-surface">
                      {months} {months === 1 ? "mes" : "meses"}
                    </strong>{" "}
                    del plan{" "}
                    <strong className="text-on-surface">{selectedPlan.name}</strong>
                  </p>
                  <p>
                    Vence:{" "}
                    <span className="text-on-surface-variant">
                      {company.period_end ? formatDate(company.period_end) : "sin vencimiento"}
                    </span>{" "}
                    →{" "}
                    <strong className="text-on-surface tabular-nums">
                      {formatDate(projectedEnd(company.period_end, months).toISOString())}
                    </strong>
                  </p>
                  <p>
                    Valor del periodo:{" "}
                    <strong className="text-on-surface">
                      {formatMoney(
                        // Un tiempo lleva su precio; un ajuste "personalizado" se
                        // valora al precio de mes del plan.
                        selectedPeriod ? selectedPeriod.price : selectedPlan.price * months,
                      )}
                    </strong>
                  </p>
                </div>
              )}

              {option === "none" && !company.period_end && (
                <p className="text-xs text-warning mt-2">
                  Sin meses, el plan {selectedPlan?.name} queda activo sin fecha de
                  vencimiento. Elige cuántos meses le asignas.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-6 pt-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={submitting}
            className="py-2.5 px-5 rounded-xl bg-primary text-on-primary hover:bg-primary-dim text-sm font-bold shadow-lg shadow-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Guardando…"
              : chargeable && option !== "none"
                ? `Guardar y recargar ${months} ${months === 1 ? "mes" : "meses"}`
                : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

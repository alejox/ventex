"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminStore } from "@/stores/admin.store";
import type { AdminCompany, AdminCompanyActivity } from "@/services/admin.service";
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
import { Select } from "@/components/ui/Select";

const STATUSES = ["active", "past_due", "cancelled"] as const;
const MS_PER_DAY = 86_400_000;

const ACTIVATION_LABELS: Record<AdminCompanyActivity["activation_stage"], string> = {
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

function formatDateTime(iso: string | null): string {
  if (!iso) return "Sin registro";
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isWithinDays(iso: string, days: number): boolean {
  const timestamp = new Date(iso).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.now() - days * MS_PER_DAY;
}

function businessTypeLabel(type: string | null | undefined): string {
  return BUSINESS_OPTIONS.find((option) => option.id === type)?.label ?? "Sin tipo definido";
}

/** Días que faltan para el vencimiento (negativo = ya venció). */
function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / MS_PER_DAY);
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

/** Vencimiento del plan: fecha + días restantes, en rojo si venció o está por vencer. */
function ExpiryCell({ periodEnd }: { periodEnd: string | null }) {
  if (!periodEnd) {
    return <span className="text-on-surface-variant">Sin vencimiento</span>;
  }

  const days = daysLeft(periodEnd);
  const expired = days < 0;
  const soon = !expired && days <= 7;

  return (
    <>
      <span className={`block tabular-nums ${expired ? "text-error-dim font-semibold" : "text-on-surface"}`}>
        {formatDate(periodEnd)}
      </span>
      <span
        className={`block text-[11px] mt-0.5 ${
          expired
            ? "text-error-dim"
            : soon
              ? "text-amber-500 font-semibold"
              : "text-on-surface-variant"
        }`}
      >
        {expired
          ? `Vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`
          : days === 0
            ? "Vence hoy"
            : `Faltan ${days} día${days === 1 ? "" : "s"}`}
      </span>
    </>
  );
}

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
  const [editing, setEditing] = useState<AdminCompany | null>(null);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const granting = resellers.find((r) => r.user_id === grantingId) ?? null;

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const activityByCompany = useMemo(
    () => new Map(companyActivity.map((activity) => [activity.user_id, activity])),
    [companyActivity],
  );

  // La RPC excluye workers en el servidor. Cuando está disponible, su conjunto
  // de IDs también evita que admin_companies cuele cuentas de trabajadores.
  const visibleCompanies = useMemo(
    () =>
      companyActivityAvailable
        ? companies.filter((company) => activityByCompany.has(company.user_id))
        : companies,
    [activityByCompany, companies, companyActivityAvailable],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleCompanies;
    return visibleCompanies.filter((company) => {
      const activity = activityByCompany.get(company.user_id);
      return (
        (company.business_name ?? "").toLowerCase().includes(q) ||
        (company.full_name ?? "").toLowerCase().includes(q) ||
        (company.email ?? "").toLowerCase().includes(q) ||
        businessTypeLabel(activity?.business_type).toLowerCase().includes(q)
      );
    });
  }, [activityByCompany, query, visibleCompanies]);

  const kpis = useMemo(() => {
    if (companyActivity.length === 0) return null;
    return {
      registrations7: companyActivity.filter((item) => isWithinDays(item.registered_at, 7)).length,
      registrations30: companyActivity.filter((item) => isWithinDays(item.registered_at, 30)).length,
      activatedNew: companyActivity.filter(
        (item) => isWithinDays(item.registered_at, 30) && item.activation_stage === "activated",
      ).length,
      active7: companyActivity.filter(
        (item) => item.last_operational_activity_at && isWithinDays(item.last_operational_activity_at, 7),
      ).length,
      noActivity: companyActivity.filter((item) => !item.last_operational_activity_at).length,
      monthlyGmv: companyActivity.reduce((total, item) => total + Number(item.monthly_gmv), 0),
    };
  }, [companyActivity]);

  const kpiItems = [
    { label: "Altas · 7 días", value: kpis?.registrations7 ?? "—" },
    { label: "Altas · 30 días", value: kpis?.registrations30 ?? "—" },
    { label: "Nuevas activadas · 30 días", value: kpis?.activatedNew ?? "—" },
    { label: "Activas · últimos 7 días", value: kpis?.active7 ?? "—" },
    { label: "Sin actividad operativa", value: kpis?.noActivity ?? "—" },
    { label: "GMV del mes", value: kpis ? formatMoney(kpis.monthlyGmv) : "—" },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Empresas</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {visibleCompanies.length} empresa{visibleCompanies.length === 1 ? "" : "s"} registrada
            {visibleCompanies.length === 1 ? "" : "s"}. Seguimiento de adquisición y uso real.
          </p>
        </div>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por empresa, correo o tipo…"
          className="bg-surface-container border border-outline-variant/20 rounded-full py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 w-full sm:w-80"
        />
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-4">
          {error}
        </div>
      )}
      {companyActivityError && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 mb-4">
          {companyActivityError}
        </div>
      )}

      <section aria-label="Indicadores de empresas" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {kpiItems.map((item) => (
          <div key={item.label} className="rounded-2xl bg-surface-container-lowest border border-outline-variant/10 p-4 shadow-sm">
            <p className="text-xs text-on-surface-variant min-h-8">{item.label}</p>
            <p className="text-xl font-bold text-on-surface tabular-nums mt-1">{item.value}</p>
          </div>
        ))}
      </section>

      {loading && companies.length === 0 ? (
        <p className="py-12 text-center text-sm text-on-surface-variant">Cargando empresas…</p>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-on-surface-variant">No hay empresas que coincidan.</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((company) => (
            <CompanyCard
              key={company.user_id}
              company={company}
              activity={activityByCompany.get(company.user_id) ?? null}
              onManage={() => setEditing(company)}
              onGrant={() => setGrantingId(company.user_id)}
            />
          ))}
        </div>
      )}

      {editing && <ManagePlanModal company={editing} plans={plans} onClose={() => setEditing(null)} />}
      {granting && <GrantCreditsModal reseller={granting} onClose={() => setGrantingId(null)} />}
    </div>
  );
}

function CompanyCard({
  company,
  activity,
  onManage,
  onGrant,
}: {
  company: AdminCompany;
  activity: AdminCompanyActivity | null;
  onManage: () => void;
  onGrant: () => void;
}) {
  const accent = planAccent(company.plan_id);
  const registeredAt = activity?.registered_at ?? company.created_at;
  const isNew = isWithinDays(registeredAt, 7);
  const stage = activity ? ACTIVATION_LABELS[activity.activation_stage] : "Información pendiente";
  const monthlyGmv = activity ? Number(activity.monthly_gmv) : company.monthly_sales;

  const counts = [
    { label: "Clientes", value: activity?.customers_count ?? "—" },
    { label: "Productos", value: activity?.products_count ?? "—" },
    { label: "Servicios", value: activity?.services_count ?? "—" },
    { label: "Colaboradores", value: activity?.staff_count ?? company.staff_count },
  ];

  return (
    <article className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-on-surface truncate">
              {company.business_name || company.full_name || "Sin nombre"}
            </h2>
            {isNew && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">NUEVA</span>
            )}
            {company.is_super_admin && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">ADMIN</span>
            )}
            {company.is_reseller && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">REVENDEDOR</span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant truncate mt-0.5">{company.email}</p>
          <p className="text-xs text-on-surface font-medium mt-1">{businessTypeLabel(activity?.business_type)}</p>
          {company.reseller_name && (
            <p className="text-[11px] text-on-surface-variant mt-0.5">Cliente de: {company.reseller_name}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}>
            {company.plan_name ?? company.plan_id}
          </span>
          <p className="text-[11px] text-on-surface-variant mt-1">
            {SUBSCRIPTION_STATUS_LABELS[company.status] ?? company.status}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface">
          {stage}
        </span>
        {company.license_status && (
          <span className={`text-[11px] font-bold px-2 py-1 rounded-full ring-1 ${licenseAccent(company.license_status).bg} ${licenseAccent(company.license_status).text} ${licenseAccent(company.license_status).ring}`}>
            Licencia: {LICENSE_STATUS_LABELS[company.license_status] ?? company.license_status}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {counts.map((item) => (
          <div key={item.label} className="rounded-xl bg-surface-container-low px-3 py-2">
            <p className="text-[11px] text-on-surface-variant">{item.label}</p>
            <p className="text-base font-bold text-on-surface tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-outline-variant/10 text-xs">
        <div>
          <p className="text-on-surface-variant">Ventas del mes</p>
          <p className="text-on-surface font-semibold tabular-nums mt-0.5">{activity?.monthly_sales_count ?? "—"}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">GMV del mes</p>
          <p className="text-on-surface font-semibold tabular-nums mt-0.5">{formatMoney(monthlyGmv)}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">GMV histórico</p>
          <p className="text-on-surface font-semibold tabular-nums mt-0.5">{formatMoney(company.total_sales)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-outline-variant/10 text-xs">
        <div>
          <p className="text-on-surface-variant">Registro</p>
          <p className="text-on-surface mt-0.5">{formatDateTime(registeredAt)}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">Último ingreso</p>
          <p className="text-on-surface mt-0.5">{formatDateTime(activity?.last_sign_in_at ?? null)}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">Última actividad operativa</p>
          <p className="text-on-surface mt-0.5">{formatDateTime(activity?.last_operational_activity_at ?? null)}</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-outline-variant/10 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          <p className="text-on-surface-variant">Vencimiento</p>
          <ExpiryCell periodEnd={company.period_end} />
        </div>
        <div className="flex gap-2">
          {company.is_reseller && (
            <button onClick={onGrant} className="h-10 px-4 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 text-sm font-semibold hover:bg-amber-500/10 transition-colors">
              Créditos
            </button>
          )}
          <button onClick={onManage} className="h-10 px-4 rounded-xl bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity">
            Gestionar
          </button>
        </div>
      </div>
    </article>
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
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
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
            className="py-2.5 px-5 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

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
import { GrantCreditsModal } from "@/components/GrantCreditsModal";
import { backdropProps } from "@/components/modal";
const STATUSES = ["active", "past_due", "cancelled"] as const;

const MS_PER_DAY = 86_400_000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      <span
        className={`block tabular-nums ${
          expired ? "text-error-dim font-semibold" : "text-on-surface"
        }`}
      >
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
  const plans = useAdminStore((s) => s.plans);
  const resellers = useAdminStore((s) => s.resellers);
  const loading = useAdminStore((s) => s.loading);
  const error = useAdminStore((s) => s.error);
  const fetchCompanies = useAdminStore((s) => s.fetchCompanies);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminCompany | null>(null);
  /** user_id del revendedor al que se le recargan créditos desde esta vista. */
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const granting = resellers.find((r) => r.user_id === grantingId) ?? null;

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        (c.business_name ?? "").toLowerCase().includes(q) ||
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [companies, query]);

  return (
    <div className="w-full max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Empresas</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {companies.length} empresa{companies.length === 1 ? "" : "s"} registrada
            {companies.length === 1 ? "" : "s"}.
          </p>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o correo…"
          className="bg-surface-container border border-outline-variant/20 rounded-full py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 w-full sm:w-72"
        />
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-6">
          {error}
        </div>
      )}

      {/* Móvil: tarjetas. La tabla de 7 columnas es ilegible a 390px. */}
      <div className="lg:hidden space-y-3">
        {loading && companies.length === 0 ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Cargando empresas…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">
            No hay empresas que coincidan.
          </p>
        ) : (
          filtered.map((c) => (
            <CompanyCard
              key={c.user_id}
              company={c}
              onManage={() => setEditing(c)}
              onGrant={() => setGrantingId(c.user_id)}
            />
          ))
        )}
      </div>

      <div className="hidden lg:block bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/10 text-left text-on-surface-variant">
                <th className="font-semibold px-5 py-4">Empresa</th>
                <th className="font-semibold px-5 py-4">Plan</th>
                <th className="font-semibold px-5 py-4">Vence</th>
                <th className="font-semibold px-5 py-4 text-right">Colaboradores</th>
                <th className="font-semibold px-5 py-4 text-right">Ventas (mes)</th>
                <th className="font-semibold px-5 py-4 text-right">Ventas (total)</th>
                <th className="font-semibold px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading && companies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-on-surface-variant">
                    Cargando empresas…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-on-surface-variant">
                    No hay empresas que coincidan.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const accent = planAccent(c.plan_id);
                  return (
                    <tr
                      key={c.user_id}
                      className="border-b border-outline-variant/5 last:border-0 hover:bg-surface-container-low/50"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-on-surface">
                            {c.business_name || c.full_name || "Sin nombre"}
                          </span>
                          {c.is_super_admin && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                              ADMIN
                            </span>
                          )}
                          {c.is_reseller && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">
                              REVENDEDOR
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-on-surface-variant">{c.email}</span>
                        {c.reseller_name && (
                          <span className="block text-[11px] text-on-surface-variant mt-0.5">
                            Cliente de: {c.reseller_name}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}>
                          {c.plan_name ?? c.plan_id}
                        </span>
                        <span className="block text-[11px] text-on-surface-variant mt-1">
                          {SUBSCRIPTION_STATUS_LABELS[c.status] ?? c.status}
                        </span>
                        {c.license_status && (
                          <span
                            className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full ring-1 ${licenseAccent(c.license_status).bg} ${licenseAccent(c.license_status).text} ${licenseAccent(c.license_status).ring}`}
                          >
                            Licencia: {LICENSE_STATUS_LABELS[c.license_status] ?? c.license_status}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <ExpiryCell periodEnd={c.period_end} />
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums text-on-surface">{c.staff_count}</td>
                      <td className="px-5 py-4 text-right tabular-nums text-on-surface">
                        {formatMoney(c.monthly_sales)}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums text-on-surface-variant">
                        {formatMoney(c.total_sales)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-4">
                          {c.is_reseller && (
                            <button
                              onClick={() => setGrantingId(c.user_id)}
                              className="text-sm font-semibold text-amber-500 hover:underline whitespace-nowrap"
                            >
                              Créditos
                            </button>
                          )}
                          <button
                            onClick={() => setEditing(c)}
                            className="text-sm font-semibold text-primary hover:underline whitespace-nowrap"
                          >
                            Gestionar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ManagePlanModal
          company={editing}
          plans={plans}
          onClose={() => setEditing(null)}
        />
      )}

      {granting && (
        <GrantCreditsModal reseller={granting} onClose={() => setGrantingId(null)} />
      )}
    </div>
  );
}

/** Fila de la tabla convertida en tarjeta para móvil. */
function CompanyCard({
  company: c,
  onManage,
  onGrant,
}: {
  company: AdminCompany;
  onManage: () => void;
  onGrant: () => void;
}) {
  const accent = planAccent(c.plan_id);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-on-surface">
              {c.business_name || c.full_name || "Sin nombre"}
            </span>
            {c.is_super_admin && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                ADMIN
              </span>
            )}
            {c.is_reseller && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">
                REVENDEDOR
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant truncate">{c.email}</p>
          {c.reseller_name && (
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Cliente de: {c.reseller_name}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}
        >
          {c.plan_name ?? c.plan_id}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-3">
        <span className="text-[11px] text-on-surface-variant">
          {SUBSCRIPTION_STATUS_LABELS[c.status] ?? c.status}
        </span>
        {c.license_status && (
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ring-1 ${licenseAccent(c.license_status).bg} ${licenseAccent(c.license_status).text} ${licenseAccent(c.license_status).ring}`}
          >
            Licencia: {LICENSE_STATUS_LABELS[c.license_status] ?? c.license_status}
          </span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-outline-variant/10 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-on-surface-variant">Vence</p>
          <div className="mt-0.5">
            <ExpiryCell periodEnd={c.period_end} />
          </div>
        </div>
        <div>
          <p className="text-on-surface-variant">Colaboradores</p>
          <p className="text-on-surface tabular-nums mt-0.5">{c.staff_count}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">Ventas (mes)</p>
          <p className="text-on-surface tabular-nums mt-0.5">{formatMoney(c.monthly_sales)}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">Ventas (total)</p>
          <p className="text-on-surface tabular-nums mt-0.5">{formatMoney(c.total_sales)}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {c.is_reseller && (
          <button
            onClick={onGrant}
            className="flex-1 h-10 rounded-xl border border-amber-500/40 text-amber-500 text-sm font-semibold hover:bg-amber-500/10 transition-colors"
          >
            Créditos
          </button>
        )}
        <button
          onClick={onManage}
          className="flex-1 h-10 rounded-xl bg-[#6063ee] text-white text-sm font-bold hover:bg-[#c0c1ff] hover:text-[#0b0664] transition-colors"
        >
          Gestionar
        </button>
      </div>
    </div>
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

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Plan</label>
            <select
              value={planId}
              onChange={(e) => handlePlanChange(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
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
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SUBSCRIPTION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

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
                <select
                  value={option}
                  onChange={(e) => setOption(e.target.value)}
                  className="flex-1 px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
                >
                  <option value="none">Sin recarga (no cambiar el vencimiento)</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — +{o.months} {o.months === 1 ? "mes" : "meses"} (
                      {formatMoney(o.price)})
                    </option>
                  ))}
                  <option value="custom">Personalizado…</option>
                </select>

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

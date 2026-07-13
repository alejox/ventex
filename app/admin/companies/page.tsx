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

const STATUSES = ["active", "past_due", "cancelled"] as const;

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

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/10 text-left text-on-surface-variant">
                <th className="font-semibold px-5 py-4">Empresa</th>
                <th className="font-semibold px-5 py-4">Plan</th>
                <th className="font-semibold px-5 py-4 text-right">Colaboradores</th>
                <th className="font-semibold px-5 py-4 text-right">Ventas (mes)</th>
                <th className="font-semibold px-5 py-4 text-right">Ventas (total)</th>
                <th className="font-semibold px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading && companies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
                    Cargando empresas…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
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
  const submitting = useAdminStore((s) => s.submitting);
  const error = useAdminStore((s) => s.error);

  const [planId, setPlanId] = useState(company.plan_id);
  const [status, setStatus] = useState(company.status);
  const [months, setMonths] = useState("1");
  const [recharged, setRecharged] = useState<string | null>(null);

  // El plan gratis no se gestiona: la regla es el precio, no el id.
  const currentPlan = plans.find((p) => p.id === company.plan_id);
  const chargeable = Boolean(currentPlan && currentPlan.price > 0);

  const handleSave = async () => {
    const ok = await setCompanyPlan(company.user_id, planId, status);
    if (ok) onClose();
  };

  const handleRecharge = async (value: number) => {
    const periodEnd = await rechargeCompany(company.user_id, value);
    if (periodEnd) setRecharged(periodEnd);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
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
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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

          {/* Recarga directa: el admin no consume créditos, él es la fuente. */}
          {chargeable && (
            <div className="pt-5 border-t border-outline-variant/10">
              <label className="block text-sm font-semibold text-on-surface mb-1">
                Recargar meses
              </label>
              <p className="text-xs text-on-surface-variant mb-3">
                Extiende el vencimiento sin consumir créditos. Se suma al periodo
                vigente; si ya venció, cuenta desde hoy.
              </p>

              {recharged && (
                <div className="rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 px-4 py-3 text-sm text-[#10b981] mb-3">
                  Recarga aplicada. Vence el{" "}
                  <strong>
                    {new Date(recharged).toLocaleDateString("es-CO", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </strong>
                  .
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-3">
                {[1, 3, 6, 12].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleRecharge(m)}
                    disabled={submitting}
                    className="px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-low hover:bg-surface-container-high text-sm font-semibold text-on-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    +{m} {m === 1 ? "mes" : "meses"}
                    {m === 12 && <span className="text-primary"> · año</span>}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  className="w-24 px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => handleRecharge(Math.min(60, Math.max(1, parseInt(months, 10) || 1)))}
                  disabled={submitting}
                  className="py-2.5 px-4 rounded-xl border border-outline-variant/20 text-sm font-semibold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Recargando…" : "Recargar"}
                </button>
              </div>
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
            {submitting ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useResellerStore } from "@/stores/reseller.store";
import type { RechargePeriod, ResellerClient } from "@/services/reseller.service";
import {
  LICENSE_STATUS_LABELS,
  annualFreeMonths,
  hasAnnual,
  licenseAccent,
} from "@/config/plans";
import { BUSINESS_OPTIONS } from "@/config/business";

export default function ResellerClientsPage() {
  const clients = useResellerStore((s) => s.clients);
  const stats = useResellerStore((s) => s.stats);
  const loading = useResellerStore((s) => s.loading);
  const error = useResellerStore((s) => s.error);
  const fetchOverview = useResellerStore((s) => s.fetchOverview);

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<ResellerClient | null>(null);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        (c.business_name ?? "").toLowerCase().includes(q) ||
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [clients, query]);

  return (
    <div className="w-full max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Mis clientes</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {clients.length} cliente{clients.length === 1 ? "" : "s"}
            {stats
              ? ` · créditos: ${Object.entries(stats.balances ?? {})
                  .map(([id, bal]) => `${id} ${bal}`)
                  .join(", ") || "sin saldo"}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o correo…"
            className="bg-surface-container border border-outline-variant/20 rounded-full py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 w-full sm:w-64"
          />
          <button
            onClick={() => setCreating(true)}
            className="py-2.5 px-5 rounded-full bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors whitespace-nowrap"
          >
            + Nuevo cliente
          </button>
        </div>
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
                <th className="font-semibold px-5 py-4">Cliente</th>
                <th className="font-semibold px-5 py-4">Plan</th>
                <th className="font-semibold px-5 py-4">Licencia</th>
                <th className="font-semibold px-5 py-4">Vence</th>
                <th className="font-semibold px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading && clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">
                    Cargando clientes…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">
                    {clients.length === 0
                      ? "Aún no tienes clientes. Crea el primero con “Nuevo cliente”."
                      : "No hay clientes que coincidan."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const accent = licenseAccent(c.license_status);
                  return (
                    <tr
                      key={c.user_id}
                      className="border-b border-outline-variant/5 last:border-0 hover:bg-surface-container-low/50"
                    >
                      <td className="px-5 py-4">
                        <span className="font-semibold text-on-surface block">
                          {c.business_name || c.full_name || "Sin nombre"}
                        </span>
                        <span className="text-xs text-on-surface-variant">{c.email}</span>
                      </td>
                      <td className="px-5 py-4 text-on-surface">{c.plan_name ?? c.plan_id}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}
                        >
                          {LICENSE_STATUS_LABELS[c.license_status] ?? c.license_status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-on-surface-variant tabular-nums">
                        {c.period_end
                          ? new Date(c.period_end).toLocaleDateString("es-CO", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => setManaging(c)}
                          className="text-sm font-semibold text-primary hover:underline whitespace-nowrap"
                        >
                          Gestionar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <CreateClientModal onClose={() => setCreating(false)} />}
      {managing && <ManageClientModal client={managing} onClose={() => setManaging(null)} />}
    </div>
  );
}

function CreateClientModal({ onClose }: { onClose: () => void }) {
  const createClient = useResellerStore((s) => s.createClient);
  const submitting = useResellerStore((s) => s.submitting);
  const error = useResellerStore((s) => s.error);
  const plans = useResellerStore((s) => s.plans);
  const stats = useResellerStore((s) => s.stats);

  // Solo planes con créditos posibles (los créditos son por plan; gratis no aplica).
  const creditPlans = plans.filter((p) => p.is_active && p.id !== "gratis");
  const balanceOf = (id: string) => stats?.balances?.[id] ?? 0;
  const firstWithBalance = creditPlans.find((p) => balanceOf(p.id) > 0);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState(BUSINESS_OPTIONS[0].id);
  const [planId, setPlanId] = useState(firstWithBalance?.id ?? creditPlans[0]?.id ?? "");

  const noCredits = balanceOf(planId) < 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await createClient({
      email,
      password,
      full_name: fullName,
      business_name: businessName,
      business_type: businessType,
      plan_id: planId,
    });
    if (ok) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Nuevo cliente</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            La cuenta se crea con la contraseña que asignes. El primer login del
            cliente activa su licencia y consume 1 crédito.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                {error}
              </div>
            )}
            {noCredits && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                No tienes créditos del plan seleccionado: elige otro plan o solicita
                una recarga al administrador.
              </div>
            )}

            <Field label="Nombre completo *">
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow"
              />
            </Field>

            <Field label="Nombre del negocio">
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow"
              />
            </Field>

            <Field label="Email *">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow"
              />
            </Field>

            <Field label="Contraseña * (mínimo 6 caracteres)">
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow"
              />
            </Field>

            <Field label="Tipo de negocio">
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as typeof businessType)}
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
              >
                {BUSINESS_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Plan (consume 1 crédito de ese plan al primer login)">
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
              >
                {creditPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {balanceOf(p.id)} crédito{balanceOf(p.id) === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="p-6 pt-0 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || noCredits}
              className="py-2.5 px-5 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creando…" : "Crear cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManageClientModal({
  client,
  onClose,
}: {
  client: ResellerClient;
  onClose: () => void;
}) {
  const setClientStatus = useResellerStore((s) => s.setClientStatus);
  const rechargeClient = useResellerStore((s) => s.rechargeClient);
  const submitting = useResellerStore((s) => s.submitting);
  const error = useResellerStore((s) => s.error);
  const plans = useResellerStore((s) => s.plans);
  const stats = useResellerStore((s) => s.stats);

  const [recharged, setRecharged] = useState<string | null>(null);
  const [period, setPeriod] = useState<RechargePeriod>("monthly");

  const suspended = client.license_status === "suspended";
  const plan = plans.find((p) => p.id === client.plan_id);
  // El plan gratis no se gestiona: la regla es el precio, no el id.
  const chargeable = Boolean(plan && plan.price > 0);
  const balance = stats?.balances?.[client.plan_id] ?? 0;

  /** Modalidades que el plan ofrece, con su costo en créditos. */
  const options = useMemo(() => {
    if (!plan) return [];
    const list: { period: RechargePeriod; label: string; detail: string; cost: number }[] = [
      { period: "monthly", label: "Mensual", detail: "+1 mes", cost: 1 },
    ];
    if (hasAnnual(plan)) {
      list.push({
        period: "annual",
        label: "Anual",
        detail: `+12 meses · ${annualFreeMonths(plan)} de regalo`,
        cost: plan.annual_charged_months,
      });
    }
    return list;
  }, [plan]);

  const selected = options.find((o) => o.period === period) ?? options[0];
  const affordable = Boolean(selected && balance >= selected.cost);

  const handleToggle = async () => {
    const ok = await setClientStatus(client.user_id, suspended ? "reactivate" : "suspend");
    if (ok) onClose();
  };

  const handleRecharge = async () => {
    if (!selected || !affordable) return;
    const periodEnd = await rechargeClient(client.user_id, selected.period);
    if (periodEnd) setRecharged(periodEnd);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Gestionar cliente</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {client.business_name || client.full_name || client.email}
          </p>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          {recharged && (
            <div className="rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 px-4 py-3 text-sm text-[#10b981]">
              Recarga aplicada. La licencia vence el{" "}
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

          {/* Recargar: solo para planes de pago (el gratis no se gestiona). */}
          {chargeable && (
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-bold text-on-surface">Recargar licencia</h3>
                <span className="text-xs text-on-surface-variant">
                  Saldo {plan?.name}: <strong className="text-on-surface">{balance}</strong>{" "}
                  crédito{balance === 1 ? "" : "s"}
                </span>
              </div>

              <label className="block text-xs font-semibold text-on-surface-variant mb-2">
                Modalidad
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as RechargePeriod)}
                  className="flex-1 px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
                >
                  {options.map((o) => (
                    <option key={o.period} value={o.period} disabled={balance < o.cost}>
                      {o.label} — {o.detail} · {o.cost} crédito{o.cost === 1 ? "" : "s"}
                      {balance < o.cost ? " (saldo insuficiente)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleRecharge}
                  disabled={submitting || !affordable}
                  className="py-3 px-5 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {submitting ? "Recargando…" : "Recargar"}
                </button>
              </div>

              {selected && !affordable && (
                <p className="text-xs text-error-dim mt-2">
                  No tienes créditos suficientes para esta modalidad ({selected.cost}{" "}
                  crédito{selected.cost === 1 ? "" : "s"}). Solicita una recarga al
                  administrador.
                </p>
              )}

              <p className="text-xs text-on-surface-variant mt-3">
                Si la licencia sigue vigente, los meses se suman a la fecha de
                vencimiento actual. Si ya venció, cuentan desde hoy.
              </p>
            </section>
          )}

          <section className="pt-1 border-t border-outline-variant/10">
            <h3 className="text-sm font-bold text-on-surface mb-2 pt-4">
              {suspended ? "Reactivar acceso" : "Suspender acceso"}
            </h3>
            <p className="text-sm text-on-surface-variant">
              {suspended
                ? "La licencia está suspendida: el cliente no puede acceder. Al reactivarla, si su mes sigue vigente vuelve a entrar de inmediato; si venció, su próximo login intentará renovar con tus créditos."
                : "Suspender bloquea el acceso del cliente de inmediato (por ejemplo, si dejó de pagarte). Podrás reactivarlo cuando quieras."}
            </p>
          </section>
        </div>

        <div className="p-6 pt-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={handleToggle}
            disabled={submitting}
            className={`py-2.5 px-5 rounded-xl text-sm font-bold shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              suspended
                ? "bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] shadow-[#6063ee]/20"
                : "bg-error text-white hover:bg-error-dim shadow-error/20"
            }`}
          >
            {submitting ? "Guardando…" : suspended ? "Reactivar" : "Suspender"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-on-surface mb-2">{label}</label>
      {children}
    </div>
  );
}

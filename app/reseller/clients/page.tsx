"use client";

import { useEffect, useMemo, useState } from "react";
import { useResellerStore } from "@/stores/reseller.store";
import type { ResellerClient } from "@/services/reseller.service";
import { LICENSE_STATUS_LABELS, licenseAccent } from "@/config/plans";
import { BUSINESS_OPTIONS } from "@/config/business";
import { backdropProps } from "@/components/modal";
import { Select } from "@/components/ui/Select";

export default function ResellerClientsPage() {
  const clients = useResellerStore((s) => s.clients);
  const stats = useResellerStore((s) => s.stats);
  const plans = useResellerStore((s) => s.plans);
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

  /** Saldos con el nombre del plan, no su id ("Básica: 38", no "basica 38"). */
  const balancesLabel = useMemo(() => {
    const entries = Object.entries(stats?.balances ?? {});
    if (entries.length === 0) return "sin saldo";
    return entries
      .map(([id, bal]) => `${plans.find((p) => p.id === id)?.name ?? id}: ${bal}`)
      .join(" · ");
  }, [stats, plans]);

  return (
    <div className="w-full max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Mis clientes</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {clients.length} cliente{clients.length === 1 ? "" : "s"}
            {stats ? ` · créditos: ${balancesLabel}` : ""}
          </p>
        </div>
        {/* Móvil: buscador a ancho completo y el botón debajo; en fila desde sm. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
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

      {/* Móvil: tarjetas. En la tabla, el botón "Gestionar" quedaba fuera de pantalla. */}
      <div className="lg:hidden space-y-3">
        {loading && clients.length === 0 ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Cargando clientes…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">
            {clients.length === 0
              ? "Aún no tienes clientes. Crea el primero con “Nuevo cliente”."
              : "No hay clientes que coincidan."}
          </p>
        ) : (
          filtered.map((c) => {
            const accent = licenseAccent(c.license_status);
            return (
              <div
                key={c.user_id}
                className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface truncate">
                      {c.business_name || c.full_name || "Sin nombre"}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate">{c.email}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}
                  >
                    {LICENSE_STATUS_LABELS[c.license_status] ?? c.license_status}
                  </span>
                </div>

                <p className="text-xs text-on-surface-variant mt-3">
                  Plan <strong className="text-on-surface">{c.plan_name ?? c.plan_id}</strong> ·
                  Vence{" "}
                  <strong className="text-on-surface tabular-nums">
                    {c.period_end
                      ? new Date(c.period_end).toLocaleDateString("es-CO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </strong>
                </p>

                <button
                  onClick={() => setManaging(c)}
                  className="mt-4 w-full h-10 rounded-xl bg-[#6063ee] text-white text-sm font-bold hover:bg-[#c0c1ff] hover:text-[#0b0664] transition-colors"
                >
                  Gestionar
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden lg:block bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm overflow-hidden">
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

  // Solo planes de pago activos: los créditos son por plan y el gratis no
  // consume ninguno. La regla es el precio, no el id.
  const creditPlans = plans.filter((p) => p.is_active && p.price > 0);
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
      {...backdropProps(onClose)}
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
              <Select
                aria-label="Tipo de negocio"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as typeof businessType)}
              >
                {BUSINESS_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Plan (consume 1 crédito de ese plan al primer login)">
              <Select
                aria-label="Plan del cliente"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                {creditPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {balanceOf(p.id)} crédito{balanceOf(p.id) === 1 ? "" : "s"}
                  </option>
                ))}
              </Select>
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
  const periods = useResellerStore((s) => s.periods);
  const stats = useResellerStore((s) => s.stats);

  const [recharged, setRecharged] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState("");

  const suspended = client.license_status === "suspended";
  const plan = plans.find((p) => p.id === client.plan_id);
  // El plan gratis no se gestiona: la regla es el precio, no el id.
  const chargeable = Boolean(plan && plan.price > 0);
  const balance = stats?.balances?.[client.plan_id] ?? 0;

  /** Tiempos que el super admin habilitó para el plan de este cliente. */
  const options = useMemo(
    () => periods.filter((p) => p.plan_id === client.plan_id && p.is_active),
    [periods, client.plan_id],
  );

  const selected = options.find((o) => o.id === periodId) ?? options[0];
  const affordable = Boolean(selected && balance >= selected.credits);

  const handleToggle = async () => {
    const ok = await setClientStatus(client.user_id, suspended ? "reactivate" : "suspend");
    if (ok) onClose();
  };

  const handleRecharge = async () => {
    if (!selected || !affordable) return;
    const periodEnd = await rechargeClient(client.user_id, selected.id);
    if (periodEnd) setRecharged(periodEnd);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropProps(onClose)}
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
                Tiempo
              </label>

              {options.length === 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 py-2">
                  El plan {plan?.name} no tiene tiempos disponibles. Pídele al
                  administrador que le configure al menos uno.
                </p>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select
                      aria-label="Período a recargar"
                      containerClassName="flex-1 min-w-0"
                      value={selected?.id ?? ""}
                      onChange={(e) => setPeriodId(e.target.value)}
                    >
                      {options.map((o) => (
                        <option key={o.id} value={o.id} disabled={balance < o.credits}>
                          {o.name} — {o.months} {o.months === 1 ? "mes" : "meses"} ·{" "}
                          {o.credits} crédito{o.credits === 1 ? "" : "s"}
                          {balance < o.credits ? " (saldo insuficiente)" : ""}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={handleRecharge}
                      disabled={submitting || !affordable}
                      className="py-3 px-5 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {submitting
                        ? "Recargando…"
                        : `Recargar (${selected?.credits ?? 0} crédito${selected?.credits === 1 ? "" : "s"})`}
                    </button>
                  </div>

                  {/* Costo explícito: cuántos créditos se van y con cuántos quedas. */}
                  {selected && (
                    <div
                      className={`mt-3 rounded-xl px-4 py-3 text-xs border ${
                        affordable
                          ? "bg-surface-container-low border-outline-variant/20 text-on-surface-variant"
                          : "bg-error-container/20 border-error-container/30 text-error-dim"
                      }`}
                    >
                      {affordable ? (
                        <>
                          Consume{" "}
                          <strong className="text-on-surface">
                            {selected.credits} crédito{selected.credits === 1 ? "" : "s"}
                          </strong>{" "}
                          del plan {plan?.name} y suma{" "}
                          <strong className="text-on-surface">
                            {selected.months} {selected.months === 1 ? "mes" : "meses"}
                          </strong>
                          . Saldo: <strong className="text-on-surface">{balance}</strong> →{" "}
                          <strong className="text-on-surface">{balance - selected.credits}</strong>
                        </>
                      ) : (
                        <>
                          Este tiempo cuesta {selected.credits} crédito
                          {selected.credits === 1 ? "" : "s"} y solo tienes {balance} del plan{" "}
                          {plan?.name}. Solicita una recarga al administrador.
                        </>
                      )}
                    </div>
                  )}
                </>
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

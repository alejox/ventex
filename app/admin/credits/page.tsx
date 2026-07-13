"use client";

import { useEffect, useState } from "react";
import { useAdminStore } from "@/stores/admin.store";
import type { CreditPack } from "@/services/admin.service";
import { formatMoney, planAccent } from "@/config/plans";

const REASON_LABELS: Record<string, string> = {
  grant: "Recarga",
  consume: "Consumo",
  adjust: "Ajuste",
};

export default function AdminCreditsPage() {
  const packs = useAdminStore((s) => s.packs);
  const movements = useAdminStore((s) => s.movements);
  const plans = useAdminStore((s) => s.plans);
  const loading = useAdminStore((s) => s.loading);
  const error = useAdminStore((s) => s.error);
  const fetchCreditsPanel = useAdminStore((s) => s.fetchCreditsPanel);
  const deletePack = useAdminStore((s) => s.deletePack);

  const [editing, setEditing] = useState<CreditPack | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchCreditsPanel();
  }, [fetchCreditsPanel]);

  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="w-full max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Créditos</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Promociones de recarga y movimientos de créditos de toda la plataforma.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="py-2.5 px-5 rounded-full bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors whitespace-nowrap"
        >
          + Nueva promoción
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-6">
          {error}
        </div>
      )}

      {/* ---- Promociones ---- */}
      <h2 className="text-lg font-bold text-on-surface mb-4">Promociones</h2>
      {loading && packs.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-6">Cargando promociones…</p>
      ) : packs.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-8 text-center text-sm text-on-surface-variant mb-8">
          No hay promociones. Crea la primera con “Nueva promoción” (ej: 10 créditos
          Oro + 2 de regalo).
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {packs.map((pack) => {
            const accent = planAccent(pack.plan_id);
            return (
              <div
                key={pack.id}
                className={`bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-5 shadow-sm ${
                  pack.is_active ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-on-surface">{pack.name}</p>
                    <span
                      className={`inline-block mt-1 text-xs font-bold px-2.5 py-0.5 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}
                    >
                      {planName(pack.plan_id)}
                    </span>
                  </div>
                  {!pack.is_active && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                      INACTIVA
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-on-surface mt-3 tabular-nums">
                  {pack.credits}
                  {pack.bonus_credits > 0 && (
                    <span className="text-primary"> +{pack.bonus_credits}</span>
                  )}
                  <span className="text-sm font-medium text-on-surface-variant ml-1.5">
                    crédito{pack.credits + pack.bonus_credits === 1 ? "" : "s"}
                  </span>
                </p>
                <p className="text-sm text-on-surface-variant mt-1">
                  {formatMoney(pack.price)}
                </p>
                <div className="flex gap-4 mt-4">
                  <button
                    onClick={() => setEditing(pack)}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deletePack(pack.id)}
                    className="text-sm font-semibold text-error hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Movimientos globales ---- */}
      <h2 className="text-lg font-bold text-on-surface mb-4">Últimos movimientos</h2>

      {/* Móvil: tarjetas. La tabla de 6 columnas se corta a 390px. */}
      <div className="lg:hidden space-y-3">
        {loading && movements.length === 0 ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">
            Cargando movimientos…
          </p>
        ) : movements.length === 0 ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">
            Aún no hay movimientos de créditos.
          </p>
        ) : (
          movements.map((m) => (
            <div
              key={m.id}
              className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-on-surface truncate">
                    {m.reseller_name || "Sin nombre"}
                  </p>
                  <p className="text-xs text-on-surface-variant truncate">{m.reseller_email}</p>
                </div>
                <span
                  className={`shrink-0 text-base font-bold tabular-nums ${
                    m.delta > 0 ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs text-on-surface-variant">
                <span className="text-on-surface font-medium">
                  {REASON_LABELS[m.reason] ?? m.reason}
                </span>
                <span>·</span>
                <span>{planName(m.plan_id)}</span>
                <span>·</span>
                <span className="tabular-nums">
                  {new Date(m.created_at).toLocaleDateString("es-CO", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <p className="text-xs text-on-surface-variant mt-1.5">
                {m.reason === "consume" && m.client_name
                  ? `${m.client_name}${m.note ? ` · ${m.note}` : ""}`
                  : m.note || "—"}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="hidden lg:block bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/10 text-left text-on-surface-variant">
                <th className="font-semibold px-5 py-4">Fecha</th>
                <th className="font-semibold px-5 py-4">Revendedor</th>
                <th className="font-semibold px-5 py-4">Tipo</th>
                <th className="font-semibold px-5 py-4">Plan</th>
                <th className="font-semibold px-5 py-4">Detalle</th>
                <th className="font-semibold px-5 py-4 text-right">Créditos</th>
              </tr>
            </thead>
            <tbody>
              {loading && movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
                    Cargando movimientos…
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
                    Aún no hay movimientos de créditos.
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-outline-variant/5 last:border-0 hover:bg-surface-container-low/50"
                  >
                    <td className="px-5 py-3.5 text-on-surface-variant whitespace-nowrap tabular-nums">
                      {new Date(m.created_at).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-on-surface block">
                        {m.reseller_name || "Sin nombre"}
                      </span>
                      <span className="text-xs text-on-surface-variant">{m.reseller_email}</span>
                    </td>
                    <td className="px-5 py-3.5 text-on-surface">
                      {REASON_LABELS[m.reason] ?? m.reason}
                    </td>
                    <td className="px-5 py-3.5 text-on-surface">{planName(m.plan_id)}</td>
                    <td className="px-5 py-3.5 text-on-surface-variant max-w-[240px] truncate">
                      {m.reason === "consume" && m.client_name
                        ? `${m.client_name}${m.note ? ` · ${m.note}` : ""}`
                        : m.note || "—"}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-bold tabular-nums ${
                        m.delta > 0 ? "text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <PackModal
          pack={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PackModal({ pack, onClose }: { pack: CreditPack | null; onClose: () => void }) {
  const savePack = useAdminStore((s) => s.savePack);
  const submitting = useAdminStore((s) => s.submitting);
  const error = useAdminStore((s) => s.error);
  const plans = useAdminStore((s) => s.plans);

  const grantablePlans = plans.filter((p) => p.is_active && p.id !== "gratis");

  const [name, setName] = useState(pack?.name ?? "");
  const [planId, setPlanId] = useState(pack?.plan_id ?? grantablePlans[0]?.id ?? "");
  const [credits, setCredits] = useState(pack?.credits ?? 10);
  const [bonus, setBonus] = useState(pack?.bonus_credits ?? 0);
  const [price, setPrice] = useState(pack?.price ?? 0);
  const [isActive, setIsActive] = useState(pack?.is_active ?? true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await savePack(pack?.id ?? null, {
      name,
      plan_id: planId,
      credits,
      bonus_credits: bonus,
      price,
      is_active: isActive,
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
          <h2 className="text-lg font-bold text-on-surface">
            {pack ? "Editar promoción" : "Nueva promoción"}
          </h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Un pack de recarga con créditos de regalo opcionales y precio de
            referencia (el cobro es por fuera).
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-on-surface mb-2">Nombre</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Pack 10+2 Oro"
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow placeholder:text-on-surface-variant/50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-on-surface mb-2">Plan</label>
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
              >
                {grantablePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-2">
                  Créditos
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={credits}
                  onChange={(e) => setCredits(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow tabular-nums"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-2">
                  De regalo
                </label>
                <input
                  type="number"
                  min={0}
                  value={bonus}
                  onChange={(e) => setBonus(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-on-surface mb-2">
                Precio de referencia
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow tabular-nums"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-[#6063ee]"
              />
              <span className="text-sm font-medium text-on-surface">Promoción activa</span>
            </label>
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
              disabled={submitting}
              className="py-2.5 px-5 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

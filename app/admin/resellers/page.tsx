"use client";

import { useEffect, useState } from "react";
import { useAdminStore } from "@/stores/admin.store";
import type { AdminReseller } from "@/services/admin.service";
import { planAccent } from "@/config/plans";

export default function AdminResellersPage() {
  const resellers = useAdminStore((s) => s.resellers);
  const plans = useAdminStore((s) => s.plans);
  const loading = useAdminStore((s) => s.loading);
  const error = useAdminStore((s) => s.error);
  const fetchResellers = useAdminStore((s) => s.fetchResellers);

  const [promoting, setPromoting] = useState(false);
  const [granting, setGranting] = useState<AdminReseller | null>(null);

  useEffect(() => {
    fetchResellers();
  }, [fetchResellers]);

  return (
    <div className="w-full max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Revendedores</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Otorga créditos (1 crédito = 1 mes de licencia de un cliente).
          </p>
        </div>
        <button
          onClick={() => setPromoting(true)}
          className="py-2.5 px-5 rounded-full bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors whitespace-nowrap"
        >
          + Nuevo revendedor
        </button>
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
                <th className="font-semibold px-5 py-4">Revendedor</th>
                <th className="font-semibold px-5 py-4 text-right">Créditos</th>
                <th className="font-semibold px-5 py-4 text-right">Clientes</th>
                <th className="font-semibold px-5 py-4 text-right">Activos</th>
                <th className="font-semibold px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading && resellers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">
                    Cargando revendedores…
                  </td>
                </tr>
              ) : resellers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">
                    No hay revendedores. Promueve una cuenta existente con “Nuevo revendedor”.
                  </td>
                </tr>
              ) : (
                resellers.map((r) => (
                  <tr
                    key={r.user_id}
                    className="border-b border-outline-variant/5 last:border-0 hover:bg-surface-container-low/50"
                  >
                    <td className="px-5 py-4">
                      <span className="font-semibold text-on-surface block">
                        {r.business_name || r.full_name || "Sin nombre"}
                      </span>
                      <span className="text-xs text-on-surface-variant">{r.email}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {plans.filter((p) => p.is_active && p.id !== "gratis").map((p) => {
                          const accent = planAccent(p.id);
                          const bal = r.balances?.[p.id] ?? 0;
                          return (
                            <span
                              key={p.id}
                              title={p.name}
                              className={`text-xs font-bold tabular-nums px-2.5 py-1 rounded-full ring-1 whitespace-nowrap ${
                                bal > 0
                                  ? `${accent.bg} ${accent.text} ${accent.ring}`
                                  : "bg-surface-container-high text-on-surface-variant ring-outline-variant/30"
                              }`}
                            >
                              {p.name}: {bal}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-on-surface">
                      {r.clients_total}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-on-surface">
                      {r.clients_active}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setGranting(r)}
                        className="text-sm font-semibold text-primary hover:underline whitespace-nowrap"
                      >
                        Otorgar créditos
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {promoting && <PromoteResellerModal onClose={() => setPromoting(false)} />}
      {granting && <GrantCreditsModal reseller={granting} onClose={() => setGranting(null)} />}
    </div>
  );
}

function PromoteResellerModal({ onClose }: { onClose: () => void }) {
  const promoteReseller = useAdminStore((s) => s.promoteReseller);
  const submitting = useAdminStore((s) => s.submitting);
  const error = useAdminStore((s) => s.error);

  const [email, setEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await promoteReseller(email);
    if (ok) onClose();
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
          <h2 className="text-lg font-bold text-on-surface">Nuevo revendedor</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Promueve una cuenta ya registrada en la plataforma. Si la persona aún no
            tiene cuenta, pídele que se registre primero.
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
              <label className="block text-sm font-semibold text-on-surface mb-2">
                Email de la cuenta
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="revendedor@correo.com"
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow placeholder:text-on-surface-variant/50"
              />
            </div>
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
              {submitting ? "Guardando…" : "Promover"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GrantCreditsModal({
  reseller,
  onClose,
}: {
  reseller: AdminReseller;
  onClose: () => void;
}) {
  const grantCredits = useAdminStore((s) => s.grantCredits);
  const applyPack = useAdminStore((s) => s.applyPack);
  const submitting = useAdminStore((s) => s.submitting);
  const error = useAdminStore((s) => s.error);
  const plans = useAdminStore((s) => s.plans);
  const packs = useAdminStore((s) => s.packs);

  const grantablePlans = plans.filter((p) => p.is_active && p.id !== "gratis");
  const activePacks = packs.filter((p) => p.is_active);
  const [planId, setPlanId] = useState(grantablePlans[0]?.id ?? "");
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState("");
  /** "" = recarga manual; un id = aplicar esa promoción. */
  const [packId, setPackId] = useState("");

  const currentBalance = reseller.balances?.[planId] ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (packId) {
      const ok = await applyPack(reseller.user_id, packId);
      if (ok) onClose();
      return;
    }
    if (!amount || !planId) return;
    const ok = await grantCredits(reseller.user_id, planId, amount, note);
    if (ok) onClose();
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
          <h2 className="text-lg font-bold text-on-surface">Recargar créditos</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {reseller.business_name || reseller.full_name || reseller.email} · saldo
            del plan seleccionado: <strong>{currentBalance}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                {error}
              </div>
            )}
            {activePacks.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-2">
                  Promoción
                </label>
                <select
                  value={packId}
                  onChange={(e) => setPackId(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
                >
                  <option value="">Sin promoción (recarga manual)</option>
                  {activePacks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.credits}
                      {p.bonus_credits > 0 ? ` +${p.bonus_credits}` : ""} créditos
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!packId && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-2">Plan</label>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
                  >
                    {grantablePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (saldo: {reseller.balances?.[p.id] ?? 0})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-2">
                    Cantidad (negativa para corregir)
                  </label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-2">
                    Nota (opcional)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ej: pago transferencia 13 jul"
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow placeholder:text-on-surface-variant/50"
                  />
                </div>
              </>
            )}
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
              disabled={submitting || (!packId && amount === 0)}
              className="py-2.5 px-5 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando…" : packId ? "Aplicar promoción" : "Recargar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

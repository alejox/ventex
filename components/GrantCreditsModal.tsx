"use client";

import { useState } from "react";
import { useAdminStore } from "@/stores/admin.store";
import type { AdminReseller } from "@/services/admin.service";

/**
 * Modal de recarga de créditos a un revendedor (solo panel super admin).
 * Permite recarga manual por plan o aplicar una promoción (credit_packs).
 * Compartido entre /admin/resellers y /admin/companies.
 */
export function GrantCreditsModal({
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

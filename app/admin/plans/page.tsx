"use client";

import { useEffect, useState } from "react";
import { useAdminStore } from "@/stores/admin.store";
import type { Plan } from "@/services/subscription.service";
import { formatMoney, planAccent } from "@/config/plans";

export default function AdminPlansPage() {
  const plans = useAdminStore((s) => s.plans);
  const loading = useAdminStore((s) => s.loading);
  const error = useAdminStore((s) => s.error);
  const fetchPlans = useAdminStore((s) => s.fetchPlans);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Planes</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Parametriza los límites de cada plan. Los cambios aplican de inmediato a todas las empresas.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-6">
          {error}
        </div>
      )}

      {loading && plans.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">Cargando planes…</p>
      ) : (
        <div className="space-y-4">
          {plans.map((p) => (
            <PlanEditor key={p.id} plan={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanEditor({ plan }: { plan: Plan }) {
  const updatePlan = useAdminStore((s) => s.updatePlan);
  const submitting = useAdminStore((s) => s.submitting);
  const accent = planAccent(plan.id);

  const [name, setName] = useState(plan.name);
  const [maxCollaborators, setMaxCollaborators] = useState(String(plan.max_collaborators));
  const [unlimited, setUnlimited] = useState(plan.max_monthly_sales == null);
  const [maxSales, setMaxSales] = useState(
    plan.max_monthly_sales == null ? "" : String(plan.max_monthly_sales),
  );
  const [price, setPrice] = useState(String(plan.price));
  const [priceYearly, setPriceYearly] = useState(String(plan.price_yearly));
  const [discount, setDiscount] = useState(String(plan.discount_percent));
  const [saved, setSaved] = useState(false);

  const markDirty = () => setSaved(false);

  // Vista previa del precio efectivo con el descuento aplicado.
  const discountNum = Math.min(100, Math.max(0, parseFloat(discount) || 0));
  const effective = (v: string) => {
    const n = Math.max(0, parseFloat(v) || 0);
    return n > 0 && discountNum > 0 ? n * (1 - discountNum / 100) : null;
  };

  const handleSave = async () => {
    setSaved(false);
    const ok = await updatePlan(plan.id, {
      name: name.trim() || plan.name,
      max_collaborators: Math.max(0, parseInt(maxCollaborators, 10) || 0),
      max_monthly_sales: unlimited ? null : Math.max(0, parseFloat(maxSales) || 0),
      price: Math.max(0, parseFloat(price) || 0),
      price_yearly: Math.max(0, parseFloat(priceYearly) || 0),
      discount_percent: discountNum,
    });
    if (ok) setSaved(true);
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}>
          {plan.id}
        </span>
        <span className="text-sm text-on-surface-variant">ID del plan</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Nombre">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
            className={inputCls}
          />
        </Field>

        <Field label="Precio / mes">
          <div className="space-y-1">
            <input
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                markDirty();
              }}
              className={inputCls}
            />
            {effective(price) != null && (
              <p className="text-xs text-on-surface-variant">
                Con descuento: <span className="font-semibold text-primary">{formatMoney(effective(price)!)}</span>
              </p>
            )}
          </div>
        </Field>

        <Field label="Precio / año (0 = no se ofrece)">
          <div className="space-y-1">
            <input
              type="number"
              min="0"
              step="1"
              value={priceYearly}
              onChange={(e) => {
                setPriceYearly(e.target.value);
                markDirty();
              }}
              className={inputCls}
            />
            {effective(priceYearly) != null && (
              <p className="text-xs text-on-surface-variant">
                Con descuento: <span className="font-semibold text-primary">{formatMoney(effective(priceYearly)!)}</span>
              </p>
            )}
          </div>
        </Field>

        <Field label="Descuento (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={discount}
            onChange={(e) => {
              setDiscount(e.target.value);
              markDirty();
            }}
            className={inputCls}
          />
        </Field>

        <Field label="Máx. colaboradores">
          <input
            type="number"
            min="0"
            step="1"
            value={maxCollaborators}
            onChange={(e) => {
              setMaxCollaborators(e.target.value);
              markDirty();
            }}
            className={inputCls}
          />
        </Field>

        <Field label="Máx. ventas / mes">
          <div className="space-y-2">
            <input
              type="number"
              min="0"
              step="1"
              value={maxSales}
              disabled={unlimited}
              onChange={(e) => {
                setMaxSales(e.target.value);
                markDirty();
              }}
              placeholder={unlimited ? "Ilimitado" : "0"}
              className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}
            />
            <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
              <input
                type="checkbox"
                checked={unlimited}
                onChange={(e) => {
                  setUnlimited(e.target.checked);
                  markDirty();
                }}
                className="rounded border-outline-variant/40 text-primary focus:ring-primary/50"
              />
              Ilimitado
            </label>
          </div>
        </Field>
      </div>

      <div className="flex items-center justify-between gap-4 pt-5 mt-5 border-t border-outline-variant/10">
        <span className={`text-sm font-medium text-[#10b981] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          ✓ Guardado
        </span>
        <button
          onClick={handleSave}
          disabled={submitting}
          className="py-2.5 px-5 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-on-surface mb-2">{label}</label>
      {children}
    </div>
  );
}

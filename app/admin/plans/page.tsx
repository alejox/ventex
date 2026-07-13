"use client";

import { useEffect, useState } from "react";
import { useAdminStore } from "@/stores/admin.store";
import type { Plan } from "@/services/subscription.service";
import type { PlanSaveInput } from "@/services/admin.service";
import { annualFreeMonths, annualPrice, formatMoney, hasAnnual, planAccent } from "@/config/plans";

export default function AdminPlansPage() {
  const plans = useAdminStore((s) => s.plans);
  const loading = useAdminStore((s) => s.loading);
  const error = useAdminStore((s) => s.error);
  const fetchPlans = useAdminStore((s) => s.fetchPlans);

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Planes</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Crea y parametriza los planes. Los activos se publican en la web y los
            cambios aplican de inmediato a todas las empresas.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="py-2.5 px-5 rounded-full bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors whitespace-nowrap"
        >
          + Nuevo plan
        </button>
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

      {creating && <NewPlanModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function PlanEditor({ plan }: { plan: Plan }) {
  const savePlan = useAdminStore((s) => s.savePlan);
  const submitting = useAdminStore((s) => s.submitting);
  const accent = planAccent(plan.id);

  const [name, setName] = useState(plan.name);
  const [maxCollaborators, setMaxCollaborators] = useState(String(plan.max_collaborators));
  const [unlimited, setUnlimited] = useState(plan.max_monthly_sales == null);
  const [maxSales, setMaxSales] = useState(
    plan.max_monthly_sales == null ? "" : String(plan.max_monthly_sales),
  );
  const [price, setPrice] = useState(String(plan.price));
  const [annualMonths, setAnnualMonths] = useState(String(plan.annual_charged_months));
  const [isActive, setIsActive] = useState(plan.is_active);
  const [saved, setSaved] = useState(false);

  const markDirty = () => setSaved(false);

  // Previsualización en vivo del anual con los valores del formulario.
  const preview = {
    price: Math.max(0, parseFloat(price) || 0),
    annual_charged_months: clampMonths(annualMonths),
  };

  const handleSave = async () => {
    setSaved(false);
    const ok = await savePlan(plan.id, {
      name: name.trim() || plan.name,
      max_collaborators: Math.max(0, parseInt(maxCollaborators, 10) || 0),
      max_monthly_sales: unlimited ? null : Math.max(0, parseFloat(maxSales) || 0),
      price: preview.price,
      annual_charged_months: preview.annual_charged_months,
      sort_order: plan.sort_order,
      is_active: isActive,
    });
    if (ok) setSaved(true);
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}>
          {plan.id}
        </span>
        <span className="text-sm text-on-surface-variant">ID del plan</span>
        <label className="ml-auto flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => {
              setIsActive(e.target.checked);
              markDirty();
            }}
            className="rounded border-outline-variant/40 text-primary focus:ring-primary/50"
          />
          Publicado en la web
        </label>
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

        <div className="sm:col-span-2">
          <AnnualField
            value={annualMonths}
            onChange={(v) => {
              setAnnualMonths(v);
              markDirty();
            }}
            plan={preview}
          />
        </div>
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

function NewPlanModal({ onClose }: { onClose: () => void }) {
  const savePlan = useAdminStore((s) => s.savePlan);
  const plans = useAdminStore((s) => s.plans);
  const submitting = useAdminStore((s) => s.submitting);
  const error = useAdminStore((s) => s.error);

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("29000");
  const [maxCollaborators, setMaxCollaborators] = useState("1");
  const [unlimited, setUnlimited] = useState(false);
  const [maxSales, setMaxSales] = useState("");
  const [annualMonths, setAnnualMonths] = useState("10");

  const slug = slugify(id);
  const taken = plans.some((p) => p.id === slug);

  const preview = {
    price: Math.max(0, parseFloat(price) || 0),
    annual_charged_months: clampMonths(annualMonths),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: PlanSaveInput = {
      name: name.trim(),
      max_collaborators: Math.max(0, parseInt(maxCollaborators, 10) || 0),
      max_monthly_sales: unlimited ? null : Math.max(0, parseFloat(maxSales) || 0),
      price: preview.price,
      annual_charged_months: preview.annual_charged_months,
      sort_order: plans.length,
      is_active: true,
    };
    const ok = await savePlan(slug, input);
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
          <h2 className="text-lg font-bold text-on-surface">Nuevo plan</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Se publica en la web y queda disponible para asignar y recargar.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                {error}
              </div>
            )}

            <Field label="Identificador (no se puede cambiar después)">
              <input
                type="text"
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="premium"
                className={inputCls}
              />
              {slug && (
                <p className={`text-xs mt-1.5 ${taken ? "text-error-dim" : "text-on-surface-variant"}`}>
                  {taken ? `Ya existe un plan con el id “${slug}”.` : `Se guardará como “${slug}”.`}
                </p>
              )}
            </Field>

            <Field label="Nombre">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Premium"
                className={inputCls}
              />
            </Field>

            <Field label="Precio / mes">
              <input
                type="number"
                min="0"
                step="1"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Máx. colaboradores">
              <input
                type="number"
                min="0"
                step="1"
                value={maxCollaborators}
                onChange={(e) => setMaxCollaborators(e.target.value)}
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
                  onChange={(e) => setMaxSales(e.target.value)}
                  placeholder={unlimited ? "Ilimitado" : "0"}
                  className={`${inputCls} disabled:opacity-40 disabled:cursor-not-allowed`}
                />
                <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unlimited}
                    onChange={(e) => setUnlimited(e.target.checked)}
                    className="rounded border-outline-variant/40 text-primary focus:ring-primary/50"
                  />
                  Ilimitado
                </label>
              </div>
            </Field>

            <AnnualField value={annualMonths} onChange={setAnnualMonths} plan={preview} />
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
              disabled={submitting || taken || !slug}
              className="py-2.5 px-5 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creando…" : "Crear plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Campo de la modalidad anual. El precio del año no se captura: se deriva del
 * mensual x los meses cobrados, y se muestra en vivo para no dejar dudas.
 */
function AnnualField({
  value,
  onChange,
  plan,
}: {
  value: string;
  onChange: (v: string) => void;
  plan: { price: number; annual_charged_months: number };
}) {
  const offered = hasAnnual(plan);

  return (
    <Field label="Modalidad anual — meses que se cobran de los 12">
      <input
        type="number"
        min="0"
        max="12"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
      <p className="text-xs text-on-surface-variant mt-1.5">
        {plan.price <= 0 ? (
          "Los planes gratuitos no tienen modalidad anual."
        ) : offered ? (
          <>
            Año completo:{" "}
            <strong className="text-on-surface">{formatMoney(annualPrice(plan))}</strong> ·{" "}
            {plan.annual_charged_months} meses cobrados,{" "}
            <strong className="text-primary">{annualFreeMonths(plan)} de regalo</strong>.
          </>
        ) : (
          "0 = este plan no ofrece modalidad anual."
        )}
      </p>
    </Field>
  );
}

/** Acota a [0, 12]: 0 = sin anual, 12 = anual sin descuento. */
function clampMonths(value: string): number {
  return Math.min(12, Math.max(0, parseInt(value, 10) || 0));
}

/** Slug del id: minúsculas, sin espacios ni caracteres especiales. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/g, "");
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

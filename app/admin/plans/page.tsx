"use client";

import { useEffect, useState } from "react";
import { useAdminStore } from "@/stores/admin.store";
import type { Plan, PlanPeriod } from "@/services/subscription.service";
import type { PlanSaveInput } from "@/services/admin.service";
import { formatMoney, planAccent } from "@/config/plans";
import { backdropProps } from "@/components/modal";

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
  const [isActive, setIsActive] = useState(plan.is_active);
  const [saved, setSaved] = useState(false);

  const markDirty = () => setSaved(false);

  const handleSave = async () => {
    setSaved(false);
    const ok = await savePlan(plan.id, {
      name: name.trim() || plan.name,
      max_collaborators: Math.max(0, parseInt(maxCollaborators, 10) || 0),
      max_monthly_sales: unlimited ? null : Math.max(0, parseFloat(maxSales) || 0),
      price: Math.max(0, parseFloat(price) || 0),
      // Columna heredada: las duraciones viven ahora en los tiempos del plan.
      annual_charged_months: plan.annual_charged_months,
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
          </div>
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

      {/* Los tiempos se guardan por separado (cada uno es su propia fila). */}
      {plan.price > 0 && <PlanPeriods planId={plan.id} />}
    </div>
  );
}

/**
 * Tiempos vendibles del plan: mensual, trimestral, semestral, anual… Cada uno
 * define cuántos meses ENTREGA (pueden incluir los de regalo), su precio y
 * cuántos créditos le cuesta al revendedor recargarlo.
 */
function PlanPeriods({ planId }: { planId: string }) {
  const periods = useAdminStore((s) => s.periods);
  const deletePlanPeriod = useAdminStore((s) => s.deletePlanPeriod);
  const submitting = useAdminStore((s) => s.submitting);

  const [editing, setEditing] = useState<PlanPeriod | null>(null);
  const [creating, setCreating] = useState(false);

  const mine = periods.filter((p) => p.plan_id === planId);

  return (
    <div className="pt-5 mt-5 border-t border-outline-variant/10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-on-surface">Tiempos de este plan</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Lo que el cliente puede comprar y el revendedor recargar.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="py-2 px-4 rounded-xl border border-outline-variant/20 text-sm font-semibold text-on-surface hover:bg-surface-container-high transition-colors whitespace-nowrap"
        >
          + Nueva modalidad
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="text-xs text-on-surface-variant py-3">
          Este plan aún no tiene tiempos: agrégale al menos uno (por ejemplo,
          mensual) para poder venderlo o recargarlo.
        </p>
      ) : (
        <div className="space-y-2">
          {mine.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-outline-variant/15 bg-surface-container-low px-4 py-3"
            >
              <span className="font-semibold text-on-surface text-sm">{p.name}</span>
              {!p.is_active && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                  OCULTO
                </span>
              )}
              <span className="text-xs text-on-surface-variant tabular-nums">
                {p.months} {p.months === 1 ? "mes" : "meses"} ·{" "}
                <strong className="text-on-surface">{formatMoney(p.price)}</strong> ·{" "}
                {p.credits} crédito{p.credits === 1 ? "" : "s"}
              </span>
              <div className="ml-auto flex gap-3">
                <button
                  onClick={() => setEditing(p)}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => deletePlanPeriod(p.id)}
                  disabled={submitting}
                  className="text-xs font-semibold text-error hover:underline disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <PeriodModal
          planId={planId}
          period={editing}
          nextSort={mine.length + 1}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PeriodModal({
  planId,
  period,
  nextSort,
  onClose,
}: {
  planId: string;
  period: PlanPeriod | null;
  nextSort: number;
  onClose: () => void;
}) {
  const savePlanPeriod = useAdminStore((s) => s.savePlanPeriod);
  const submitting = useAdminStore((s) => s.submitting);
  const error = useAdminStore((s) => s.error);

  const [name, setName] = useState(period?.name ?? "");
  const [months, setMonths] = useState(String(period?.months ?? 3));
  const [price, setPrice] = useState(String(period?.price ?? 0));
  const [credits, setCredits] = useState(String(period?.credits ?? 3));
  const [isActive, setIsActive] = useState(period?.is_active ?? true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await savePlanPeriod(period?.id ?? null, {
      plan_id: planId,
      name: name.trim() || `${months} meses`,
      months: clampMonths(months),
      price: Math.max(0, parseFloat(price) || 0),
      credits: clampMonths(credits),
      is_active: isActive,
      sort_order: period?.sort_order ?? nextSort,
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
          <h2 className="text-lg font-bold text-on-surface">
            {period ? "Editar tiempo" : "Nueva modalidad"}
          </h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Ej: “Semestral”, que cobra $170.000 y entrega 7 meses (uno de regalo).
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                {error}
              </div>
            )}

            <Field label="Nombre">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Trimestral"
                className={inputCls}
              />
            </Field>

            <Field label="Meses que entrega (incluye los de regalo)">
              <input
                type="number"
                min="1"
                max="60"
                required
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Precio total del periodo">
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

            <Field label="Créditos que le cuesta al revendedor">
              <input
                type="number"
                min="1"
                max="60"
                required
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className={inputCls}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-outline-variant/40 text-primary focus:ring-primary/50"
              />
              Disponible para comprar y recargar
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

function NewPlanModal({ onClose }: { onClose: () => void }) {
  const savePlan = useAdminStore((s) => s.savePlan);
  const savePlanPeriod = useAdminStore((s) => s.savePlanPeriod);
  const plans = useAdminStore((s) => s.plans);
  const submitting = useAdminStore((s) => s.submitting);
  const error = useAdminStore((s) => s.error);

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("29000");
  const [maxCollaborators, setMaxCollaborators] = useState("1");
  const [unlimited, setUnlimited] = useState(false);
  const [maxSales, setMaxSales] = useState("");

  const slug = slugify(id);
  const taken = plans.some((p) => p.id === slug);
  const monthlyPrice = Math.max(0, parseFloat(price) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: PlanSaveInput = {
      name: name.trim(),
      max_collaborators: Math.max(0, parseInt(maxCollaborators, 10) || 0),
      max_monthly_sales: unlimited ? null : Math.max(0, parseFloat(maxSales) || 0),
      price: monthlyPrice,
      annual_charged_months: 0, // Heredado: las duraciones son ahora tiempos del plan.
      sort_order: plans.length,
      is_active: true,
    };
    const ok = await savePlan(slug, input);
    if (!ok) return;

    // El plan nace con su tiempo mensual: sin tiempos no se puede vender ni recargar.
    if (monthlyPrice > 0) {
      await savePlanPeriod(null, {
        plan_id: slug,
        name: "Mensual",
        months: 1,
        price: monthlyPrice,
        credits: 1,
        is_active: true,
        sort_order: 1,
      });
    }
    onClose();
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

            <p className="text-xs text-on-surface-variant">
              El plan se crea con su tiempo <strong>Mensual</strong>. Los demás
              (trimestral, semestral, anual…) se agregan luego desde la tarjeta del
              plan.
            </p>
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

/** Acota a [1, 60]: el rango que aceptan los tiempos de plan en la base. */
function clampMonths(value: string): number {
  return Math.min(60, Math.max(1, parseInt(value, 10) || 1));
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

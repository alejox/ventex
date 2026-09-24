"use client";

import { useEffect, useMemo, useState } from "react";
import { PlanForm } from "@/components/school/PlanForm";
import { formatMoney } from "@/components/school/format";
import { CollectionLoading, CollectionEmpty, CollectionError, CollectionFilteredEmpty } from "@/components/CollectionState";
import { IconCalendar, IconSearch } from "@/app/assets/icons/DashboardIcons";
import { fetchLessonPlans, fetchSellableServices, setLessonPlanStatus } from "@/services/school-enrollments.service";
import type { LessonPlan, SellableService } from "@/services/school-enrollments.service";
import { notifySuccess, notifyError } from "@/lib/notifications";

/** Planes de clase: la oferta que después se congela en cada matrícula. */
export default function PlanesPage() {
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [services, setServices] = useState<SellableService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, sellable] = await Promise.all([fetchLessonPlans(), fetchSellableServices()]);
      setPlans(rows);
      setServices(sellable);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchLessonPlans(), fetchSellableServices()])
      .then(([rows, sellable]) => {
        if (cancelled) return;
        setPlans(rows);
        setServices(sellable);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error inesperado");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const priceOf = (plan: LessonPlan): number => {
    const service = services.find((s) => s.id === plan.service_id);
    return service ? service.price * plan.lesson_count : 0;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter(
      (p) => p.name.toLowerCase().includes(q) || p.service_name.toLowerCase().includes(q),
    );
  }, [plans, query]);

  const handleArchive = async (plan: LessonPlan) => {
    if (!confirm(`Archivar el plan “${plan.name}”? Deja de ofrecerse para matrículas nuevas.\n\nLos planes se archivan, nunca se borran: las matrículas existentes conservan su historia.`)) return;
    try {
      await setLessonPlanStatus(plan.id, !plan.is_active);
      notifySuccess(plan.is_active ? "Plan archivado" : "Plan reactivado");
      void load();
    } catch (e) {
      notifyError("No se pudo cambiar el estado del plan", e instanceof Error ? e.message : "Error inesperado");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Planes de clase</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {plans.length} {plans.length === 1 ? "plan" : "planes"} · el precio se congela al matricular
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim"
        >
          Nuevo plan
        </button>
      </div>

      <div className="relative max-w-md">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar plan…"
          className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest py-2.5 pl-10 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {error && <CollectionError message={error} onRetry={() => void load()} />}

      {loading && plans.length === 0 ? (
        <CollectionLoading label="Cargando planes…" />
      ) : plans.length === 0 ? (
        <CollectionEmpty
          icon={<IconCalendar className="h-7 w-7" />}
          title="Todavía no hay planes"
          description="Un plan es un servicio del catálogo con su cantidad de clases: Guitarra x4, Canto individual, etc."
          action={{ label: "Nuevo plan", onClick: () => setShowForm(true) }}
        />
      ) : filtered.length === 0 ? (
        <CollectionFilteredEmpty title="Sin coincidencias" description={`Ningún plan coincide con “${query}”.`} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const price = priceOf(p);
            return (
              <div key={p.id} className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-on-surface">{p.name}</p>
                    <p className="mt-0.5 truncate text-sm text-on-surface-variant">{p.service_name}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    p.is_active
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-surface-container text-on-surface-variant"
                  }`}>
                    {p.is_active ? "Activo" : "Archivado"}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-on-surface-variant">Clases</dt>
                  <dd className="text-right font-semibold text-on-surface">{p.lesson_count} × {p.duration_minutes} min</dd>
                  <dt className="text-on-surface-variant">Vigencia</dt>
                  <dd className="text-right font-semibold text-on-surface">{p.validity_days} días</dd>
                  <dt className="text-on-surface-variant">Precio total</dt>
                  <dd className="text-right font-bold text-primary">{price > 0 ? formatMoney(price) : "—"}</dd>
                  <dt className="text-on-surface-variant">Grupo</dt>
                  <dd className="text-right font-semibold text-on-surface">{p.max_group_size} {p.max_group_size === 1 ? "alumno" : "alumnos"}</dd>
                </dl>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => handleArchive(p)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                  >
                    {p.is_active ? "Archivar" : "Reactivar"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(p.id);
                      setShowForm(true);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                  >
                    Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <PlanForm
          plan={plans.find((p) => p.id === editingId) ?? null}
          onClose={() => {
            setShowForm(false);
            setEditingId(null);
          }}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
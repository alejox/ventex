"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/Select";
import { SchoolModal } from "@/components/school/SchoolModal";
import { formatMoney } from "@/components/school/format";
import { normalizeName } from "@/services/school-people.service";
import { createLessonPlan, updateLessonPlan, fetchSellableServices } from "@/services/school-enrollments.service";
import type { LessonPlan, SellableService } from "@/services/school-enrollments.service";
import { notifySuccess, notifyError } from "@/lib/notifications";

interface PlanFormProps {
  plan?: LessonPlan | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Alta / edición de un plan de clase.
 *
 * El plan vive SOLO en `school_lesson_plans` y referencia un servicio del
 * catálogo ("clase de 45 min de guitarra") cuyo PRECIO se congela en cada
 * matrícula. Un mismo servicio puede tener varios planes (x4, x8, individual).
 */
export function PlanForm({ plan, onClose, onSaved }: PlanFormProps) {
  const [services, setServices] = useState<SellableService[]>([]);
  const [name, setName] = useState(plan?.name ?? "");
  const [serviceId, setServiceId] = useState(plan?.service_id ?? "");
  const [lessonCount, setLessonCount] = useState(plan?.lesson_count ?? 4);
  const [durationMinutes, setDurationMinutes] = useState(plan?.duration_minutes ?? 60);
  const [validityDays, setValidityDays] = useState(plan?.validity_days ?? 30);
  const [maxGroupSize, setMaxGroupSize] = useState(plan?.max_group_size ?? 1);
  const [minAge, setMinAge] = useState<number | "">(plan?.min_age ?? "");
  const [maxAge, setMaxAge] = useState<number | "">(plan?.max_age ?? "");
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSellableServices()
      .then(setServices)
      .catch(() => setServices([]));
  }, []);

  const ageRangeInvalid = minAge !== "" && maxAge !== "" && minAge > maxAge;

  // El rango de edad solo tiene sentido para un plan grupal: si el negocio
  // baja el cupo a 1, se limpia en el mismo handler (no un efecto derivado)
  // para no dejar un valor invisible guardado en un plan individual.
  const handleMaxGroupSizeChange = (value: number) => {
    setMaxGroupSize(value);
    if (value <= 1) {
      setMinAge("");
      setMaxAge("");
    }
  };

  const selectedService = services.find((s) => s.id === serviceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizeName(name) || !serviceId || lessonCount < 1 || ageRangeInvalid) return;

    setLoading(true);
    setError("");
    const payload = {
      name: normalizeName(name),
      service_id: serviceId,
      lesson_count: lessonCount,
      duration_minutes: durationMinutes,
      validity_days: validityDays,
      max_group_size: maxGroupSize,
      min_age: minAge === "" ? null : minAge,
      max_age: maxAge === "" ? null : maxAge,
      is_active: isActive,
    };
    try {
      if (plan) await updateLessonPlan(plan.id, payload);
      else await createLessonPlan(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      setLoading(false);
      setError(message);
      notifyError("No se pudo guardar el plan", message);
      return;
    }
    setLoading(false);
    notifySuccess(plan ? "Plan actualizado" : "Plan creado", normalizeName(name));
    onSaved();
    onClose();
  };

  return (
    <SchoolModal title={plan ? "Editar plan de clase" : "Nuevo plan de clase"} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
              Nombre <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Guitarra x4"
              required
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <Select
              label="Servicio (clase)"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              searchable
              searchPlaceholder="Buscar servicio…"
              hint={selectedService ? `Precio de la clase: ${formatMoney(selectedService.price)}` : undefined}
            >
              <option value="">Seleccionar…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {formatMoney(s.price)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
              Clases <span className="text-primary">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={lessonCount}
              onChange={(e) => setLessonCount(Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Min por clase</label>
            <input
              type="number"
              min={15}
              step={5}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Vigencia (días)</label>
            <input
              type="number"
              min={1}
              value={validityDays}
              onChange={(e) => setValidityDays(Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Alumnos por clase</label>
            <input
              type="number"
              min={1}
              value={maxGroupSize}
              onChange={(e) => handleMaxGroupSizeChange(Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {maxGroupSize > 1 && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-on-surface">Edad mínima</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={minAge}
                  onChange={(e) => setMinAge(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Sin mínimo"
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-on-surface">Edad máxima</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={maxAge}
                  onChange={(e) => setMaxAge(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Sin máximo"
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <p className="text-xs text-on-surface-variant">
              Opcional. Al matricular, avisa (sin bloquear) si la edad del alumno queda fuera.
            </p>
            {ageRangeInvalid && (
              <p className="text-xs text-error-dim" role="alert">
                La edad mínima no puede ser mayor que la máxima.
              </p>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          Plan activo (se puede matricular)
        </label>

        {error && (
          <p className="rounded-xl border border-error-container/30 bg-error-container/20 px-4 py-2.5 text-sm text-error-dim" role="alert">
            {error}
          </p>
        )}

        <div className="pt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !normalizeName(name) || !serviceId || lessonCount < 1 || ageRangeInvalid}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando…" : "Guardar plan"}
          </button>
        </div>
      </form>
    </SchoolModal>
  );
}
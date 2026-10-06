"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/Select";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useFormatMoney } from "@/lib/useMoney";
import { normalizeName } from "@/services/school-people.service";
import { createLessonPlan, updateLessonPlan, fetchSellableServices } from "@/services/school-enrollments.service";
import type { LessonPlan, SellableService } from "@/services/school-enrollments.service";
import { useServicesStore } from "@/stores/services.store";
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
 *
 * Un plan NUEVO crea su propio servicio (mismo nombre y precio del plan): con
 * el catálogo en cero, el selector de servicio salía vacío y el alta quedaba
 * muerta en silencio — el bug real que motivó esta tarea (T9). "Usar un
 * servicio existente" es la puerta de escape para reusar uno ya creado (ej.
 * uno que también se vende suelto en el POS). Al EDITAR, el servicio ya está
 * vinculado: se muestra (nombre + precio), no se vuelve a elegir — el precio
 * se edita desde Productos y servicios, nunca desde acá (ver nota en
 * `services.service.ts` sobre `updateService` necesitando la ficha completa:
 * un patch parcial armado a mano desde este formulario le pisaría la
 * comisión/categoría/imagen reales del servicio).
 */
export function PlanForm({ plan, onClose, onSaved }: PlanFormProps) {
  const money = useFormatMoney();
  const [services, setServices] = useState<SellableService[]>([]);
  const addService = useServicesStore((s) => s.addService);

  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState("");
  const [showExistingPicker, setShowExistingPicker] = useState(false);
  const [serviceId, setServiceId] = useState(plan?.service_id ?? "");
  // Si el servicio se crea bien pero el plan falla después, un reintento no
  // debe crear un SEGUNDO servicio huérfano (mismo patrón que
  // `createdCustomerId` en StudentForm, T4).
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);
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
  // El servicio vinculado en edición puede estar archivado: `fetchSellableServices`
  // solo trae activos, así que no aparecería acá. Se avisa en vez de inventar un precio.
  const linkedService = plan ? services.find((s) => s.id === plan.service_id) : undefined;

  const priceValid = !plan && !showExistingPicker ? price !== "" && parseFloat(price) >= 0 : true;
  const serviceReady = plan
    ? true
    : showExistingPicker
      ? Boolean(serviceId)
      : Boolean(normalizeName(name)) && priceValid;

  const canSubmit = Boolean(normalizeName(name)) && lessonCount >= 1 && !ageRangeInvalid && serviceReady;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");

    let finalServiceId = serviceId;

    if (!plan && !showExistingPicker) {
      if (createdServiceId) {
        // Reintento tras una falla previa del plan: el servicio ya existe.
        finalServiceId = createdServiceId;
      } else {
        const newServiceId = await addService({
          name: normalizeName(name),
          description: "",
          price,
          duration_minutes: String(durationMinutes),
          status: "active",
          has_commission: false,
          commission_type: "percentage",
          commission_value: "",
          image_url: null,
        });
        if (!newServiceId) {
          setLoading(false);
          setError("No se pudo crear el servicio del plan");
          notifyError("No se pudo guardar el plan", "No se pudo crear el servicio del plan");
          return;
        }
        finalServiceId = newServiceId;
        setCreatedServiceId(newServiceId);
      }
    }

    const payload = {
      name: normalizeName(name),
      service_id: finalServiceId,
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
          {plan ? (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-on-surface">Servicio vinculado</label>
              <div className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest py-2.5 px-3 text-sm text-on-surface">
                {plan.service_name}
                {linkedService ? ` — ${money(linkedService.price)}` : " — servicio archivado"}
              </div>
              <a
                href={`/dashboard/inventory/product?serviceId=${plan.service_id}&type=servicio`}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Editar precio en Productos y servicios
              </a>
            </div>
          ) : showExistingPicker ? (
            <div className="space-y-1.5">
              <Select
                label="Servicio (clase)"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                searchable
                searchPlaceholder="Buscar servicio…"
                hint={selectedService ? `Precio de la clase: ${money(selectedService.price)}` : undefined}
              >
                <option value="">Seleccionar…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {money(s.price)}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => {
                  setShowExistingPicker(false);
                  setServiceId("");
                  setCreatedServiceId(null);
                }}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Crear un servicio nuevo para este plan
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                Precio <span className="text-primary">*</span>
              </label>
              <MoneyInput value={price} onChange={setPrice} required />
              <p className="text-xs text-on-surface-variant">
                Se crea un servicio nuevo con este nombre y precio.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setShowExistingPicker(true);
                    setCreatedServiceId(null);
                  }}
                  className="font-semibold text-primary hover:underline"
                >
                  Usar un servicio existente
                </button>
              </p>
            </div>
          )}
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
            disabled={loading || !canSubmit}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando…" : "Guardar plan"}
          </button>
        </div>
      </form>
    </SchoolModal>
  );
}
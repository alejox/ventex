"use client";

import { useEffect, useMemo, useState } from "react";
import { usePromosStore } from "@/stores/promos.store";
import { useServicesStore } from "@/stores/services.store";
import { useProfile } from "@/components/ProfileProvider";
import { useSettingsStore } from "@/stores/settings.store";
import {
  DEFAULT_PROMO_MESSAGE,
  PROMO_VARIABLES,
  renderPromoMessage,
  availableReward,
  businessDisplayName,
} from "@/services/promos.service";
import { CollectionError, CollectionLoading } from "@/components/CollectionState";
import { notifySuccess, notifyError } from "@/lib/notifications";

/**
 * Configuración → Promociones.
 *
 * Tres decisiones y nada más: qué cuenta como corte, qué se le dice al cliente,
 * y qué premio hay en cada hito. El envío no se configura acá porque no hay
 * nada que configurar: es un enlace `wa.me` que abre WhatsApp con el mensaje
 * escrito, sin proveedor ni credenciales.
 */
export default function PromocionesPage() {
  const config = usePromosStore((s) => s.config);
  const milestones = usePromosStore((s) => s.milestones);
  const loading = usePromosStore((s) => s.loading);
  const submitting = usePromosStore((s) => s.submitting);
  const error = usePromosStore((s) => s.error);
  const fetchAll = usePromosStore((s) => s.fetchAll);
  const saveConfig = usePromosStore((s) => s.saveConfig);
  const addMilestone = usePromosStore((s) => s.addMilestone);
  const removeMilestone = usePromosStore((s) => s.removeMilestone);
  const recalc = usePromosStore((s) => s.recalc);

  const services = useServicesStore((s) => s.services);
  const fetchServices = useServicesStore((s) => s.fetchServices);
  const profile = useProfile();
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  const [enabled, setEnabled] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [seeded, setSeeded] = useState(false);

  const [threshold, setThreshold] = useState("10");
  const [reward, setReward] = useState("");

  useEffect(() => {
    fetchSettings();
    fetchAll();
    fetchServices();
  }, [fetchAll, fetchServices, fetchSettings]);

  // Siembra desde lo guardado, una sola vez: si corriera en cada render, lo que
  // el usuario está escribiendo se pisaría cuando el store se refresque.
  if (!loading && !seeded) {
    setSeeded(true);
    setEnabled(config.enabled);
    setServiceIds(config.serviceIds);
    setMessage(config.message ?? DEFAULT_PROMO_MESSAGE);
  }

  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /**
   * La vista previa usa el hito más bajo configurado, no un 10 inventado: si el
   * negocio premia a los 5, mostrarle un ejemplo con 10 no le dice cómo se va a
   * ver su mensaje.
   */
  const preview = useMemo(() => {
    const umbral = milestones.filter((m) => m.is_active).map((m) => m.threshold).sort((a, b) => a - b)[0] ?? 10;
    const hito = availableReward(umbral, milestones);
    return renderPromoMessage(message, {
      cliente: "Juan",
      cortes: umbral,
      negocio: businessDisplayName(settings?.business_profile?.businessName, profile?.businessName),
      premio: hito?.reward ?? null,
    });
  }, [message, milestones, profile?.businessName, settings?.business_profile?.businessName]);

  const handleSave = async () => {
    const ok = await saveConfig({ enabled, serviceIds, message });
    if (ok) notifySuccess("Promociones guardadas", "Los cambios ya están activos.");
    else notifyError("No se pudo guardar", usePromosStore.getState().error ?? "Intentá de nuevo.");
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(threshold, 10);
    if (!Number.isFinite(n) || n <= 0) {
      notifyError("Umbral inválido", "El hito tiene que ser un número mayor que cero.");
      return;
    }
    if (!reward.trim()) {
      notifyError("Falta el premio", "Escribí qué gana el cliente al llegar a ese hito.");
      return;
    }
    const ok = await addMilestone({ threshold: n, reward });
    if (ok) {
      setReward("");
      notifySuccess("Hito agregado", `A los ${n} cortes: ${reward.trim()}`);
    } else {
      notifyError("No se pudo agregar", usePromosStore.getState().error ?? "¿Ya existe un hito con ese número?");
    }
  };

  const handleRecalc = async () => {
    const n = await recalc();
    if (n === null) {
      notifyError("No se pudo recalcular", usePromosStore.getState().error ?? "Intentá de nuevo.");
      return;
    }
    notifySuccess(
      "Contadores recalculados",
      `${n} cliente${n !== 1 ? "s" : ""} actualizado${n !== 1 ? "s" : ""} desde el historial de ventas.`,
    );
  };

  if (loading) return <CollectionLoading label="Cargando promociones…" />;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {error && <CollectionError message={error} onRetry={fetchAll} />}

      {/* 1. El interruptor */}
      <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-on-surface">Contador de cortes</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Cuenta cuántos cortes lleva cada cliente y te deja mandárselo por WhatsApp desde su
              ficha.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            aria-pressed={enabled}
            aria-label="Activar el contador de cortes"
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              enabled ? "bg-[#6063ee]" : "bg-outline-variant/30"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </section>

      {/* 2. Qué cuenta */}
      <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
        <h2 className="text-base font-bold text-on-surface">¿Qué cuenta como corte?</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-4">
          Elegí los servicios que suman al contador. Si no marcás ninguno, el contador no sube:
          preferimos que lo decidas vos a adivinarlo por el nombre.
        </p>

        {services.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            Todavía no tenés servicios en tu catálogo. Creá uno en Producto - Servicio y volvé acá.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {services.map((s) => {
              const on = serviceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  aria-pressed={on}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. El mensaje */}
      <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
        <h2 className="text-base font-bold text-on-surface">El mensaje</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-3">
          Se abre en WhatsApp con este texto ya escrito. Lo mandás vos: nada sale solo.
        </p>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
          placeholder={DEFAULT_PROMO_MESSAGE}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {PROMO_VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => setMessage((m) => `${m}${m.endsWith(" ") || !m ? "" : " "}${v.token}`)}
              title={v.help}
              className="px-2.5 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-xs font-mono text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors"
            >
              {v.token}
            </button>
          ))}
        </div>

        {/* Un mensaje sin {premio} NO puede anunciar el corte gratis, por más
            hitos que haya configurados. Pasó de verdad: el editor precarga el
            texto por defecto, guardarlo lo congela, y una mejora posterior del
            default ya no lo alcanza. */}
        {milestones.length > 0 && !message.includes("{premio}") && (
          <p role="alert" className="mt-3 text-xs rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2 text-on-surface">
            <strong>Tenés hitos configurados pero el mensaje no incluye {"{premio}"}</strong>, así que
            el cliente nunca se va a enterar de que ganó. Agregalo con el botón de abajo.
          </p>
        )}

        <div className="mt-4 rounded-xl bg-[#075E54]/10 border border-[#25D366]/20 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">
            Vista previa
          </p>
          <p className="text-sm text-on-surface whitespace-pre-wrap">{preview}</p>
        </div>
      </section>

      {/* 4. Los hitos */}
      <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
        <h2 className="text-base font-bold text-on-surface">Hitos y premios</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-4">
          Qué gana el cliente al llegar a cierta cantidad. Aparece en el mensaje con la variable{" "}
          <code className="font-mono text-xs">{"{premio}"}</code>.
        </p>

        {milestones.length > 0 && (
          <ul className="divide-y divide-outline-variant/10 mb-4 rounded-xl border border-outline-variant/15 overflow-hidden">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="shrink-0 w-14 text-sm font-bold text-primary tabular-nums">
                  {m.threshold}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-on-surface truncate">{m.reward}</p>
                  <p className="text-xs text-on-surface-variant">
                    Al canjearlo, el contador del cliente vuelve a cero.
                  </p>
                </div>
                <button
                  onClick={() => removeMilestone(m.id)}
                  disabled={submitting}
                  aria-label={`Eliminar el hito de ${m.threshold} cortes`}
                  className="shrink-0 text-xs font-semibold text-error-dim hover:text-error transition-colors disabled:opacity-50"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddMilestone} className="flex flex-col sm:flex-row gap-3">
          <div className="sm:w-28">
            <label htmlFor="promo-threshold" className="text-[13px] font-semibold text-on-surface block mb-1.5">
              Cortes
            </label>
            <input
              id="promo-threshold"
              type="number"
              min="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="promo-reward" className="text-[13px] font-semibold text-on-surface block mb-1.5">
              Premio
            </label>
            <input
              id="promo-reward"
              type="text"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="Ej. el corte va por la casa"
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50"
            />
          </div>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="mb-0 px-5 py-2.5 rounded-xl text-sm font-semibold bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              Agregar
            </button>
          </div>
        </form>
      </section>

      {/* 5. El histórico */}
      <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
        <h2 className="text-base font-bold text-on-surface">Clientes que ya venían</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-4">
          Recalcula el contador de todos tus clientes leyendo tu historial de ventas. Corrélo
          después de cambiar qué servicios cuentan, o para no arrancar a todos en cero.
        </p>
        <button
          type="button"
          onClick={handleRecalc}
          disabled={submitting}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
        >
          {submitting ? "Recalculando…" : "Recalcular desde el historial"}
        </button>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="px-8 py-3 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_20px_rgba(96,99,238,0.25)] transition-all disabled:opacity-50"
        >
          {submitting ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

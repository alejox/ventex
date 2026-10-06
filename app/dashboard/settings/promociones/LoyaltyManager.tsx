"use client";

import { useEffect, useState } from "react";
import { useLoyaltyStore } from "@/stores/loyalty.store";
import { useProfile } from "@/components/ProfileProvider";
import { CollectionError, CollectionLoading } from "@/components/CollectionState";
import { notifySuccess, notifyError } from "@/lib/notifications";
import { MoneyInput } from "@/components/ui/MoneyInput";

/**
 * Configuración → Promociones → Puntos (tienda), fase 2.
 *
 * Vive JUNTO a `OffersManager` en la misma pestaña: las dos tarjetas son
 * "promociones de tienda", solo que una es automática (ofertas) y la otra la
 * arma el cliente comprando (puntos). Owner-only, igual que el resto de
 * Ajustes — un worker sin permiso `settings` ni siquiera llega a esta pantalla
 * (`SettingsTabs` la filtra), pero la RLS de `settings` es la que de verdad
 * lo impide si algo fallara acá.
 */
export function LoyaltyManager() {
  const config = useLoyaltyStore((s) => s.config);
  const loading = useLoyaltyStore((s) => s.loading);
  const submitting = useLoyaltyStore((s) => s.submitting);
  const error = useLoyaltyStore((s) => s.error);
  const fetchConfig = useLoyaltyStore((s) => s.fetchConfig);
  const saveConfig = useLoyaltyStore((s) => s.saveConfig);

  const profile = useProfile();
  const canEdit = !profile?.isWorker;

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const [enabled, setEnabled] = useState(false);
  const [pesoPerPoint, setPesoPerPoint] = useState("");
  const [pointsValue, setPointsValue] = useState("");
  const [minRedeem, setMinRedeem] = useState("0");
  const [seeded, setSeeded] = useState(false);

  // Siembra desde lo guardado, una sola vez — mismo motivo que
  // HaircutPromosSection: sembrar en cada render pisaría lo que el dueño está
  // escribiendo cuando el store se refresque.
  if (!loading && !seeded) {
    setSeeded(true);
    setEnabled(config.enabled);
    setPesoPerPoint(config.pesoPerPoint != null ? String(config.pesoPerPoint) : "");
    setPointsValue(config.pointsValue != null ? String(config.pointsValue) : "");
    setMinRedeem(String(config.minRedeem));
  }

  const handleSave = async () => {
    const peso = pesoPerPoint.trim() ? parseFloat(pesoPerPoint) : null;
    const value = pointsValue.trim() ? parseFloat(pointsValue) : null;
    const min = parseInt(minRedeem, 10);

    if (enabled) {
      if (peso == null || !Number.isFinite(peso) || peso <= 0) {
        notifyError("Falta la tasa", "¿Cuántos pesos hay que gastar para ganar un punto? Tiene que ser mayor que cero.");
        return;
      }
      if (value == null || !Number.isFinite(value) || value <= 0) {
        notifyError("Falta el valor del punto", "¿Cuánto vale un punto al canjear? Tiene que ser mayor que cero.");
        return;
      }
    }
    if (!Number.isFinite(min) || min < 0) {
      notifyError("Mínimo inválido", "El mínimo para canjear no puede ser negativo.");
      return;
    }

    const ok = await saveConfig({ enabled, pesoPerPoint: peso, pointsValue: value, minRedeem: min });
    if (ok) notifySuccess("Puntos guardados", "Los cambios ya están activos.");
    else notifyError("No se pudo guardar", useLoyaltyStore.getState().error ?? "Intenta de nuevo.");
  };

  if (loading) return <CollectionLoading label="Cargando puntos…" />;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {error && <CollectionError message={error} onRetry={fetchConfig} />}

      {/* 1. El interruptor */}
      <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-on-surface">Puntos canjeables</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              El cliente gana puntos al comprar y los canjea como descuento en una venta futura.
            </p>
          </div>
          <button
            type="button"
            onClick={() => canEdit && setEnabled((v) => !v)}
            disabled={!canEdit}
            aria-pressed={enabled}
            aria-label="Activar los puntos canjeables"
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
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

      {/* 2. La tasa: cuánto se gana */}
      {canEdit && (
        <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
          <h2 className="text-base font-bold text-on-surface">¿Cuánto se gana?</h2>
          <p className="text-sm text-on-surface-variant mt-1 mb-4">
            Pesos que hay que gastar para ganar UN punto. Se calcula sobre lo que el cliente
            terminó pagando (con descuentos y ofertas ya aplicados).
          </p>
          <div className="sm:w-56">
            <label htmlFor="loyalty-peso" className="text-[13px] font-semibold text-on-surface block mb-1.5">
              Pesos por punto
            </label>
            <MoneyInput
              id="loyalty-peso"
              value={pesoPerPoint}
              onChange={setPesoPerPoint}
              placeholder="Ej. 1000"
            />
          </div>
        </section>
      )}

      {/* 3. El valor: cuánto vale un punto al canjear */}
      {canEdit && (
        <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
          <h2 className="text-base font-bold text-on-surface">¿Cuánto vale al canjear?</h2>
          <p className="text-sm text-on-surface-variant mt-1 mb-4">
            Valor en pesos de un punto cuando el cliente lo usa como descuento en el Punto de
            Venta.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="sm:w-56">
              <label htmlFor="loyalty-value" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                Valor por punto
              </label>
              <MoneyInput id="loyalty-value" value={pointsValue} onChange={setPointsValue} placeholder="Ej. 50" />
            </div>
            <div className="sm:w-48">
              <label htmlFor="loyalty-min" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                Mínimo para canjear
              </label>
              <input
                id="loyalty-min"
                type="number"
                min="0"
                value={minRedeem}
                onChange={(e) => setMinRedeem(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <p className="text-xs text-on-surface-variant mt-3">
            0 = sin mínimo, el cliente puede canjear desde 1 punto.
          </p>
        </section>
      )}

      {canEdit && (
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
      )}
    </div>
  );
}

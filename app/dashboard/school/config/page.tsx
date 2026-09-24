"use client";

import { useEffect, useState } from "react";
import { useSchoolStore } from "@/stores/school.store";
import { CollectionLoading, CollectionError } from "@/components/CollectionState";
import { IconSettings } from "@/app/assets/icons/DashboardIcons";
import { notifySuccess, notifyError } from "@/lib/notifications";

/**
 * Configuración de la escuela: instrumentos, salas y la política de
 * reprogramación. Se guarda read-insert-or-update: el negocio que nunca abrió
 * esta pantalla ni siquiera tiene fila en `school_settings`.
 */
export default function SchoolConfigPage() {
  const settings = useSchoolStore((s) => s.settings);
  const loading = useSchoolStore((s) => s.loading);
  const saving = useSchoolStore((s) => s.saving);
  const error = useSchoolStore((s) => s.error);
  const fetchSettings = useSchoolStore((s) => s.fetchSettings);
  const saveSettings = useSchoolStore((s) => s.saveSettings);

  const [instrumentsText, setInstrumentsText] = useState("");
  const [roomsText, setRoomsText] = useState("");
  const [minAdvanceHours, setMinAdvanceHours] = useState(24);
  const [maxReschedules, setMaxReschedules] = useState(2);
  const [consumeOnAbsence, setConsumeOnAbsence] = useState(false);
  const [expiryExtension, setExpiryExtension] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void fetchSettings()
      .then(() => {
        if (cancelled) return;
        const s = useSchoolStore.getState().settings;
        setInstrumentsText(s.instruments.join(", "));
        setRoomsText(s.rooms.join(", "));
        setMinAdvanceHours(s.policy.min_advance_hours);
        setMaxReschedules(s.policy.max_reschedules);
        setConsumeOnAbsence(s.policy.consume_on_unjustified_absence);
        setExpiryExtension(s.policy.expiry_extension_days);
        setReady(true);
      })
      .catch(() => {
        // El error ya quedó en el store; lo muestra CollectionError.
      });
    return () => {
      cancelled = true;
    };
  }, [ready, fetchSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const instruments = instrumentsText.split(",").map((s) => s.trim()).filter(Boolean);
    const rooms = roomsText.split(",").map((s) => s.trim()).filter(Boolean);
    const ok = await saveSettings({
      instruments,
      rooms,
      policy: {
        min_advance_hours: minAdvanceHours,
        max_reschedules: maxReschedules,
        consume_on_unjustified_absence: consumeOnAbsence,
        expiry_extension_days: expiryExtension,
      },
    });
    if (ok) notifySuccess("Configuración guardada");
    else notifyError("No se pudo guardar", useSchoolStore.getState().error ?? "Error inesperado");
  };

  if (loading && !ready) return <CollectionLoading label="Cargando configuración…" />;
  if (error && !ready) return <CollectionError message={error} onRetry={() => void fetchSettings()} />;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <IconSettings className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Configuración de la escuela</h1>
          <p className="text-sm text-on-surface-variant">Qué se enseña y bajo qué reglas.</p>
        </div>
      </div>

      <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-sm space-y-5">
        <h2 className="font-bold text-on-surface">Catálogo</h2>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
            Instrumentos <span className="text-primary">*</span>
          </label>
          <input
            type="text"
            value={instrumentsText}
            onChange={(e) => setInstrumentsText(e.target.value)}
            placeholder="Separados por coma: Guitarra, Piano, Canto…"
            required
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-on-surface-variant">
            Los usa el perfil del profesor para elegir qué enseña.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-on-surface">Salas / aulas</label>
          <input
            type="text"
            value={roomsText}
            onChange={(e) => setRoomsText(e.target.value)}
            placeholder="Separadas por coma: Sala 1, Sala 2…"
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-on-surface-variant">
            Se asignan a una clase cuando se agenda (fase de agenda).
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-sm space-y-5">
        <h2 className="font-bold text-on-surface">Política de reprogramación</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Aviso mínimo (horas)</label>
            <input
              type="number"
              min={0}
              value={minAdvanceHours}
              onChange={(e) => setMinAdvanceHours(Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Reprogramaciones por matrícula</label>
            <input
              type="number"
              min={0}
              value={maxReschedules}
              onChange={(e) => setMaxReschedules(Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Extensión de vigencia por reprogramación</label>
            <input
              type="number"
              min={0}
              value={expiryExtension}
              onChange={(e) => setExpiryExtension(Number(e.target.value))}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-on-surface-variant">Días que se agregan al vencimiento. 0 = no cambia.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
          <input
            type="checkbox"
            checked={consumeOnAbsence}
            onChange={(e) => setConsumeOnAbsence(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          La falta sin aviso consume crédito de la matrícula
        </label>
      </section>

      <div className="flex justify-end gap-3">
        <p className="mr-auto self-center text-xs text-on-surface-variant">
          {settings.instruments.length > 0
            ? `${settings.instruments.length} instrumentos · ${settings.rooms.length} salas`
            : "Sin guardar todavía — los cambios se aplican al guardar."}
        </p>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>
    </form>
  );
}
"use client";

import React, { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settings.store";
import { normalizeBusinessKey } from "@/services/settings.service";
import { notifySuccess } from "@/lib/notifications";

/**
 * Tarjeta de "Llave de la tienda": permite escribir una llave propia o generarla
 * automáticamente, copiarla y guardarla. Los empleados la usan junto a su usuario
 * y contraseña para iniciar sesión en la pestaña "Empleado" del login.
 */
export function BusinessKeyCard() {
  const businessKey = useSettingsStore((s) => s.businessKey);
  const keyLoading = useSettingsStore((s) => s.keyLoading);
  const keySaving = useSettingsStore((s) => s.keySaving);
  const keyRegenerating = useSettingsStore((s) => s.keyRegenerating);
  const fetchBusinessKey = useSettingsStore((s) => s.fetchBusinessKey);
  const setBusinessKey = useSettingsStore((s) => s.setBusinessKey);
  const regenerateBusinessKey = useSettingsStore((s) => s.regenerateBusinessKey);

  // `draft` es lo que el usuario está escribiendo; si es null, se muestra la llave guardada.
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    fetchBusinessKey();
  }, [fetchBusinessKey]);

  const value = draft ?? businessKey ?? "";
  const busy = keySaving || keyRegenerating;
  const dirty = draft !== null && normalizeBusinessKey(value) !== (businessKey ?? "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value.toUpperCase().replace(/\s+/g, ""));
    setSaved(false);
    setLocalError(null);
  };

  const handleCopy = async () => {
    if (!businessKey) return;
    try {
      await navigator.clipboard.writeText(businessKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  };

  const handleSave = async () => {
    setLocalError(null);
    const res = await setBusinessKey(value);
    if (res.ok) {
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      notifySuccess("Llave guardada", "La llave de la tienda se ha guardado correctamente.");
    } else {
      setLocalError(res.error ?? "No se pudo guardar la llave.");
    }
  };

  const handleGenerate = async () => {
    if (
      businessKey &&
      !confirm(
        "¿Generar una nueva llave? La llave actual dejará de funcionar y tus empleados deberán usar la nueva para iniciar sesión.",
      )
    ) {
      return;
    }
    setLocalError(null);
    const key = await regenerateBusinessKey();
    if (key) {
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      notifySuccess("Llave generada", `Tu nueva llave de la tienda es ${key}.`);
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/10 p-6 md:p-8">
      <h3 className="text-base font-bold text-on-surface">Llave de la tienda</h3>
      <p className="text-sm text-on-surface-variant mt-1 mb-4">
        Escribe tu propia llave o genérala automáticamente. Compártela con tus empleados: junto a su usuario y contraseña,
        la usan para iniciar sesión en la pestaña <span className="font-semibold">Empleado</span>.
      </p>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container border border-outline-variant/10 focus-within:border-primary transition-colors">
          <input
            type="text"
            value={keyLoading ? "" : value}
            onChange={handleChange}
            disabled={keyLoading || busy}
            placeholder={keyLoading ? "········" : "Ej: MITIENDA25"}
            maxLength={20}
            autoCapitalize="characters"
            aria-label="Llave de la tienda"
            className="flex-1 min-w-0 bg-transparent py-1.5 font-mono text-lg font-bold tracking-[0.2em] text-on-surface focus:outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-on-surface-variant/50 disabled:opacity-60"
          />
          {businessKey && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-sm font-semibold text-primary hover:text-primary-dim transition-colors shrink-0"
            >
              {copied ? "¡Copiada!" : "Copiar"}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !dirty || value.length === 0}
            className="px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50"
          >
            {keySaving ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className="px-5 py-3 rounded-xl border border-outline-variant/20 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50"
          >
            {keyRegenerating ? "Generando…" : "Generar"}
          </button>
        </div>
      </div>

      <div className="mt-2 min-h-[1.25rem] text-sm">
        {localError ? (
          <span className="text-error">{localError}</span>
        ) : saved ? (
          <span className="text-[#10b981] font-medium">✓ Llave guardada</span>
        ) : (
          <span className="text-on-surface-variant">Entre 4 y 20 caracteres, solo letras y números.</span>
        )}
      </div>
    </div>
  );
}

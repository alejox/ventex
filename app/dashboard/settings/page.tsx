"use client";

import React, { useEffect, useState } from "react";
import { IconSettings } from "@/app/assets/icons/DashboardIcons";
import { useSettingsStore } from "@/stores/settings.store";
import type { Settings } from "@/services/settings.service";

const CURRENCIES = [
  { code: "MXN", label: "Peso mexicano (MXN)" },
  { code: "USD", label: "Dólar estadounidense (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "COP", label: "Peso colombiano (COP)" },
  { code: "ARS", label: "Peso argentino (ARS)" },
  { code: "CLP", label: "Peso chileno (CLP)" },
  { code: "PEN", label: "Sol peruano (PEN)" },
];

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <div className="w-full max-w-2xl mx-auto pb-20 animate-in fade-in duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <IconSettings className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Ajustes</h1>
          <p className="text-sm text-on-surface-variant">Configuración general de tu cuenta.</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-on-surface mb-1">Facturación</h2>
        <p className="text-sm text-on-surface-variant mb-8">
          Estos valores se aplican por defecto en el punto de venta.
        </p>

        {loading && !settings ? (
          <p className="text-sm text-on-surface-variant py-8 text-center">Cargando ajustes…</p>
        ) : settings ? (
          // key fuerza el re-seed del formulario cuando cambian los ajustes cargados.
          <SettingsForm key={settings.id ?? "new"} settings={settings} />
        ) : null}
      </div>
    </div>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const submitting = useSettingsStore((s) => s.submitting);
  const error = useSettingsStore((s) => s.error);

  const [taxPercent, setTaxPercent] = useState(() => String(+(settings.tax_rate * 100).toFixed(2)));
  const [currency, setCurrency] = useState(settings.currency);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const pct = parseFloat(taxPercent);
    const rate = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) / 100 : 0;
    const ok = await saveSettings({ tax_rate: Math.round(rate * 10000) / 10000, currency });
    if (ok) setSaved(true);
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-on-surface mb-2">Tasa de IVA (%)</label>
        <div className="relative">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            value={taxPercent}
            onChange={(e) => {
              setTaxPercent(e.target.value);
              setSaved(false);
            }}
            placeholder="16"
            className="w-full px-4 py-3 pr-10 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">%</span>
        </div>
        <p className="text-xs text-on-surface-variant mt-2">
          Se aplica a cada venta, salvo a clientes marcados como exentos.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-on-surface mb-2">Moneda</label>
        <select
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            setSaved(false);
          }}
          className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-4 pt-6 mt-4 border-t border-outline-variant/10">
        <span className={`text-sm font-medium text-[#10b981] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          ✓ Ajustes guardados
        </span>
        <button
          type="submit"
          disabled={submitting}
          className="py-3 px-6 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Guardando…" : "Guardar Cambios"}
        </button>
      </div>
    </form>
  );
}

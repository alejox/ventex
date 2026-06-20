"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSettings } from "@/app/assets/icons/DashboardIcons";
import { useSettingsStore } from "@/stores/settings.store";
import { useProfileStore } from "@/stores/profile.store";
import { useProfile } from "@/components/ProfileProvider";
import {
  BUSINESS_OPTIONS,
  MODULES_BY_TYPE,
  type BusinessType,
  type ModuleId,
  type Modules,
} from "@/config/business";
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
    <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-300">

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm mb-6">
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

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-on-surface mb-1">Negocio y módulos</h2>
        <p className="text-sm text-on-surface-variant mb-8">
          Tu tipo de negocio y los módulos activos determinan qué secciones ves en el panel.
        </p>
        <BusinessModulesForm />
      </div>
    </div>
  );
}

function BusinessModulesForm() {
  const router = useRouter();
  const profile = useProfile();
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const submitting = useProfileStore((s) => s.submitting);
  const error = useProfileStore((s) => s.error);

  const [businessType, setBusinessType] = useState<BusinessType>(
    profile?.businessType ?? "tienda",
  );
  const [modules, setModules] = useState<Modules>(profile?.modules ?? {});
  const [saved, setSaved] = useState(false);

  const available = MODULES_BY_TYPE[businessType] ?? [];

  const toggle = (id: ModuleId) => {
    setModules((m) => ({ ...m, [id]: !m[id] }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    // Conserva solo los módulos pertinentes al tipo seleccionado.
    const cleaned: Modules = {};
    for (const mod of available) cleaned[mod.id] = Boolean(modules[mod.id]);
    const ok = await saveProfile({ businessType, modules: cleaned });
    if (ok) {
      setSaved(true);
      router.refresh(); // re-ejecuta el layout server para refrescar la navegación
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-on-surface mb-2">Tipo de negocio</label>
        <select
          value={businessType}
          onChange={(e) => {
            setBusinessType(e.target.value as BusinessType);
            setSaved(false);
          }}
          className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface transition-shadow appearance-none"
        >
          {BUSINESS_OPTIONS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <span className="block text-sm font-semibold text-on-surface">Módulos</span>
        {available.map((mod) => (
          <button
            type="button"
            key={mod.id}
            onClick={() => toggle(mod.id)}
            className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl border text-left transition-colors ${
              modules[mod.id]
                ? "bg-primary/5 border-primary/40"
                : "bg-surface-container-low border-outline-variant/10 hover:bg-surface-container"
            }`}
          >
            <span>
              <span className="block text-sm font-semibold text-on-surface">{mod.label}</span>
              <span className="block text-xs text-on-surface-variant">{mod.description}</span>
            </span>
            <span
              className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
                modules[mod.id] ? "bg-primary" : "bg-surface-container-highest border border-outline-variant/20"
              }`}
            >
              <span
                className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-all ${
                  modules[mod.id] ? "left-[22px]" : "left-[2px]"
                }`}
              ></span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 pt-6 mt-4 border-t border-outline-variant/10">
        <span className={`text-sm font-medium text-[#10b981] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          ✓ Cambios guardados
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

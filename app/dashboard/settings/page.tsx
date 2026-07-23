"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { COLOMBIA_TRANSFER_METHODS, DEFAULT_TRANSFER_METHODS } from "@/config/transferMethods";
import { Select } from "@/components/ui/Select";

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

      <Select
        label="Tipo de negocio"
        value={businessType}
        onChange={(e) => {
          setBusinessType(e.target.value as BusinessType);
          setSaved(false);
        }}
      >
        {BUSINESS_OPTIONS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </Select>

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

/** Fila de ajuste con interruptor: título, explicación y toggle a la derecha. */
function ToggleSetting({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/20 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{description}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
          <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>
    </div>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const submitting = useSettingsStore((s) => s.submitting);
  const error = useSettingsStore((s) => s.error);

  const [taxPercent, setTaxPercent] = useState(() => String(+(settings.tax_rate * 100).toFixed(2)));
  const [includeTax, setIncludeTax] = useState(settings.include_tax);
  const [allowOversell, setAllowOversell] = useState(settings.allow_oversell);
  const [currency, setCurrency] = useState(settings.currency);
  const [transferMethods, setTransferMethods] = useState<string[]>(
    () => settings.transfer_methods_enabled ?? DEFAULT_TRANSFER_METHODS
  );
  const [saved, setSaved] = useState(false);

  const toggleTransferMethod = (id: string) => {
    setSaved(false);
    setTransferMethods((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const pct = parseFloat(taxPercent);
    const rate = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) / 100 : 0;
    const ok = await saveSettings({
      tax_rate: Math.round(rate * 10000) / 10000,
      include_tax: includeTax,
      allow_oversell: allowOversell,
      currency,
      transfer_methods_enabled: transferMethods,
    });
    if (ok) setSaved(true);
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      <ToggleSetting
        title="Desglosar IVA"
        description="Actívalo si tu negocio es responsable de IVA. El precio que pagas en caja es el mismo en ambos casos: esto solo decide si la venta y el recibo separan la base y el IVA."
        checked={includeTax}
        onChange={(v) => {
          setIncludeTax(v);
          setSaved(false);
        }}
      />

      {includeTax && (
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
              placeholder="19"
              className="w-full px-4 py-3 pr-10 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">%</span>
          </div>
          <p className="text-xs text-on-surface-variant mt-2">
            Los precios de tu catálogo ya incluyen el IVA: esta tasa se usa para extraerlo del
            precio y mostrarlo desglosado. Los clientes marcados como exentos pagan solo la base.
          </p>
        </div>
      )}

      <ToggleSetting
        title="Permitir vender sin stock"
        description={
          allowOversell ? (
            <>
              El punto de venta cobra aunque no queden unidades: avisa al cajero y el stock puede
              quedar en negativo, que es la señal de que hay un conteo pendiente. Conviene cuando el
              inventario del sistema suele ir atrasado respecto al mostrador.
            </>
          ) : (
            <>
              El punto de venta <strong className="text-on-surface">no deja cobrar</strong> un
              producto sin unidades disponibles. Conviene cuando el inventario es confiable y una
              venta sin stock es siempre un error.
            </>
          )
        }
        checked={allowOversell}
        onChange={(v) => {
          setAllowOversell(v);
          setSaved(false);
        }}
      />

      <p className="text-xs text-on-surface-variant -mt-3 px-1 leading-relaxed">
        En cualquiera de los dos casos, los movimientos manuales de inventario nunca pueden dejar el
        stock en negativo: para corregir un conteo usa «Ajustar a».
      </p>

      <Select
        label="Moneda"
        value={currency}
        onChange={(e) => {
          setCurrency(e.target.value);
          setSaved(false);
        }}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </Select>

      <div className="pt-4 border-t border-outline-variant/10 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-on-surface mb-1">Medios de transferencia (Colombia)</h3>
          <p className="text-xs text-on-surface-variant">
            Selecciona los canales de transferencia habilitados para cobro en el POS.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {COLOMBIA_TRANSFER_METHODS.map((m) => {
            const isEnabled = transferMethods.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleTransferMethod(m.id)}
                className={`p-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all ${
                  isEnabled
                    ? "bg-primary/5 border-primary/40 shadow-sm"
                    : "bg-surface-container-low border-outline-variant/15 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${m.bgColor} ${m.borderColor} border`}
                    style={{ color: m.color }}
                  >
                    {m.shortName.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface">{m.name}</p>
                  </div>
                </div>

                <span
                  className={`w-10 h-5 rounded-full relative transition-colors ${
                    isEnabled ? "bg-primary" : "bg-surface-container-highest border border-outline-variant/20"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] w-4 h-4 bg-white rounded-full shadow-sm transition-all ${
                      isEnabled ? "left-[22px]" : "left-[2px]"
                    }`}
                  ></span>
                </span>
              </button>
            );
          })}
        </div>
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

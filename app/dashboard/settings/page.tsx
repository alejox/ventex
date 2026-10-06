"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore } from "@/stores/settings.store";
import { useProfileStore } from "@/stores/profile.store";
import { useProfile } from "@/components/ProfileProvider";
import {
  BUSINESS_OPTIONS,
  MODULES_BY_TYPE,
  effectiveModules,
  type BusinessType,
  type ModuleId,
  type Modules,
} from "@/config/business";
import { cleanModulesForType, modulesForSwitch, navChangeOnSwitch } from "@/lib/business-change";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { Settings } from "@/services/settings.service";
import { COLOMBIA_TRANSFER_METHODS, DEFAULT_TRANSFER_METHODS } from "@/config/transferMethods";
import { COLOMBIA_CARD_METHODS, DEFAULT_CARD_METHODS } from "@/config/cardMethods";
import { Select } from "@/components/ui/Select";
import { CashDrawerCard } from "./CashDrawerCard";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";

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
        <h2 className="text-lg font-bold text-on-surface mb-1">Preferencias del negocio</h2>
        <p className="text-sm text-on-surface-variant mb-8">
          Configura la facturación y cómo se muestran los horarios de tus citas.
        </p>

        {loading && !settings ? (
          <p className="text-sm text-on-surface-variant py-8 text-center">Cargando ajustes…</p>
        ) : settings ? (
          // key fuerza el re-seed del formulario cuando cambian los ajustes cargados.
          <SettingsForm key={settings.id ?? "new"} settings={settings} />
        ) : null}
      </div>

      <CashDrawerCard />

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
  // Se siembra con los módulos EFECTIVOS (lo que el menú muestra hoy), no con
  // los guardados en crudo: para un rubro "full module" un módulo sin valor
  // guardado está encendido, y sembrarlo como apagado lo apagaba al guardar.
  const [modules, setModules] = useState<Modules>(() =>
    effectiveModules(profile?.businessType ?? null, profile?.modules ?? null),
  );
  const [saved, setSaved] = useState(false);
  const { confirm, dialog } = useConfirm();

  // Solo módulos realmente disponibles: un `comingSoon` no se puede encender.
  // Antes esta lista no lo filtraba y el toggle sí persistía en el perfil, así
  // que se podía "activar" un módulo que no existe.
  const available = (MODULES_BY_TYPE[businessType] ?? []).filter((m) => !m.comingSoon);

  const toggle = (id: ModuleId) => {
    setModules((m) => ({ ...m, [id]: !m[id] }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    // Conserva solo los módulos pertinentes al tipo seleccionado.
    const cleaned = cleanModulesForType(modules, businessType);

    // Cambiar de rubro reescribe el menú entero y descarta los módulos que el
    // rubro nuevo no ofrece: no puede pasar sin que el dueño vea qué pierde.
    if (profile && profile.businessType !== businessType) {
      const change = navChangeOnSwitch(
        { businessType: profile.businessType, modules: profile.modules },
        { businessType, modules: cleaned },
      );
      const nextLabel = BUSINESS_OPTIONS.find((b) => b.id === businessType)?.label ?? businessType;
      const ok = await confirm({
        title: `¿Cambiar el negocio a ${nextLabel}?`,
        tone: change.removed.length > 0 ? "danger" : "primary",
        confirmLabel: "Cambiar tipo de negocio",
        description: (
          <>
            {change.added.length === 0 && change.removed.length === 0 ? (
              <p>Las secciones del menú no cambian.</p>
            ) : (
              <>
                {change.added.length > 0 && (
                  <div>
                    <p className="font-semibold text-on-surface">Aparecen en el menú</p>
                    <ul className="mt-1 list-disc pl-5">
                      {change.added.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {change.removed.length > 0 && (
                  <div>
                    <p className="font-semibold text-on-surface">Desaparecen del menú</p>
                    <ul className="mt-1 list-disc pl-5">
                      {change.removed.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <p>
              Tus datos no se borran: si vuelves a este tipo de negocio, las secciones
              reaparecen con lo que tenías.
            </p>
          </>
        ),
      });
      if (!ok) return;
    }

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
          const next = e.target.value as BusinessType;
          setBusinessType(next);
          // Rubro nuevo, módulos de ese rubro: sin esto, los del rubro anterior
          // que el nuevo no ofrece quedaban apagados sin que nadie lo decidiera.
          setModules((m) => modulesForSwitch(m, next));
          setSaved(false);
        }}
      >
        {BUSINESS_OPTIONS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </Select>

      {/* Un rubro puede no tener extras opcionales (la tienda hoy no los tiene):
          en ese caso no se muestra un encabezado sobre una lista vacía. */}
      {available.length > 0 && (
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
      )}

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
      {dialog}
    </form>
  );
}

/** Fila de ajuste con interruptor: título, explicación y toggle a la derecha. */
function ToggleSetting({
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  title: string;
  description: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
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
            disabled={disabled}
            aria-label={title}
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
  const profile = useProfile();
  const canManageShiftRequirement = Boolean(profile && !profile.isWorker);
  const requireActiveShift = useSettingsStore((s) => s.settings?.require_active_shift ?? settings.require_active_shift);
  const saveShiftRequirement = useSettingsStore((s) => s.saveShiftRequirement);
  const [shiftSettingSaved, setShiftSettingSaved] = useState(false);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const submitting = useSettingsStore((s) => s.submitting);
  const error = useSettingsStore((s) => s.error);

  const [taxPercent, setTaxPercent] = useState(() => String(+(settings.tax_rate * 100).toFixed(2)));
  const [includeTax, setIncludeTax] = useState(settings.include_tax);
  const [allowOversell, setAllowOversell] = useState(settings.allow_oversell);
  const [currency, setCurrency] = useState(settings.currency);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(settings.time_format);
  const [transferMethods, setTransferMethods] = useState<string[]>(
    () => settings.transfer_methods_enabled ?? DEFAULT_TRANSFER_METHODS
  );
  const [acceptsTransfer, setAcceptsTransfer] = useState(settings.accepts_transfer);
  const [acceptsCard, setAcceptsCard] = useState(settings.accepts_card);
  const [cardMethods, setCardMethods] = useState<string[]>(
    () => settings.card_methods_enabled ?? DEFAULT_CARD_METHODS
  );
  const [saved, setSaved] = useState(false);

  const toggleTransferMethod = (id: string) => {
    setSaved(false);
    setTransferMethods((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const toggleCardMethod = (id: string) => {
    setSaved(false);
    setCardMethods((prev) =>
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
      time_format: timeFormat,
      transfer_methods_enabled: transferMethods,
      accepts_transfer: acceptsTransfer,
      accepts_card: acceptsCard,
      card_methods_enabled: cardMethods,
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

      <div className="space-y-3 pb-6 border-b border-outline-variant/10">
        <h3 className="text-sm font-bold text-on-surface">Calendario y citas</h3>
        <Select label="Formato horario" value={timeFormat} onChange={(e) => {
          setTimeFormat(e.target.value as TimeFormat);
          setSaved(false);
        }}>
          <option value="12">12 horas (AM / PM)</option>
          <option value="24">24 horas</option>
        </Select>
        <p className="text-sm text-on-surface-variant">
          Ejemplo: {formatAppointmentTime("09:00", timeFormat)} y {formatAppointmentTime("14:30", timeFormat)}.
          Se aplica a la agenda y a la confirmación por WhatsApp. Por defecto usamos 12 horas.
        </p>
      </div>

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

      {canManageShiftRequirement && <div className="space-y-2"><ToggleSetting
        title="Exigir turno activo para facturar"
        description={requireActiveShift
          ? "El cajero debe abrir su turno antes de cobrar una venta o una cita."
          : "El cajero puede facturar sin abrir turno. Las ventas sin turno no se incluyen en un arqueo de caja."}
        checked={requireActiveShift}
        disabled={submitting}
        onChange={async (value) => {
          setShiftSettingSaved(false);
          if (await saveShiftRequirement(value)) setShiftSettingSaved(true);
        }}
      />
        <p className="px-1 text-xs text-on-surface-variant" role="status">
          {submitting ? "Guardando…" : shiftSettingSaved ? "Cambio guardado. Se aplica al abrir o actualizar el punto de venta." : "Este ajuste se guarda automáticamente al cambiarlo."}
        </p>
      </div>}

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

      <ToggleSetting
        title="Cobrar por transferencia"
        description={
          acceptsTransfer ? (
            <>
              El punto de venta ofrece «Transferencia» como forma de pago. Apágalo si tu negocio solo
              recibe efectivo: la opción desaparece del cobro.
            </>
          ) : (
            <>
              «Transferencia» <strong className="text-on-surface">no aparece</strong> entre las formas
              de pago. Las ventas ya cobradas por transferencia siguen intactas en el historial.
            </>
          )
        }
        checked={acceptsTransfer}
        onChange={(v) => {
          setAcceptsTransfer(v);
          setSaved(false);
        }}
      />

      {acceptsTransfer && (
      <div className="pt-4 border-t border-outline-variant/10 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-on-surface mb-1">Medios de transferencia (Colombia)</h3>
          <p className="text-xs text-on-surface-variant">
            Selecciona los canales que usas. Si no marcas ninguno, el POS no pregunta por cuál
            entró la plata — es lo normal cuando el negocio tiene una sola cuenta.
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
      )}

      <ToggleSetting
        title="Cobrar con datáfono"
        description={
          acceptsCard ? (
            <>
              El punto de venta ofrece «Datáfono» como forma de pago. Apágalo si tu negocio solo
              recibe efectivo y transferencias: la opción desaparece del cobro.
            </>
          ) : (
            <>
              «Datáfono» <strong className="text-on-surface">no aparece</strong> entre las formas de
              pago. Las ventas ya cobradas con tarjeta siguen intactas en el historial.
            </>
          )
        }
        checked={acceptsCard}
        onChange={(v) => {
          setAcceptsCard(v);
          setSaved(false);
        }}
      />

      {acceptsCard && (
      <div className="pt-4 border-t border-outline-variant/10 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-on-surface mb-1">Medios de tarjeta (Colombia)</h3>
          <p className="text-xs text-on-surface-variant">
            Selecciona los datáfonos que usas. Si no marcas ninguno, el POS no pregunta cuál se
            usó — es lo normal cuando el negocio tiene uno solo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {COLOMBIA_CARD_METHODS.map((m) => {
            const isEnabled = cardMethods.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleCardMethod(m.id)}
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
      )}

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

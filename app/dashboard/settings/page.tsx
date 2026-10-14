"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useProfile } from "@/components/ProfileProvider";
import { useSettingsStore } from "@/stores/settings.store";
import type { Settings } from "@/services/settings.service";
import { Select } from "@/components/ui/Select";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";
import { Switch } from "@/components/ui/Switch";

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

    </div>
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
        <Switch
          aria-label={title}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
          className="shrink-0"
        />
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
  const ownerUsesShifts = useSettingsStore((s) => s.settings?.owner_uses_shifts ?? settings.owner_uses_shifts);
  const saveOwnerUsesShifts = useSettingsStore((s) => s.saveOwnerUsesShifts);
  const [ownerShiftSaving, setOwnerShiftSaving] = useState(false);
  const [ownerShiftSaved, setOwnerShiftSaved] = useState(false);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const submitting = useSettingsStore((s) => s.submitting);
  const error = useSettingsStore((s) => s.error);

  const [allowOversell, setAllowOversell] = useState(settings.allow_oversell);
  const [currency, setCurrency] = useState(settings.currency);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(settings.time_format);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    // Sin `tax_rate`/`include_tax` ni medios de pago: el IVA se guarda solo
    // desde Datos de tu negocio y los medios desde Métodos de pago; mandarlos
    // acá pisaría esos cambios con valores viejos.
    const ok = await saveSettings({
      allow_oversell: allowOversell,
      currency,
      time_format: timeFormat,
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

      <p className="text-sm text-on-surface-variant">
        El IVA se configura en{" "}
        <Link href="/dashboard/settings/business" className="font-semibold text-primary hover:underline">
          Datos de tu negocio
        </Link>
        {" "}y la transferencia y el datáfono, en{" "}
        <Link href="/dashboard/settings/pagos" className="font-semibold text-primary hover:underline">
          Métodos de pago
        </Link>
        .
      </p>

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
          {submitting && !ownerShiftSaving ? "Guardando…" : shiftSettingSaved ? "Cambio guardado. Se aplica al abrir o actualizar el punto de venta." : "Este ajuste se guarda automáticamente al cambiarlo."}
        </p>
      </div>}

      {canManageShiftRequirement && <div className="space-y-2"><ToggleSetting
        title="Abrir caja como administrador"
        description={ownerUsesShifts
          ? "Te pedimos abrir caja al entrar al punto de venta; puedes iniciar sin abrirla. Con caja abierta registras retiros y cierras con arqueo."
          : "Vendes sin caja, como hasta ahora. Actívalo para abrir tu propia caja, registrar retiros y cerrar con arqueo."}
        checked={ownerUsesShifts}
        disabled={submitting}
        onChange={async (value) => {
          setOwnerShiftSaved(false);
          setOwnerShiftSaving(true);
          const ok = await saveOwnerUsesShifts(value);
          setOwnerShiftSaving(false);
          if (ok) setOwnerShiftSaved(true);
        }}
      />
        <p className="px-1 text-xs text-on-surface-variant" role="status">
          {ownerShiftSaving ? "Guardando…" : ownerShiftSaved ? "Cambio guardado. Se aplica al abrir o actualizar el punto de venta." : "Aplica a ti y a los administradores del negocio."}
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

      <div className="flex items-center justify-between gap-4 pt-6 mt-4 border-t border-outline-variant/10">
        <span className={`text-sm font-medium text-success transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          ✓ Ajustes guardados
        </span>
        <button
          type="submit"
          disabled={submitting}
          className="py-3 px-6 rounded-xl bg-primary text-on-primary hover:bg-primary-dim text-sm font-bold shadow-lg shadow-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Guardando…" : "Guardar Cambios"}
        </button>
      </div>
    </form>
  );
}

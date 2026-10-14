"use client";

import React, { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settings.store";
import type { Settings } from "@/services/settings.service";
import { COLOMBIA_TRANSFER_METHODS, DEFAULT_TRANSFER_METHODS } from "@/config/transferMethods";
import { COLOMBIA_CARD_METHODS, DEFAULT_CARD_METHODS } from "@/config/cardMethods";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";

/**
 * Ajustes → Métodos de pago: qué formas de cobro ofrece el POS además del
 * efectivo. Vivía dentro de General; se movió tal cual (mismo comportamiento y
 * copy) para que "Primeros pasos" pueda apuntar a una sección propia.
 *
 * Guardar estampa `payment_methods_configured_at` (ver `savePaymentMethods`):
 * un negocio que deja solo efectivo también completa el paso. El acceso lo
 * decide el layout de Ajustes, igual que General.
 */
export default function PaymentMethodsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-on-surface mb-1">Métodos de pago</h2>
        <p className="text-sm text-on-surface-variant mb-8">
          El efectivo siempre está disponible. Elige qué otras formas de pago ofrece el punto de venta.
        </p>

        {loading && !settings ? (
          <p className="text-sm text-on-surface-variant py-8 text-center">Cargando ajustes…</p>
        ) : settings ? (
          // key fuerza el re-seed del formulario cuando cambian los ajustes cargados.
          <PaymentMethodsForm key={settings.id ?? "new"} settings={settings} />
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
        <Switch aria-label={title} checked={checked} onCheckedChange={onChange} className="shrink-0" />
      </div>
    </div>
  );
}

interface MethodOption {
  id: string;
  name: string;
  shortName: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

/** Grilla de medios (transferencia o datáfono) que se encienden con un toque. */
function MethodGrid({
  options,
  enabled,
  onToggle,
}: {
  options: MethodOption[];
  enabled: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((m) => {
        const isEnabled = enabled.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onToggle(m.id)}
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
  );
}

function PaymentMethodsForm({ settings }: { settings: Settings }) {
  const savePaymentMethods = useSettingsStore((s) => s.savePaymentMethods);
  const submitting = useSettingsStore((s) => s.submitting);
  const error = useSettingsStore((s) => s.error);

  const [transferMethods, setTransferMethods] = useState<string[]>(
    () => settings.transfer_methods_enabled ?? DEFAULT_TRANSFER_METHODS
  );
  const [acceptsTransfer, setAcceptsTransfer] = useState(settings.accepts_transfer);
  const [acceptsCard, setAcceptsCard] = useState(settings.accepts_card);
  const [cardMethods, setCardMethods] = useState<string[]>(
    () => settings.card_methods_enabled ?? DEFAULT_CARD_METHODS
  );
  const [saved, setSaved] = useState(false);

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) => {
    setSaved(false);
    setter((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const ok = await savePaymentMethods({
      accepts_transfer: acceptsTransfer,
      transfer_methods_enabled: transferMethods,
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
          <MethodGrid
            options={COLOMBIA_TRANSFER_METHODS}
            enabled={transferMethods}
            onToggle={toggleIn(setTransferMethods)}
          />
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
          <MethodGrid options={COLOMBIA_CARD_METHODS} enabled={cardMethods} onToggle={toggleIn(setCardMethods)} />
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-6 mt-4 border-t border-outline-variant/10">
        <span className={`text-sm font-medium text-success transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          ✓ Métodos de pago guardados
        </span>
        <Button type="submit" loading={submitting} loadingLabel="Guardando…">
          Guardar
        </Button>
      </div>
    </form>
  );
}

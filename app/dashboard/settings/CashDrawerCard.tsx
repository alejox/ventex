"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/Select";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications";
import { useCashDrawerStore } from "@/stores/cash-drawer.store";
import { canKickWith, DRAWER_BAUD_RATES, type DrawerTransportChoice } from "@/lib/cash-drawer";

const TRANSPORT_NAME: Record<string, string> = {
  serial: "puerto serie",
  usb: "USB directo",
  print: "impresión",
};

/**
 * Configuración del cajón monedero.
 *
 * Vive en Ajustes pero NO se guarda en la base, y el cartel lo dice: el permiso
 * del dispositivo lo recuerda este navegador y el cable está enchufado a esta
 * máquina. Un negocio con dos terminales configura cada una por separado, que
 * es lo correcto — la de atrás no tiene cajón.
 */
export function CashDrawerCard() {
  const config = useCashDrawerStore((s) => s.config);
  const caps = useCashDrawerStore((s) => s.caps);
  const authorized = useCashDrawerStore((s) => s.authorized);
  const pairing = useCashDrawerStore((s) => s.pairing);
  const hydrated = useCashDrawerStore((s) => s.hydrated);
  const init = useCashDrawerStore((s) => s.init);
  const setConfig = useCashDrawerStore((s) => s.setConfig);
  const pair = useCashDrawerStore((s) => s.pair);
  const kick = useCashDrawerStore((s) => s.kick);

  const [testing, setTesting] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  const handlePair = async (transport: "serial" | "usb") => {
    const ok = await pair(transport);
    if (ok) {
      notifySuccess("Impresora conectada", "Probá el cajón para confirmar que abre.");
    } else {
      const error = useCashDrawerStore.getState().error;
      if (error) notifyError("No se pudo conectar", error);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    const worked = await kick();
    setTesting(false);
    if (worked === "print") {
      // La impresión no puede confirmar nada: el navegador no sabe si el
      // trabajo llegó ni si el driver disparó el pulso.
      notifyWarning(
        "Trabajo de impresión enviado",
        "Si el cajón no abrió, falta activar la apertura en las opciones del driver de la impresora.",
      );
    } else if (worked) {
      notifySuccess(
        `Pulso enviado por ${TRANSPORT_NAME[worked]}`,
        "Si el cajón no abrió, probá cambiando el pin.",
      );
    } else {
      notifyError("El cajón no respondió", useCashDrawerStore.getState().error ?? "");
    }
  };

  const usesSerial = config.transport === "auto" || config.transport === "serial";
  const usesUsb = config.transport === "auto" || config.transport === "usb";
  const canTest = caps !== null && canKickWith(config, caps, authorized);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm mb-6">
      <h2 className="text-lg font-bold text-on-surface mb-1">Cajón monedero</h2>
      <p className="text-sm text-on-surface-variant mb-6">
        El cajón cuelga de la impresora por el cable RJ11. Configurado acá, Ventex le manda el
        pulso de apertura al cobrar, sin necesidad de imprimir el recibo.{" "}
        <strong className="text-on-surface">Esta configuración es de este dispositivo</strong>, no
        de tu negocio: si vendés desde otra terminal, configurala también ahí.
      </p>

      {!hydrated || !caps ? (
        <p className="text-sm text-on-surface-variant py-4">Revisando el dispositivo…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {!caps.secure && (
            <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4">
              <p className="text-sm font-semibold text-on-surface mb-1">
                Hace falta una conexión segura
              </p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Hablarle directo a la impresora solo funciona por https. Entrá al panel con la
                dirección segura y volvé a esta pantalla. Mientras tanto, la apertura por impresión
                sigue disponible.
              </p>
            </div>
          )}

          <Select
            label="Cómo se comunica con la impresora"
            value={config.transport}
            onChange={(e) => setConfig({ transport: e.target.value as DrawerTransportChoice })}
            hint={
              config.transport === "print"
                ? "Manda un trabajo de impresión en blanco para que el driver dispare el cajón. Gasta un pedazo de papel y abre el diálogo de impresión."
                : "Automático prueba las vías silenciosas: primero el puerto serie, después USB. Nunca imprime."
            }
          >
            <option value="auto">Automático (recomendado)</option>
            <option value="serial">Puerto serie / COM</option>
            <option value="usb">USB directo</option>
            <option value="print">Por impresión (impresoras con driver)</option>
          </Select>

          {config.transport === "print" ? (
            <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4">
              <p className="text-sm font-semibold text-on-surface mb-1">
                Dos cosas que tenés que saber
              </p>
              <ul className="text-xs text-on-surface-variant leading-relaxed list-disc pl-4 space-y-1">
                <li>
                  El pulso lo mete el driver, no Ventex: en sus opciones tiene que estar activada la
                  apertura de cajón al imprimir. Si tu cajón ya abría al imprimir recibos, ya está.
                </li>
                <li>
                  El navegador abre el diálogo de impresión en cada venta. Para que salga solo, hay
                  que iniciar Chrome con la opción <code>--kiosk-printing</code> y dejar la
                  impresora como predeterminada.
                </li>
              </ul>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {usesSerial && (
                <PairRow
                  title="Puerto serie / COM"
                  ready={authorized.serial > 0}
                  available={caps.serial}
                  unavailable="Necesita Chrome, Edge u Opera de escritorio, por https."
                  pairing={pairing}
                  onPair={() => handlePair("serial")}
                />
              )}
              {usesUsb && (
                <PairRow
                  title="USB directo"
                  ready={authorized.usb > 0}
                  available={caps.usb}
                  unavailable="Necesita Chrome, Edge u Opera de escritorio, por https."
                  pairing={pairing}
                  onPair={() => handlePair("usb")}
                />
              )}
            </div>
          )}

          <div className="rounded-2xl border border-outline-variant/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-on-surface">
                  Abrir el cajón al terminar la venta
                </h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Se abre apenas se cobra, imprimas el recibo o no. Apagalo si preferís abrirlo a
                  mano desde el botón del punto de venta.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.autoOpenOnSale}
                  onChange={(e) => setConfig({ autoOpenOnSale: e.target.checked })}
                />
                <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>

          {config.transport !== "print" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Pin del cajón"
                value={String(config.pin)}
                onChange={(e) => setConfig({ pin: e.target.value === "5" ? 5 : 2 })}
                hint="Si el cajón no abre, probá con el otro."
              >
                <option value="2">Pin 2 (el habitual)</option>
                <option value="5">Pin 5</option>
              </Select>
              <Select
                label="Velocidad del puerto"
                value={String(config.baudRate)}
                onChange={(e) => setConfig({ baudRate: Number(e.target.value) })}
                hint="La que trae la impresora de fábrica suele ser 9600. Solo aplica al puerto serie."
              >
                {DRAWER_BAUD_RATES.map((rate) => (
                  <option key={rate} value={String(rate)}>
                    {rate}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleTest}
              disabled={!canTest || testing}
              className="px-4 py-2 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50"
            >
              {testing ? "Enviando…" : "Probar cajón"}
            </button>
            {config.lastWorking && (
              <span className="text-xs text-on-surface-variant">
                La última vez abrió por {TRANSPORT_NAME[config.lastWorking]}.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PairRow({
  title,
  ready,
  available,
  unavailable,
  pairing,
  onPair,
}: {
  title: string;
  ready: boolean;
  available: boolean;
  unavailable: string;
  pairing: boolean;
  onPair: () => void;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
          {!available ? unavailable : ready ? "Conectada." : "Sin conectar."}
        </p>
      </div>
      <button
        type="button"
        onClick={onPair}
        disabled={!available || pairing}
        className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 self-start"
      >
        {pairing ? "Elegí el dispositivo…" : ready ? "Cambiar" : "Conectar"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";

export interface PricePair {
  /** Base imponible, sin IVA. */
  base: string;
  /** Precio final, con IVA incluido. */
  total: string;
}

export interface PricePairSetters {
  /** El usuario escribió la base: el total se recalcula. */
  fromBase: (base: string) => void;
  /** El usuario escribió el total: la base se despeja hacia atrás. */
  fromTotal: (total: string) => void;
}

/**
 * Par base/total ligado por el IVA, editable por los dos lados.
 *
 * Es el motor reversible: escribir la base suma el impuesto, escribir el total
 * lo extrae (`base = total / (1 + tasa)`). No hay modo que elegir — el modo era
 * una pregunta que el sistema le hacía al usuario pudiendo deducir la respuesta
 * de dónde está escribiendo.
 *
 * Se guardan los DOS strings en vez de derivar uno del otro: si el total se
 * recalculara desde la base en cada tecla, teclear "50000" en el total lo
 * reescribiría a mitad de camino ("5" -> base 4.2 -> total 5 -> "50"...) y el
 * campo pelearía contra el usuario.
 */
export function usePricePair(multiplier: number): [PricePair, PricePairSetters] {
  const [pair, setPair] = useState<PricePair>({ base: "", total: "" });
  const [lastMultiplier, setLastMultiplier] = useState(multiplier);

  // Cambió la tasa (o se apagó el IVA): el total se rehace desde la base.
  // Se ajusta DURANTE el render —patrón oficial de React para estado derivado
  // de una entrada que cambió— y no en un efecto, que agregaría un render extra
  // mostrando por un instante el total viejo con la tasa nueva.
  if (lastMultiplier !== multiplier) {
    setLastMultiplier(multiplier);
    setPair((p) => ({ base: p.base, total: applyRate(p.base, multiplier) }));
  }

  const setters: PricePairSetters = {
    fromBase: (base) => setPair({ base, total: applyRate(base, multiplier) }),
    fromTotal: (total) => setPair({ base: extractRate(total, multiplier), total }),
  };

  return [pair, setters];
}

function applyRate(base: string, multiplier: number): string {
  const value = parseFloat(base);
  if (base === "" || !Number.isFinite(value)) return "";
  return money(value * multiplier);
}

function extractRate(total: string, multiplier: number): string {
  const value = parseFloat(total);
  if (total === "" || !Number.isFinite(value)) return "";
  return money(value / multiplier);
}

/** Redondea a centavos y suelta los ceros de más: 11900.00 -> "11900". */
function money(value: number): string {
  return String(Math.round(value * 100) / 100);
}

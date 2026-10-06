"use client";

import { useMemo } from "react";
import { useSettingsStore } from "@/stores/settings.store";
import { moneyFormatter, normalizeCurrency, type MoneyFormatter } from "@/lib/money";
import type { Settings } from "@/services/settings.service";

/**
 * La moneda del negocio (`settings.currency`) para toda la UI del dashboard.
 *
 * Lee el store de settings, que el shell (`DashboardShell`) carga una sola vez
 * con `ensureSettings()`: ninguna pantalla tiene que pedir nada para mostrar
 * montos en la moneda correcta. Mientras no cargó —o si el negocio nunca abrió
 * Ajustes— cae a COP, que es lo que se mostraba antes de esto.
 */
export const selectCurrency = (state: { settings: Pick<Settings, "currency"> | null }): string =>
  normalizeCurrency(state.settings?.currency);

/** Código ISO de la moneda del negocio (COP por defecto). */
export function useCurrency(): string {
  return useSettingsStore(selectCurrency);
}

/**
 * `formatMoney` atado a la moneda del negocio. Estable mientras la moneda no
 * cambie, así que se puede pasar a `useMemo`/columnas sin re-renders de más.
 */
export function useFormatMoney(): MoneyFormatter {
  const currency = useCurrency();
  return useMemo(() => moneyFormatter(currency), [currency]);
}

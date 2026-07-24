"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings.store";

export interface BusinessTax {
  /**
   * Tasa EFECTIVA para VENDER: 0 si el negocio no es responsable de IVA.
   * Es la que va en los precios del catálogo.
   */
  rate: number;
  /**
   * Tasa configurada, TAL CUAL, sin importar si el negocio factura con IVA.
   *
   * Es la que hay que usar del lado de las COMPRAS: un negocio no responsable
   * igual paga IVA a sus proveedores — lo que no puede es descontarlo. Usar
   * `rate` ahí haría desaparecer un impuesto que sí se pagó.
   */
  rawRate: number;
  /** Si el negocio desglosa IVA en sus ventas (responsable). */
  includeTax: boolean;
  /** La tasa efectiva para mostrar, ya formateada: "19%", "5%". */
  percentLabel: string;
  /** La tasa configurada para mostrar, se use o no en las ventas. */
  rawPercentLabel: string;
}

/**
 * Tasa de IVA del negocio para los formularios de precios.
 *
 * Existe porque el 19% estaba escrito a mano en el alta de productos mientras el
 * cobro leía `settings.tax_rate` de la base: un negocio con IVA del 5% etiquetaba
 * sus productos con la tasa de otro. El default 0.19 es el mismo que usan
 * `create_sale` y `fetchPosConfig`; si cambia uno, cambian los tres.
 *
 * Cuando el negocio no es responsable de IVA la tasa efectiva es 0, igual que en
 * la primera rama de `computeTotals`: sin IVA cobrado no hay IVA que etiquetar.
 */
export function useBusinessTax(): BusinessTax {
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    if (!settings) fetchSettings();
  }, [settings, fetchSettings]);

  const includeTax = settings?.include_tax ?? true;
  const rawRate = settings?.tax_rate ?? 0.19;
  const rate = includeTax ? rawRate : 0;

  return {
    rate,
    rawRate,
    includeTax,
    percentLabel: `${+(rate * 100).toFixed(2)}%`,
    rawPercentLabel: `${+(rawRate * 100).toFixed(2)}%`,
  };
}

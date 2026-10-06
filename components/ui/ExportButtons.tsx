"use client";

import { IconDownload } from "@/app/assets/icons/DashboardIcons";

/**
 * "Exportar CSV" y "Excel" (F11). Lo mismo en Ventas, Gastos, Facturación y
 * Reportes: lo que se descarga es lo que la pantalla muestra con sus filtros
 * activos. La generación vive en `lib/export.ts`; esto solo dispara.
 *
 * Vive junto a Reportes porque es la pantalla de exportación por excelencia;
 * las otras tres lo importan de acá.
 */
export function ExportButtons({
  disabled = false,
  busy = false,
  onExport,
  label = "Exportar CSV",
}: {
  disabled?: boolean;
  /** Generando el Excel (exceljs se carga recién al tocarlo). */
  busy?: boolean;
  onExport: (kind: "csv" | "xlsx") => void;
  label?: string;
}) {
  const cls =
    "inline-flex min-h-10 items-center justify-center gap-2 px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface text-sm font-semibold hover:bg-surface-container-high transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Exportar">
      <button type="button" className={cls} disabled={disabled || busy} onClick={() => onExport("csv")}>
        <IconDownload className="w-4 h-4" />
        {label}
      </button>
      <button
        type="button"
        className={cls}
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={() => onExport("xlsx")}
        aria-label="Exportar a Excel"
      >
        {busy ? "Generando…" : "Excel"}
      </button>
    </div>
  );
}

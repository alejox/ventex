"use client";

import { useEffect, useState } from "react";
import { useStaffStore } from "@/stores/staff.store";
import type { HaircutByStaff } from "@/services/staff.service";
import { commissionPeriodOf, currentMonthPeriod } from "@/services/staff.service";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { IconUsers } from "@/app/assets/icons/DashboardIcons";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Cortes por barbero: producción, no plata.
 *
 * Es el reporte que contesta "¿quién está trabajando?", y por eso vive al lado
 * de Comisiones pero NO adentro. Comisiones contesta "¿cuánto le debo?": son
 * pesos, congelados al vender, y solo de lo que comisiona. Un barbero que hace
 * treinta cortes con comisión en cero aparece acá primero y allá en el último
 * lugar — y las dos lecturas son correctas, cada una para su pregunta.
 *
 * El período es abierto (no "el mes en curso" como Comisiones) porque acá la
 * comparación entre quincenas o meses ES el uso: un número de cortes suelto no
 * dice nada; contra el mes pasado, dice todo.
 */
export default function HaircutsPage() {
  const haircuts = useStaffStore((s) => s.haircuts);
  const loading = useStaffStore((s) => s.haircutsLoading);
  const fetchHaircuts = useStaffStore((s) => s.fetchHaircuts);
  const error = useStaffStore((s) => s.error);

  // Arranca en el mes en curso, que es el período que la gente mira por defecto.
  // Inicializador perezoso: `currentMonthPeriod()` lee el reloj, y llamarlo en
  // cada render es una función impura en el cuerpo del componente.
  const [rango, setRango] = useState(() => {
    const mes = currentMonthPeriod();
    return { from: mes.from, to: mes.to };
  });
  const { from, to } = rango;

  useEffect(() => {
    // Un rango invertido no es un error del que haya que avisar: es el estado
    // intermedio de alguien tipeando la fecha. Se ignora hasta que cierre.
    if (from <= to) fetchHaircuts(commissionPeriodOf(from, to));
  }, [from, to, fetchHaircuts]);

  const totalCortes = haircuts.reduce((s, h) => s + h.cortes, 0);
  const totalVendido = haircuts.reduce((s, h) => s + h.vendido, 0);
  const lider = haircuts[0] ?? null;

  const columns: DataColumn<HaircutByStaff>[] = [
    {
      header: "Miembro",
      mobile: "title",
      className: "pl-6 font-medium text-on-surface",
      headerClassName: "pl-6",
      cell: (h) => h.full_name,
    },
    {
      header: "Cortes",
      align: "right",
      mobile: "trailing",
      className: "font-bold tabular-nums text-on-surface",
      cell: (h) => h.cortes,
    },
    {
      // Participación: el número que convierte "18 cortes" en "casi la mitad
      // del local". Sin él, cada fila se lee sola y no dice nada del equipo.
      header: "Del total",
      align: "right",
      className: "text-on-surface-variant tabular-nums",
      cell: (h) => (totalCortes > 0 ? `${Math.round((h.cortes / totalCortes) * 100)}%` : "—"),
    },
    {
      header: "Clientes",
      align: "center",
      className: "text-on-surface-variant tabular-nums",
      cell: (h) => h.clientes,
    },
    {
      header: "Ventas",
      align: "center",
      className: "text-on-surface-variant tabular-nums",
      cell: (h) => h.ventas,
    },
    {
      header: "Vendido",
      align: "right",
      mobile: "field",
      className: "pr-6 text-on-surface-variant tabular-nums",
      headerClassName: "pr-6",
      cell: (h) => `$${money(h.vendido)}`,
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Cortes</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Cuántos cortes hizo cada quien en el período. Cuenta los servicios que elegiste en
          Configuración → Promociones, los mismos que le suman al contador del cliente.
        </p>
      </div>

      {error && <CollectionError message={error} onRetry={() => fetchHaircuts(commissionPeriodOf(from, to))} />}

      <div className="bg-surface-container rounded-2xl p-4 border border-outline-variant/10 shadow-sm flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-on-surface-variant">Desde</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setRango((r) => ({ ...r, from: e.target.value }))}
            className="px-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-sm text-on-surface focus:outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-on-surface-variant">Hasta</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setRango((r) => ({ ...r, to: e.target.value }))}
            className="px-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-sm text-on-surface focus:outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={() => {
            const mes = currentMonthPeriod();
            setRango({ from: mes.from, to: mes.to });
          }}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-primary bg-primary/10 hover:bg-primary hover:text-on-primary transition-colors"
        >
          Este mes
        </button>
      </div>

      {/* Mientras recarga, las tarjetas NO muestran el total anterior.
          Al cambiar el rango la tabla pasa a "Contando…" pero los KPI seguían
          firmes con los números del período viejo: un total afirmado con toda
          confianza sobre fechas que ya no son las de la pantalla. Dura poco en
          local y bastante más con red lenta, que es justo cuando alguien
          alcanza a leerlo y a creerlo. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-on-surface-variant text-sm font-medium mb-1">Cortes del período</p>
          <h3 className="text-3xl font-bold text-on-surface tracking-tight tabular-nums">
            {loading ? <span className="text-on-surface-variant/40">—</span> : totalCortes}
          </h3>
        </div>
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-on-surface-variant text-sm font-medium mb-1">Facturado en cortes</p>
          <h3 className="text-3xl font-bold text-on-surface tracking-tight tabular-nums">
            {loading ? <span className="text-on-surface-variant/40">—</span> : `$${money(totalVendido)}`}
          </h3>
        </div>
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-on-surface-variant text-sm font-medium mb-1">Quien más cortó</p>
          <h3 className="text-xl font-bold text-on-surface tracking-tight truncate">
            {loading ? <span className="text-on-surface-variant/40">—</span> : lider ? lider.full_name : "—"}
          </h3>
          {!loading && lider && (
            <p className="text-xs text-on-surface-variant mt-0.5 tabular-nums">
              {lider.cortes} corte{lider.cortes !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-low">
          <h2 className="text-sm font-bold text-on-surface">Por miembro</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Solo ventas completadas y atribuidas a alguien del equipo. Las anuladas no cuentan.
          </p>
        </div>
        {loading ? (
          <CollectionLoading label="Contando…" />
        ) : haircuts.length === 0 ? (
          <CollectionEmpty
            icon={<IconUsers className="w-8 h-8" />}
            title="Sin cortes en este período"
            description="Aparecen acá cuando vendas alguno de los servicios que cuentan y la venta quede atribuida a un miembro del equipo con 'Atendido por'. Si nunca elegiste servicios en Configuración → Promociones, no hay nada que contar."
          />
        ) : (
          <DataTable
            rows={haircuts}
            rowKey={(h) => h.staff_id}
            minWidth={680}
            caption="Cortes por miembro del equipo"
            columns={columns}
          />
        )}
      </div>
    </div>
  );
}

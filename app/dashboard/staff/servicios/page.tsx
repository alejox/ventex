"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStaffStore } from "@/stores/staff.store";
import type { ServicesByStaff } from "@/services/staff.service";
import { commissionPeriodOf, currentMonthPeriod } from "@/services/staff.service";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { IconUsers } from "@/app/assets/icons/DashboardIcons";
import { formatMoney } from "@/lib/money";

const CATALOG_URL = "/dashboard/inventory";
/** Counts completed service quantities separately from commission payments. */
export default function ServicesActivityPage() {
  const servicesReport = useStaffStore((s) => s.servicesReport);
  const loading = useStaffStore((s) => s.servicesReportLoading);
  const services = useStaffStore((s) => s.reportServices);
  const unassigned = useStaffStore((s) => s.servicesUnassigned);
  const fetchServicesReport = useStaffStore((s) => s.fetchServicesReport);
  const error = useStaffStore((s) => s.servicesReportError);
  const [showDetails, setShowDetails] = useState(false);
  const [range, setRange] = useState(() => {
    const month = currentMonthPeriod();
    return { from: month.from, to: month.to };
  });
  const { from, to } = range;
  const validRange = !!from && !!to && from <= to;

  useEffect(() => {
    if (from && to && from <= to) void fetchServicesReport(commissionPeriodOf(from, to));
  }, [from, to, fetchServicesReport]);

  const assigned = servicesReport.reduce((sum, row) => sum + row.services, 0);
  const hasCatalog = !!services?.length;
  const ready = !loading && !error && validRange && hasCatalog;

  function selectMonth(previous = false) {
    if (!previous) {
      const month = currentMonthPeriod();
      setRange({ from: month.from, to: month.to });
      return;
    }
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    setRange({ from: date(first), to: date(last) });
  }

  const columns: DataColumn<ServicesByStaff>[] = [
    { header: "Persona", mobile: "title", className: "pl-6 font-medium text-on-surface", headerClassName: "pl-6", cell: (row) => row.full_name },
    { header: "Servicios", align: "right", mobile: "trailing", className: "font-bold tabular-nums text-on-surface", cell: (row) => row.services },
    { header: "Participación", align: "right", className: "pr-6 tabular-nums text-on-surface-variant", headerClassName: "pr-6", cell: (row) => assigned ? `${Math.round(row.services / assigned * 100)}%` : "—" },
  ];
  if (showDetails) columns.push(
    { header: "Ventas", align: "center", mobile: "detail", cell: (row) => row.ventas },
    { header: "Clientes estimados", align: "center", mobile: "detail", cell: (row) => row.clientes },
    { header: "Valor antes de descuentos", align: "right", mobile: "detail", className: "pr-6 tabular-nums", headerClassName: "pr-6", cell: (row) => formatMoney(row.vendido) },
  );

  return (
    <div className="flex w-full flex-col gap-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-on-surface">Servicios por persona</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Consultá cuántos servicios registró cada integrante del equipo en el período seleccionado.</p>
        <p className="mt-2 text-xs text-on-surface-variant">Incluye servicios con y sin comisión. Para consultar cuánto pagar, abrí <Link href="/dashboard/staff/comisiones" className="font-semibold text-primary underline underline-offset-2">Comisiones</Link>.</p>
      </header>

      <section aria-label="Qué cuenta en este reporte" className="rounded-2xl border border-outline-variant/20 bg-surface-container p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-on-surface">Qué cuenta en este reporte</h2>
          <Link href={CATALOG_URL} className="rounded-lg border border-outline-variant/30 px-3 py-2 text-sm font-semibold text-primary">Ver catálogo de servicios</Link>
        </div>
        {loading ? <p className="mt-3 text-sm text-on-surface-variant">Consultando servicios…</p> : error ? <p className="mt-3 text-sm text-on-surface-variant">No pudimos consultar los servicios. Reintentá la consulta.</p> : hasCatalog ? <p className="mt-3 text-sm text-on-surface-variant">Se cuentan todos los servicios vendidos, según la cantidad registrada y la persona que los atendió. Los productos quedan fuera.</p> : <p className="mt-3 text-sm text-on-surface-variant">Todavía no tenés servicios en tu catálogo.</p>}
        <p className="mt-3 text-xs text-on-surface-variant">El reporte se alimenta del Punto de venta. Al vender un servicio, asigná quién lo atendió; puede ser una persona distinta en cada línea de la venta.</p>
      </section>

      <section aria-label="Período del reporte" className="flex flex-wrap items-end gap-4 rounded-2xl border border-outline-variant/10 bg-surface-container p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-on-surface-variant">Desde</span>
          <input type="date" value={from} max={to || undefined} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-on-surface-variant">Hasta</span>
          <input type="date" value={to} min={from || undefined} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary" />
        </label>
        <button type="button" onClick={() => selectMonth()} className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">Este mes</button>
        <button type="button" onClick={() => selectMonth(true)} className="rounded-xl border border-outline-variant/20 px-4 py-2 text-sm font-semibold text-on-surface">Mes anterior</button>
        <p className="w-full text-xs text-on-surface-variant">Se incluyen ambas fechas. Solo cuentan ventas completadas; las anuladas quedan fuera.</p>
      </section>

      {!validRange ? <p role="status" className="text-sm text-on-surface-variant">Elegí una fecha inicial y una final posterior o igual para consultar el reporte.</p> : error ? <CollectionError message={error} onRetry={() => void fetchServicesReport(commissionPeriodOf(from, to))} /> : loading || services === null ? <CollectionLoading label="Consultando servicios del período…" /> : !hasCatalog ? (
        <CollectionEmpty icon={<IconUsers className="h-8 w-8" />} title="Creá tu primer servicio" description="Agregá servicios a tu catálogo. Después registrá sus ventas en el Punto de venta y elegí quién atendió cada servicio." action={{ label: "Crear servicio", href: "/dashboard/inventory/product?type=servicio" }} />
      ) : <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Servicios registrados", value: assigned + unassigned, help: "Cantidad total de servicios vendidos en el período." },
            { label: "Asignados al equipo", value: assigned, help: "Estos servicios se reparten en la tabla por persona." },
            { label: "Sin asignar al equipo", value: unassigned, help: "Sin persona asignada o con una persona que ya no figura en el equipo." },
          ].map((card) => <div key={card.label} className="rounded-2xl border border-outline-variant/10 bg-surface-container p-5"><p className="text-sm font-medium text-on-surface-variant">{card.label}</p><p className="mt-1 text-3xl font-bold tabular-nums text-on-surface">{ready ? card.value : "—"}</p><p className="mt-2 text-xs text-on-surface-variant">{card.help}</p></div>)}
        </div>
        {unassigned > 0 ? <div role="status" className="rounded-xl border border-outline-variant/30 bg-surface-container-high p-4 text-sm text-on-surface"><strong>{unassigned} servicio{unassigned !== 1 ? "s" : ""} sin asignar al equipo.</strong> No aparecen en el reparto por persona. Al registrar una venta, elegí quién atendió cada servicio.</div> : null}
        <section className="overflow-hidden rounded-3xl border border-outline-variant/10 bg-surface-container">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/10 bg-surface-container-low px-6 py-4">
            <div><h2 className="text-sm font-bold text-on-surface">Reparto de servicios por persona</h2><p className="mt-1 text-xs text-on-surface-variant">La participación se calcula sobre los {assigned} servicios asignados al equipo. El conteo mide volumen de servicios registrados.</p></div>
            {servicesReport.length > 0 ? <button type="button" aria-pressed={showDetails} onClick={() => setShowDetails((current) => !current)} className="text-sm font-semibold text-primary">{showDetails ? "Ocultar detalles" : "Mostrar detalles de ventas"}</button> : null}
          </div>
          {servicesReport.length === 0 ? <CollectionEmpty icon={<IconUsers className="h-8 w-8" />} title={unassigned ? "Hay servicios, pero ninguno está asignado al equipo" : "No hay servicios registrados en estas fechas"} description={unassigned ? "El total aparece arriba. Para que las próximas ventas se repartan por persona, asigná quién atendió cada servicio en el Punto de venta." : "Probá otro período. Los servicios aparecen después de completar una venta de servicios."} action={unassigned ? { label: "Ir al Punto de venta", href: "/dashboard/pos" } : { label: "Ver mes anterior", onClick: () => selectMonth(true) }} /> : <DataTable rows={servicesReport} rowKey={(row) => row.staff_id} minWidth={showDetails ? 860 : 480} caption="Servicios por persona" columns={columns} />}
          {showDetails && servicesReport.length > 0 ? <p className="border-t border-outline-variant/10 px-6 py-4 text-xs text-on-surface-variant">El valor suma el precio de los servicios antes de los descuentos de la venta y del IVA; no representa el total cobrado ni las comisiones. Clientes estimados cuenta cada cliente registrado una vez por persona; cada venta sin cliente registrado se cuenta como un cliente adicional.</p> : null}
        </section>
      </>}
    </div>
  );
}

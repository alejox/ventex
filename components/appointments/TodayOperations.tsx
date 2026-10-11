"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAppointmentsStore } from "@/stores/appointments.store";
import { useSettingsStore } from "@/stores/settings.store";
import { toISODate } from "@/lib/date";
import { formatAppointmentTime } from "@/lib/time";

/** Vista del día separada de la colección del calendario: no cambia su rango. */
export function TodayOperations() {
  const appointments = useAppointmentsStore((s) => s.today);
  const loading = useAppointmentsStore((s) => s.todayLoading);
  const error = useAppointmentsStore((s) => s.todayError);
  const fetchToday = useAppointmentsStore((s) => s.fetchToday);
  const timeFormat = useSettingsStore((s) => s.settings?.time_format ?? "12");
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void fetchToday(toISODate()); };
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [fetchToday]);
  const active = appointments.filter((a) => a.status !== "cancelled");
  const pending = active.filter((a) => a.status === "pending");
  const unpaid = active.filter((a) => a.service_id && !a.sale_id);
  const upcoming = active.filter((a) => a.status !== "completed").slice(0, 4);
  return <section aria-label="Operación de hoy" className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-on-surface">Operación de hoy</h2>
      <Link href="/dashboard/calendar" className="text-sm font-semibold text-primary">Abrir agenda →</Link></div>
    {loading ? <p role="status" className="mt-3 text-sm text-on-surface-variant">Actualizando agenda…</p>
      : error ? <div role="alert" className="mt-3 text-sm text-error">{error} <button onClick={() => void fetchToday(toISODate())} className="underline">Reintentar</button></div>
      : <>
        <div className="mt-3 flex flex-wrap gap-2 text-sm"><span className="rounded-lg bg-primary/10 px-3 py-2">{pending.length} por confirmar</span>
          <span className="rounded-lg bg-surface-container px-3 py-2">{unpaid.length} sin cobrar</span>
          <span className="rounded-lg bg-surface-container px-3 py-2">{active.filter((a) => a.status === "completed").length} completadas</span></div>
        {upcoming.length > 0 ? <ul className="mt-3 divide-y divide-outline-variant/20">{upcoming.map((a) => <li key={a.id}>
          <Link href={`/dashboard/calendar?appointment=${a.id}`} className="flex min-h-12 items-center gap-3 py-3 text-sm">
            <span className="shrink-0 font-bold text-primary">{formatAppointmentTime(a.start_time, timeFormat)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{a.customers?.full_name ?? a.title}</span><span className="block truncate text-xs text-on-surface-variant">{[a.services?.name, a.staff?.full_name].filter(Boolean).join(" · ")}</span></span>
            <span className="text-xs text-on-surface-variant">{a.status === "pending" ? "Confirmar" : "Ver cita"} →</span>
          </Link></li>)}</ul> : <p className="mt-3 text-sm text-on-surface-variant">No hay visitas pendientes de atención hoy.</p>}
      </>}
  </section>;
}

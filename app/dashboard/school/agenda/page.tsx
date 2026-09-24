"use client";

import { AgendaWeek } from "@/components/school/AgendaWeek";

/** Agenda: las clases de la semana, la disponibilidad y las series. */
export default function AgendaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Agenda</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Clases de la semana, disponibilidad de profesores y series programadas.
        </p>
      </div>
      <AgendaWeek />
    </div>
  );
}
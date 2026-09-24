"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSchoolScheduleStore } from "@/stores/school-schedule.store";
import { useSchoolClassesStore } from "@/stores/school-classes.store";
import { LessonCard } from "@/components/school/LessonCard";
import { SeriesDialog } from "@/components/school/SeriesDialog";
import { RescheduleDialog } from "@/components/school/RescheduleDialog";
import { CollectionLoading, CollectionError } from "@/components/CollectionState";
import { SCHOOL_DAYS, localWeekdayOf } from "@/components/school/format";

/**
 * Agenda semanal: una columna por día, del lunes al domingo.
 *
 * El rango viaja en INSTANTES (lunes 00:00 local → lunes+7 00:00 local), igual
 * que en comisiones: un corte por fecha metería la clase de las 20:00 en el
 * día siguiente. El agrupado por columna, en cambio, es LOCAL — la columna del
 * miércoles muestra lo que el miércoles ve una persona, no lo que dice UTC.
 */
export function AgendaWeek() {
  const lessons = useSchoolScheduleStore((s) => s.lessons);
  const loading = useSchoolScheduleStore((s) => s.loading);
  const error = useSchoolScheduleStore((s) => s.error);
  const fetchAgenda = useSchoolScheduleStore((s) => s.fetchAgenda);

  const [monday, setMonday] = useState(() => mondayOfLocal(new Date()));
  const [showSeries, setShowSeries] = useState(false);
  const [showRescheduleDecide, setShowRescheduleDecide] = useState(false);
  const pendingReschedules = useSchoolClassesStore((s) => s.pendingRescheduleRequests);
  const fetchPendingRescheduleRequests = useSchoolClassesStore(
    (s) => s.fetchPendingRescheduleRequests
  );

  useEffect(() => {
    void fetchPendingRescheduleRequests();
  }, [fetchPendingRescheduleRequests]);

  const range = useMemo(
    () => ({
      fromIso: monday.toISOString(),
      toIso: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7).toISOString(),
    }),
    [monday]
  );

  useEffect(() => {
    void fetchAgenda(range.fromIso, range.toIso);
  }, [range.fromIso, range.toIso, fetchAgenda]);

  const byDay = useMemo(
    () =>
      SCHOOL_DAYS.map((_, i) =>
        lessons
          .filter((l) => localWeekdayOf(new Date(l.start_at)) === i + 1)
          .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
      ),
    [lessons]
  );

  const shiftWeek = useCallback(
    (weeks: number) => setMonday((m) => new Date(m.getFullYear(), m.getMonth(), m.getDate() + weeks * 7)),
    []
  );

  const weekLabel = monday.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            aria-label="Semana anterior"
            className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
          >
            ‹
          </button>
          <button
            onClick={() => shiftWeek(1)}
            aria-label="Semana siguiente"
            className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
          >
            ›
          </button>
          <h2 className="text-base font-bold text-on-surface">Semana del {weekLabel}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRescheduleDecide(true)}
            className="rounded-xl border border-outline-variant/30 px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
          >
            Reprogramaciones
            {pendingReschedules.length > 0 &&
              ` (${pendingReschedules.length})`}
          </button>
          <button
            onClick={() => setShowSeries(true)}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim"
          >
            Programar serie
          </button>
        </div>
      </div>

      {error && <CollectionError message={error} onRetry={() => void fetchAgenda(range.fromIso, range.toIso)} />}

      {loading && lessons.length === 0 ? (
        <CollectionLoading label="Cargando agenda…" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {SCHOOL_DAYS.map((dayName, i) => {
            const dayDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
            const dayLessons = byDay[i] ?? [];
            return (
              <div
                key={dayName}
                className="min-h-40 rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-3"
              >
                <div className="mb-3 flex items-baseline justify-between border-b border-outline-variant/10 pb-2">
                  <span className="text-sm font-bold text-on-surface">{dayName}</span>
                  <span className="text-xs text-on-surface-variant">
                    {dayDate.toLocaleDateString("es-CO", { day: "numeric" })}
                  </span>
                </div>
                <div className="space-y-2">
                  {dayLessons.length === 0 ? (
                    <p className="py-6 text-center text-xs text-on-surface-variant">Sin clases</p>
                  ) : (
                    dayLessons.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showSeries && <SeriesDialog onClose={() => setShowSeries(false)} />}

      {showRescheduleDecide && (
        <RescheduleDialog
          mode="decide"
          onClose={() => setShowRescheduleDecide(false)}
          onDone={() => setShowRescheduleDecide(false)}
        />
      )}
    </div>
  );
}

/** El lunes de la semana actual, medianoche LOCAL (el calendario lo ve así). */
function mondayOfLocal(date: Date): Date {
  const dow = date.getDay(); // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);
}
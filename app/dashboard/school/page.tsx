"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useSchoolStore } from "@/stores/school.store";
import { useSchoolClassesStore } from "@/stores/school-classes.store";
import { CollectionLoading, CollectionError } from "@/components/CollectionState";
import { formatShortDate } from "@/components/school/format";
import { formatSlotTime } from "@/services/school-schedule.service";
import { onboardingSteps, allOnboardingStepsDone } from "@/services/school-enrollments.service";
import { IconUsers, IconMusic, IconCalendar, IconReceipt } from "@/app/assets/icons/DashboardIcons";

function StatCard({
  label,
  value,
  href,
  icon,
  tone = "text-primary",
}: {
  label: string;
  value: number;
  href: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-sm transition-colors hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ${tone}`}>{icon}</span>
        <span className="text-3xl font-extrabold text-on-surface">{value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-on-surface-variant">{label}</p>
    </Link>
  );
}

/** Resumen de la escuela: quién hay, cuánto hay que enseñar y qué vence. */
export default function SchoolResumenPage() {
  const summary = useSchoolStore((s) => s.summary);
  const loading = useSchoolStore((s) => s.loading);
  const error = useSchoolStore((s) => s.error);
  const fetchSummary = useSchoolStore((s) => s.fetchSummary);
  const settings = useSchoolStore((s) => s.settings);
  const fetchSettings = useSchoolStore((s) => s.fetchSettings);
  const pendingCloseLessons = useSchoolClassesStore((s) => s.pendingCloseLessons);
  const classesLoading = useSchoolClassesStore((s) => s.loading);
  const fetchPendingCloseLessons = useSchoolClassesStore((s) => s.fetchPendingCloseLessons);

  useEffect(() => {
    void fetchSummary();
    void fetchSettings();
  }, [fetchSummary, fetchSettings]);

  // "Primeros pasos": el orden real en el que un negocio nuevo avanza, cada
  // paso marcado con un dato que ya existe en la base (T10).
  const steps = useMemo(
    () =>
      onboardingSteps({
        instrumentsCount: settings.instruments.length,
        teachersCount: summary?.teachers ?? 0,
        plansCount: summary?.plans ?? 0,
        activeEnrollments: summary?.active_enrollments ?? 0,
        lessonsCount: summary?.lessons ?? 0,
      }),
    [settings.instruments.length, summary]
  );
  const allStepsDone = summary !== null && allOnboardingStepsDone(steps);

  // Superficie de alerta: clases por cerrar (scheduled + sin confirmar +
  // terminadas). Es una DERIVACIÓN que solo muestra — cerrar es explícito en
  // la agenda, nunca automático.
  useEffect(() => {
    void fetchPendingCloseLessons(new Date().toISOString());
  }, [fetchPendingCloseLessons]);

  if (loading && !summary) return <CollectionLoading label="Cargando la escuela…" />;
  if (error) return <CollectionError message={error} onRetry={() => void fetchSummary()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Académico</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Alumnos, profesores, planes de clase y el progreso de las matrículas.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Alumnos" value={summary?.students ?? 0} href="/dashboard/school/estudiantes" icon={<IconUsers className="w-5 h-5" />} />
        <StatCard label="Profesores" value={summary?.teachers ?? 0} href="/dashboard/staff" icon={<IconMusic className="w-5 h-5" />} tone="text-violet-500" />
        <StatCard label="Planes de clase" value={summary?.plans ?? 0} href="/dashboard/school/planes" icon={<IconCalendar className="w-5 h-5" />} tone="text-sky-500" />
        <StatCard label="Matrículas activas" value={summary?.active_enrollments ?? 0} href="/dashboard/school/planes" icon={<IconReceipt className="w-5 h-5" />} tone="text-emerald-500" />
        <StatCard label="Clases en saldo" value={summary?.total_balance ?? 0} href="/dashboard/school/planes" icon={<IconCalendar className="w-5 h-5" />} tone="text-amber-500" />
        <StatCard label="Vencen en 15 días" value={summary?.expiring_soon ?? 0} href="/dashboard/school/planes" icon={<IconReceipt className="w-5 h-5" />} tone="text-rose-500" />
      </div>

      {/* Aviso ligado al conteo de "Profesores" de arriba: ese número solo
          cuenta perfiles docentes, así que alguien creado en Personal sin
          tildar "Es profesor" queda invisible ahí — este hint es lo único
          que lo señala. */}
      {Boolean(summary && summary.staff_without_teacher_profile > 0) && (
        <p className="-mt-2 text-sm text-on-surface-variant">
          <Link className="font-semibold text-primary hover:underline" href="/dashboard/staff">
            {summary!.staff_without_teacher_profile}{" "}
            {summary!.staff_without_teacher_profile === 1 ? "persona" : "personas"} de Personal sin
            perfil docente
          </Link>{" "}
          — actívalo en Personal.
        </p>
      )}

      {!classesLoading && pendingCloseLessons.length > 0 && (
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-amber-600 dark:text-amber-400">
                {pendingCloseLessons.length}{" "}
                {pendingCloseLessons.length === 1
                  ? "clase terminó sin confirmar"
                  : "clases terminaron sin confirmar"}
              </h2>
              <p className="mt-0.5 text-sm text-on-surface-variant">
                Registra la asistencia para descontar las clases. Nada se cierra solo.
              </p>
            </div>
            <Link
              href="/dashboard/school/agenda"
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
            >
              Ir a la agenda
            </Link>
          </div>
          <ul className="mt-3 space-y-1">
            {pendingCloseLessons.map((l) => (
              <li key={l.id} className="text-sm text-on-surface">
                {formatShortDate(l.end_at)} · {formatSlotTime(l.start_at)}–
                {formatSlotTime(l.end_at)} · <span className="font-semibold">{l.instrument}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!allStepsDone && (
        <div className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-sm">
          <h2 className="font-bold text-on-surface">Primeros pasos</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {steps.map((step, i) => (
              <li
                key={step.id}
                className={step.done ? "text-on-surface-variant line-through decoration-1" : "text-on-surface-variant"}
              >
                {step.done ? "✓" : `${i + 1}.`}{" "}
                <Link className="font-semibold text-primary hover:underline" href={step.href}>
                  {step.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
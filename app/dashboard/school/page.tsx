"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSchoolStore } from "@/stores/school.store";
import { CollectionLoading, CollectionError } from "@/components/CollectionState";
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

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  if (loading && !summary) return <CollectionLoading label="Cargando la escuela…" />;
  if (error) return <CollectionError message={error} onRetry={() => void fetchSummary()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Escuela de música</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Alumnos, profesores, planes de clase y el progreso de las matrículas.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Alumnos" value={summary?.students ?? 0} href="/dashboard/school/estudiantes" icon={<IconUsers className="w-5 h-5" />} />
        <StatCard label="Profesores" value={summary?.teachers ?? 0} href="/dashboard/school/profesores" icon={<IconMusic className="w-5 h-5" />} tone="text-violet-500" />
        <StatCard label="Planes de clase" value={summary?.plans ?? 0} href="/dashboard/school/planes" icon={<IconCalendar className="w-5 h-5" />} tone="text-sky-500" />
        <StatCard label="Matrículas activas" value={summary?.active_enrollments ?? 0} href="/dashboard/school/planes" icon={<IconReceipt className="w-5 h-5" />} tone="text-emerald-500" />
        <StatCard label="Clases en saldo" value={summary?.total_balance ?? 0} href="/dashboard/school/planes" icon={<IconCalendar className="w-5 h-5" />} tone="text-amber-500" />
        <StatCard label="Vencen en 15 días" value={summary?.expiring_soon ?? 0} href="/dashboard/school/planes" icon={<IconReceipt className="w-5 h-5" />} tone="text-rose-500" />
      </div>

      <div className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-sm">
        <h2 className="font-bold text-on-surface">Primeros pasos</h2>
        <ul className="mt-3 space-y-2 text-sm text-on-surface-variant">
          <li>1. Configurá los instrumentos y la política de reprogramación en <Link className="font-semibold text-primary hover:underline" href="/dashboard/school/config">Configuración</Link>.</li>
          <li>2. Creá los <Link className="font-semibold text-primary hover:underline" href="/dashboard/school/profesores">profesores</Link> desde el equipo del negocio.</li>
          <li>3. Armá los <Link className="font-semibold text-primary hover:underline" href="/dashboard/school/planes">planes de clase</Link> sobre los servicios del catálogo.</li>
          <li>4. Registrá <Link className="font-semibold text-primary hover:underline" href="/dashboard/school/estudiantes">alumnos</Link> y matricularlos en un plan.</li>
        </ul>
      </div>
    </div>
  );
}
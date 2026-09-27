"use client";

import Link from "next/link";
import type { SchoolStudent } from "@/services/school-people.service";

interface StudentCardProps {
  student: SchoolStudent;
  balance?: number | null;
  guardiansCount?: number;
  /** Si se pasa, agrega un botón "Editar" que no navega (para usar dentro del Link). */
  onEdit?: () => void;
  /** Si se pasa, agrega "Desactivar"/"Reactivar" (nunca borra: la ficha y su historial se conservan). */
  onToggleStatus?: () => void;
}

const LEVEL_LABELS: Record<string, string> = {
  Principiante: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  Intermedio: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Avanzado: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

/**
 * Tarjeta de un alumno: identidad académica + un vistazo a la relación con el
 * módulo. Se usa en la lista (`estudiantes`) y en la cabecera del detalle.
 */
export function StudentCard({ student, balance = null, guardiansCount = 0, onEdit, onToggleStatus }: StudentCardProps) {
  const levelClass = LEVEL_LABELS[student.level ?? ""] ?? "bg-surface-container text-on-surface-variant";
  const isActive = student.status !== "inactive";

  return (
    <Link
      href={`/dashboard/school/estudiantes/${student.id}`}
      className="block rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-sm transition-colors hover:border-primary/40 hover:shadow-md group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
            {student.full_name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-on-surface group-hover:text-primary transition-colors">
              {student.full_name}
            </p>
            <p className="truncate text-sm text-on-surface-variant">
              {student.instrument}
              {student.level ? ` · ${student.level}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Activo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-surface-container text-on-surface-variant">
              <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/60" />
              Inactivo
            </span>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit();
              }}
              className="rounded-lg border border-outline-variant/30 px-2.5 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
            >
              Editar
            </button>
          )}
          {onToggleStatus && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleStatus();
              }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                isActive
                  ? "border-error/30 text-error hover:bg-error/10"
                  : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              {isActive ? "Desactivar" : "Reactivar"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        {student.level && (
          <span className={`rounded-full px-2.5 py-1 font-semibold ${levelClass}`}>{student.level}</span>
        )}
        {student.is_minor && (
          <span className="rounded-full px-2.5 py-1 font-semibold bg-orange-500/15 text-orange-600 dark:text-orange-400">
            Menor de edad
          </span>
        )}
        {guardiansCount > 0 && (
          <span className="rounded-full px-2.5 py-1 font-semibold bg-surface-container text-on-surface-variant">
            {guardiansCount} {guardiansCount === 1 ? "acudiente" : "acudientes"}
          </span>
        )}
        {balance !== null && balance !== undefined && (
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              balance > 0
                ? "bg-primary/15 text-primary"
                : "bg-surface-container text-on-surface-variant"
            }`}
          >
            {balance} {balance === 1 ? "clase" : "clases"} en saldo
          </span>
        )}
      </div>
    </Link>
  );
}
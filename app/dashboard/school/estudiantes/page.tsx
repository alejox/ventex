"use client";

import { useEffect, useMemo, useState } from "react";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { StudentCard } from "@/components/school/StudentCard";
import { StudentForm } from "@/components/school/StudentForm";
import { filterStudents } from "@/services/school-people.service";
import type { SchoolStudent } from "@/services/school-people.service";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { CollectionLoading, CollectionEmpty, CollectionError, CollectionFilteredEmpty } from "@/components/CollectionState";
import { IconUsers, IconSearch } from "@/app/assets/icons/DashboardIcons";

/** Lista de alumnos con búsqueda, alta rápida y edición (modales). */
export default function EstudiantesPage() {
  const students = useSchoolPeopleStore((s) => s.students);
  const loading = useSchoolPeopleStore((s) => s.loading);
  const error = useSchoolPeopleStore((s) => s.error);
  const fetchStudents = useSchoolPeopleStore((s) => s.fetchStudents);
  const setStudentStatus = useSchoolPeopleStore((s) => s.setStudentStatus);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<SchoolStudent | null>(null);

  useEffect(() => {
    void fetchStudents();
  }, [fetchStudents]);

  const filtered = useMemo(
    () => filterStudents(students, { query, showInactive }),
    [students, query, showInactive],
  );

  const { confirm, dialog } = useConfirm();

  // Desde la lista no están cargadas las matrículas: el aviso es genérico. El
  // detalle del alumno cuenta las activas antes de confirmar.
  const handleToggleStatus = async (student: SchoolStudent) => {
    const activating = student.status === "inactive";
    const ok = await confirm(
      activating
        ? {
            title: `¿Reactivar a ${student.full_name}?`,
            description: "Vuelve a ofrecerse en matrículas y agenda.",
            confirmLabel: "Reactivar",
          }
        : {
            title: `¿Desactivar a ${student.full_name}?`,
            description:
              "Deja de ofrecerse en matrículas y agenda nuevas. Su ficha, historial y matrículas activas se conservan.",
            confirmLabel: "Desactivar",
            tone: "danger",
          },
    );
    if (!ok) return;
    await setStudentStatus(student.id, activating ? "active" : "inactive");
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingStudent(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Alumnos</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {students.length} {students.length === 1 ? "alumno registrado" : "alumnos registrados"}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim"
        >
          Nuevo alumno
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o especialidad…"
            className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest py-2.5 pl-10 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          Mostrar inactivos
        </label>
      </div>

      {error && <CollectionError message={error} onRetry={() => void fetchStudents()} />}

      {loading && students.length === 0 ? (
        <CollectionLoading label="Cargando alumnos…" />
      ) : students.length === 0 ? (
        <CollectionEmpty
          icon={<IconUsers className="h-7 w-7" />}
          title="Todavía no hay alumnos"
          description="Registrá el primer alumno escribiendo su nombre — se crea el cliente al vuelo."
          action={{ label: "Nuevo alumno", onClick: () => setShowForm(true) }}
        />
      ) : filtered.length === 0 ? (
        <CollectionFilteredEmpty
          title="Sin coincidencias"
          description={
            query
              ? `Ningún alumno coincide con “${query}”.`
              : "Sin alumnos activos. Activá “Mostrar inactivos” para verlos."
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <StudentCard
              key={s.id}
              student={s}
              onEdit={() => setEditingStudent(s)}
              onToggleStatus={() => void handleToggleStatus(s)}
            />
          ))}
        </div>
      )}

      {(showForm || editingStudent) && (
        <StudentForm
          student={editingStudent}
          onClose={closeForm}
          onSaved={() => void fetchStudents()}
        />
      )}

      {dialog}
    </div>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { StudentCard } from "@/components/school/StudentCard";
import { StudentForm } from "@/components/school/StudentForm";
import { CollectionLoading, CollectionEmpty, CollectionError, CollectionFilteredEmpty } from "@/components/CollectionState";
import { IconUsers, IconSearch } from "@/app/assets/icons/DashboardIcons";

/** Lista de alumnos con búsqueda y alta rápida (modal). */
export default function EstudiantesPage() {
  const students = useSchoolPeopleStore((s) => s.students);
  const loading = useSchoolPeopleStore((s) => s.loading);
  const error = useSchoolPeopleStore((s) => s.error);
  const fetchStudents = useSchoolPeopleStore((s) => s.fetchStudents);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    void fetchStudents();
  }, [fetchStudents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.instrument.toLowerCase().includes(q),
    );
  }, [students, query]);

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

      <div className="relative max-w-md">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o instrumento…"
          className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest py-2.5 pl-10 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {error && <CollectionError message={error} onRetry={() => void fetchStudents()} />}

      {loading && students.length === 0 ? (
        <CollectionLoading label="Cargando alumnos…" />
      ) : students.length === 0 ? (
        <CollectionEmpty
          icon={<IconUsers className="h-7 w-7" />}
          title="Todavía no hay alumnos"
          description="Registrá el primer alumno asociado a un cliente de la sección Clientes."
          action={{ label: "Nuevo alumno", onClick: () => setShowForm(true) }}
        />
      ) : filtered.length === 0 ? (
        <CollectionFilteredEmpty
          title="Sin coincidencias"
          description={`Ningún alumno coincide con “${query}”.`}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <StudentCard key={s.id} student={s} />
          ))}
        </div>
      )}

      {showForm && (
        <StudentForm
          onClose={() => setShowForm(false)}
          onSaved={() => void fetchStudents()}
        />
      )}
    </div>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { TeacherForm } from "@/components/school/TeacherForm";
import { CollectionLoading, CollectionEmpty, CollectionError, CollectionFilteredEmpty } from "@/components/CollectionState";
import { IconMusic, IconSearch } from "@/app/assets/icons/DashboardIcons";

/** Profesores: el equipo del negocio con su perfil académico. */
export default function ProfesoresPage() {
  const teachers = useSchoolPeopleStore((s) => s.teachers);
  const loading = useSchoolPeopleStore((s) => s.loading);
  const error = useSchoolPeopleStore((s) => s.error);
  const fetchTeachers = useSchoolPeopleStore((s) => s.fetchTeachers);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchTeachers();
  }, [fetchTeachers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        t.full_name.toLowerCase().includes(q) ||
        t.instruments.some((i) => i.toLowerCase().includes(q)),
    );
  }, [teachers, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Profesores</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {teachers.length} {teachers.length === 1 ? "perfil docente" : "perfiles docentes"}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim"
        >
          Nuevo profesor
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

      {error && <CollectionError message={error} onRetry={() => void fetchTeachers()} />}

      {loading && teachers.length === 0 ? (
        <CollectionLoading label="Cargando profesores…" />
      ) : teachers.length === 0 ? (
        <CollectionEmpty
          icon={<IconMusic className="h-7 w-7" />}
          title="Todavía no hay profesores"
          description="Cada profesor es un empleado del negocio con sus instrumentos y su bio."
          action={{ label: "Nuevo profesor", onClick: () => setShowForm(true) }}
        />
      ) : filtered.length === 0 ? (
        <CollectionFilteredEmpty title="Sin coincidencias" description={`Ningún profesor coincide con “${query}”.`} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <div key={t.id} className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-500/10 font-bold text-violet-500">
                    {t.full_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-on-surface">{t.full_name}</p>
                    <p className="truncate text-sm text-on-surface-variant">{t.instruments.join(" · ")}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEditingId(t.id);
                    setShowForm(true);
                  }}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                >
                  Editar
                </button>
              </div>
              {t.bio && <p className="mt-3 line-clamp-2 text-sm text-on-surface-variant">{t.bio}</p>}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TeacherForm
          teacher={teachers.find((t) => t.id === editingId) ?? null}
          onClose={() => {
            setShowForm(false);
            setEditingId(null);
          }}
          onSaved={() => void fetchTeachers()}
        />
      )}
    </div>
  );
}
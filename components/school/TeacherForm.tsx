"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui/Select";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { normalizeName } from "@/services/school-people.service";
import { fetchSchoolSettings } from "@/services/school-settings.service";
import type { TeacherProfile } from "@/services/school-people.service";
import { notifySuccess } from "@/lib/notifications";

interface TeacherFormProps {
  teacher?: TeacherProfile | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Alta / edición de un perfil docente.
 *
 * El profesor referencia a un empleado (`staff`) del negocio: la ficha
 * académica (instrumentos, bio) cuelga del mismo equipo que aparece en
 * Comisiones y en el POS. Solo se ofrecen empleados activos que aún no tienen
 * perfil (o el propio, al editar).
 */
export function TeacherForm({ teacher, onClose, onSaved }: TeacherFormProps) {
  const saveTeacher = useSchoolPeopleStore((s) => s.saveTeacher);
  const [staffId, setStaffId] = useState(teacher?.staff_id ?? "");
  const [instrumentsText, setInstrumentsText] = useState((teacher?.instruments ?? []).join(", "));
  const [bio, setBio] = useState(teacher?.bio ?? "");
  const [loading, setLoading] = useState(false);
  const [availableInstruments, setAvailableInstruments] = useState<string[]>([]);

  const staffOptions = useSchoolPeopleStore((s) => s.staffOptions);
  const fetchStaffOptions = useSchoolPeopleStore((s) => s.fetchStaffOptions);

  useEffect(() => {
    if (staffOptions.length === 0) void fetchStaffOptions();
    fetchSchoolSettings()
      .then((s) => setAvailableInstruments(s.instruments))
      .catch(() => setAvailableInstruments([]));
  }, [staffOptions.length, fetchStaffOptions]);

  const instruments = useMemo(
    () => instrumentsText.split(",").map((s) => normalizeName(s)).filter(Boolean),
    [instrumentsText],
  );

  const toggleInstrument = (name: string) => {
    const next = instruments.includes(name)
      ? instruments.filter((i) => i !== name)
      : [...instruments, name];
    setInstrumentsText(next.join(", "));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId || instruments.length === 0) return;

    setLoading(true);
    const ok = await saveTeacher(teacher?.id ?? null, {
      staff_id: staffId,
      instruments,
      bio: bio.trim() || null,
    });
    setLoading(false);

    if (ok) {
      notifySuccess(teacher ? "Profesor actualizado" : "Profesor registrado");
      onSaved();
      onClose();
    }
  };

  return (
    <SchoolModal title={teacher ? "Editar profesor" : "Nuevo profesor"} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <Select
          label="Empleado"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          searchable
          searchPlaceholder="Buscar empleado…"
          hint="Empleados activos del negocio que todavía no tienen perfil de profesor."
        >
          <option value="">Seleccionar…</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>

        <div className="space-y-2">
          <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
            Instrumentos <span className="text-primary">*</span>
          </label>
          {availableInstruments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableInstruments.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleInstrument(name)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    instruments.includes(name)
                      ? "bg-primary text-white"
                      : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">
              No hay instrumentos configurados. Agregalos en Configuración de la escuela o escribilos abajo.
            </p>
          )}
          <input
            type="text"
            value={instrumentsText}
            onChange={(e) => setInstrumentsText(e.target.value)}
            placeholder="Separados por coma: Guitarra, Piano…"
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-on-surface">Bio / reseña</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Formación, experiencia, enfoque pedagógico…"
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !staffId || instruments.length === 0}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando…" : "Guardar profesor"}
          </button>
        </div>
      </form>
    </SchoolModal>
  );
}
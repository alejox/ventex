"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/Select";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { useSchoolStore } from "@/stores/school.store";
import { useCustomersStore } from "@/stores/customers.store";
import { normalizeName, normalizeContactPhone } from "@/services/school-people.service";
import { catalogOptions, catalogLabel } from "@/services/school-settings.service";
import type { SchoolStudent } from "@/services/school-people.service";
import { notifySuccess, notifyError } from "@/lib/notifications";

interface StudentFormProps {
  student?: SchoolStudent | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Alta / edición de un alumno.
 *
 * El nombre del alumno es SUYO propio (`school_students.full_name`) — nunca
 * el del cliente. El cliente (`customers`) es la cuenta de COBRO: quien
 * compra en el POS, que puede ser un padre/acudiente compartido entre
 * hermanos. Un alumno NUEVO crea su cuenta al vuelo reusando el mismo nombre
 * escrito (evita la doble pantalla Clientes → Alumnos); el link "Usar la
 * cuenta de un cliente existente" cambia a elegir un cliente ya creado, para
 * no duplicar a alguien que ya es cliente (por ejemplo, el padre que ya
 * compra en el POS). En edición, el nombre del alumno se edita acá mismo y la
 * cuenta se puede cambiar con el mismo selector.
 *
 * Fallo parcial (solo alta): si el cliente se crea pero el alumno falla al
 * guardar, `createdCustomerId` se queda en el estado del formulario — un
 * reintento reusa ese id en vez de crear un cliente duplicado. Si el usuario
 * cierra el modal en ese punto, el cliente creado queda huérfano (sin alumno
 * asociado); es el mismo costo aceptado que un guest checkout sin reclamar en
 * ePayco: una fila inerte, nunca datos duplicados o perdidos.
 */
export function StudentForm({ student, onClose, onSaved }: StudentFormProps) {
  const saveStudent = useSchoolPeopleStore((s) => s.saveStudent);
  const schoolSettings = useSchoolStore((s) => s.settings);
  const schoolSettingsLoading = useSchoolStore((s) => s.loading);
  const fetchSchoolSettings = useSchoolStore((s) => s.fetchSettings);
  const customers = useCustomersStore((s) => s.customers);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);
  const addCustomer = useCustomersStore((s) => s.addCustomer);

  // En edición la cuenta ya existe: el selector de cliente existente se
  // muestra siempre, precargado con la cuenta actual. En alta arranca
  // escribiendo un nombre nuevo (crea la cuenta al vuelo).
  const [useExistingCustomer, setUseExistingCustomer] = useState(Boolean(student));
  const [studentName, setStudentName] = useState(student?.full_name ?? "");
  const [createdCustomerId, setCreatedCustomerId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(student?.customer_id ?? "");
  const [instrument, setInstrument] = useState(student?.instrument ?? "");
  const [level, setLevel] = useState(student?.level ?? "");
  const [birthDate, setBirthDate] = useState(student?.birth_date ?? "");
  const [isMinor, setIsMinor] = useState(student?.is_minor ?? false);
  const [contactPhone, setContactPhone] = useState(student?.contact_phone ?? "");
  const [contactEmail, setContactEmail] = useState(student?.contact_email ?? "");
  const [notes, setNotes] = useState(student?.notes ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchSchoolSettings();
  }, [fetchSchoolSettings]);

  // El selector de cliente existente es la única rama que necesita la lista
  // de clientes: se muestra siempre en edición (la cuenta ya existe y se
  // puede cambiar) y en alta solo tras elegir "usar cuenta existente".
  useEffect(() => {
    if (!student && !useExistingCustomer) return;
    void fetchCustomers();
  }, [student, useExistingCustomer, fetchCustomers]);

  // El catálogo de especialidades es de Configuración de Académico; el valor
  // que ya tenía este alumno (dato legado) nunca se pierde aunque haya salido
  // del catálogo.
  const instrumentOptions = useMemo(
    () => catalogOptions(schoolSettings.instruments, [instrument]),
    [schoolSettings.instruments, instrument],
  );
  const levelOptions = useMemo(
    () => catalogOptions(schoolSettings.levels, [level]),
    [schoolSettings.levels, level],
  );

  const nameValid = Boolean(normalizeName(studentName));
  const canSubmit = useExistingCustomer ? nameValid && Boolean(customerId) : nameValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizeName(instrument) || !canSubmit) return;

    setLoading(true);

    let resolvedCustomerId = customerId;
    if (!useExistingCustomer) {
      if (createdCustomerId) {
        resolvedCustomerId = createdCustomerId;
      } else {
        const created = await addCustomer({
          full_name: normalizeName(studentName),
          email: "",
          phone: "",
          identification: "",
          doc_type: "",
          tax_exempt: false,
        });
        if (!created) {
          setLoading(false);
          notifyError(
            "No se pudo crear el cliente",
            useCustomersStore.getState().error ?? "Error inesperado",
          );
          return;
        }
        setCreatedCustomerId(created.id);
        resolvedCustomerId = created.id;
      }
    }

    const ok = await saveStudent(student?.id ?? null, {
      customer_id: resolvedCustomerId,
      full_name: normalizeName(studentName),
      instrument: normalizeName(instrument),
      level: normalizeName(level) || null,
      birth_date: birthDate || null,
      is_minor: isMinor,
      contact_phone: (normalizeContactPhone(contactPhone) ?? contactPhone.trim()) || null,
      contact_email: contactEmail.trim() || null,
      notes: notes.trim() || null,
    });
    setLoading(false);

    if (ok) {
      notifySuccess(student ? "Alumno actualizado" : "Alumno registrado", normalizeName(studentName));
      onSaved();
      onClose();
    }
  };

  return (
    <SchoolModal title={student ? "Editar alumno" : "Nuevo alumno"} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="space-y-1.5">
          <label htmlFor="student-name" className="flex items-center gap-1 text-sm font-semibold text-on-surface">
            Nombre del alumno <span className="text-primary">*</span>
          </label>
          <input
            id="student-name"
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Ej. María González"
            required
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {useExistingCustomer ? (
          <div className="space-y-1.5">
            <Select
              label="Cliente (cuenta de cobro)"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              searchable
              searchPlaceholder="Buscar cliente…"
              hint="Quien compra en el POS — puede ser el propio alumno o un acudiente."
            >
              <option value="">Seleccionar…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
            {!student && (
              <p className="text-xs text-on-surface-variant">
                <button
                  type="button"
                  onClick={() => {
                    setUseExistingCustomer(false);
                    setCustomerId("");
                  }}
                  className="font-semibold text-primary hover:underline"
                >
                  Escribir un nombre nuevo
                </button>
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-on-surface-variant">
            Se crea un cliente con el nombre del alumno como cuenta de cobro. Si ya es
            cliente,{" "}
            <button
              type="button"
              onClick={() => setUseExistingCustomer(true)}
              className="font-semibold text-primary hover:underline"
            >
              usar la cuenta de un cliente existente (p. ej. el padre o acudiente)
            </button>{" "}
            para no duplicarlo.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Select
              id="student-instrument"
              label="Especialidad *"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {instrumentOptions.map((name) => (
                <option key={name} value={name}>
                  {catalogLabel(name, schoolSettings.instruments)}
                </option>
              ))}
            </Select>
            {!schoolSettingsLoading && instrumentOptions.length === 0 && (
              <p className="text-xs text-on-surface-variant">
                Agregá especialidades en{" "}
                <Link href="/dashboard/school/config" className="font-semibold text-primary hover:underline">
                  Configuración de Académico
                </Link>
                .
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Select
              id="student-level"
              label="Nivel"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="">Sin nivel</option>
              {levelOptions.map((name) => (
                <option key={name} value={name}>
                  {catalogLabel(name, schoolSettings.levels)}
                </option>
              ))}
            </Select>
            {!schoolSettingsLoading && levelOptions.length === 0 && (
              <p className="text-xs text-on-surface-variant">
                Agregá niveles en{" "}
                <Link href="/dashboard/school/config" className="font-semibold text-primary hover:underline">
                  Configuración de Académico
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-on-surface">Fecha de nacimiento</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-on-surface-variant">
            Opcional — avisa (sin bloquear) si la edad no encaja en el rango de un plan grupal.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isMinor}
            onChange={(e) => setIsMinor(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          Es menor de edad (necesita adulto responsable)
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Teléfono de contacto</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Diferente al del cliente"
              inputMode="tel"
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Email de contacto</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Opcional"
              inputMode="email"
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-on-surface">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Observaciones de la ficha académica"
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
            disabled={loading || !normalizeName(instrument) || !canSubmit}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando…" : "Guardar alumno"}
          </button>
        </div>
      </form>
    </SchoolModal>
  );
}

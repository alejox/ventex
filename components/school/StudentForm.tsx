"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/Select";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { normalizeName, normalizeContactPhone } from "@/services/school-people.service";
import { fetchCustomers } from "@/services/customers.service";
import type { Customer } from "@/services/customers.service";
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
 * El alumno SIEMPRE referencia un cliente existente (`customers`): la ficha del
 * alumno es académica (instrumento, nivel, contactos) y la del cliente es
 * comercial (ventas, créditos, promociones). Se crean clientes en Clientes.
 */
export function StudentForm({ student, onClose, onSaved }: StudentFormProps) {
  const saveStudent = useSchoolPeopleStore((s) => s.saveStudent);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(student?.customer_id ?? "");
  const [instrument, setInstrument] = useState(student?.instrument ?? "");
  const [level, setLevel] = useState(student?.level ?? "");
  const [isMinor, setIsMinor] = useState(student?.is_minor ?? false);
  const [contactPhone, setContactPhone] = useState(student?.contact_phone ?? "");
  const [contactEmail, setContactEmail] = useState(student?.contact_email ?? "");
  const [notes, setNotes] = useState(student?.notes ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizeName(instrument)) return;

    setLoading(true);
    const ok = await saveStudent(student?.id ?? null, {
      customer_id: customerId,
      instrument: normalizeName(instrument),
      level: normalizeName(level) || null,
      is_minor: isMinor,
      contact_phone: (normalizeContactPhone(contactPhone) ?? contactPhone.trim()) || null,
      contact_email: contactEmail.trim() || null,
      notes: notes.trim() || null,
    });
    setLoading(false);

    if (ok) {
      notifySuccess(student ? "Alumno actualizado" : "Alumno registrado", normalizeName(instrument));
      onSaved();
      onClose();
    }
  };

  return (
    <SchoolModal title={student ? "Editar alumno" : "Nuevo alumno"} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="space-y-1.5">
          <Select
            label="Cliente"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            searchable
            searchPlaceholder="Buscar cliente…"
          >
            <option value="">Seleccionar…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-on-surface-variant">
            El alumno se asocia a un cliente existente. Creá el cliente desde la sección Clientes si todavía no existe.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
              Instrumento <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              placeholder="Ej. Guitarra"
              required
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Nivel</label>
            <input
              type="text"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="Ej. Principiante"
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
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
            disabled={loading || !customerId || !normalizeName(instrument)}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando…" : "Guardar alumno"}
          </button>
        </div>
      </form>
    </SchoolModal>
  );
}
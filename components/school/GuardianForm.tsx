"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/Select";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { normalizeName } from "@/services/school-people.service";
import { fetchCustomers } from "@/services/customers.service";
import type { Customer } from "@/services/customers.service";
import type { StudentGuardian } from "@/services/school-people.service";
import { notifySuccess } from "@/lib/notifications";

interface GuardianFormProps {
  studentId: string;
  guardian?: StudentGuardian | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Alta / edición de un adulto responsable.
 *
 * La base garantiza UN solo receptor de avisos por alumno (índice único parcial
 * `school_students_one_notice_receiver`): si este adulto pasa a ser el receptor
 * y otro ya lo es, el store apaga al anterior ANTES de guardar.
 */
export function GuardianForm({ studentId, guardian, onClose, onSaved }: GuardianFormProps) {
  const saveGuardian = useSchoolPeopleStore((s) => s.saveGuardian);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(guardian?.customer_id ?? "");
  const [relationship, setRelationship] = useState(guardian?.relationship ?? "");
  const [phone, setPhone] = useState(guardian?.phone ?? "");
  const [email, setEmail] = useState(guardian?.email ?? "");
  const [noticeReceiver, setNoticeReceiver] = useState(guardian?.is_notice_receiver ?? false);
  const [noticesEnabled, setNoticesEnabled] = useState(guardian?.notices_enabled ?? true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizeName(relationship)) return;

    setLoading(true);
    const ok = await saveGuardian(guardian?.id ?? null, {
      student_id: studentId,
      customer_id: customerId,
      relationship: normalizeName(relationship),
      phone: phone.trim() || null,
      email: email.trim() || null,
      is_notice_receiver: noticeReceiver,
      notices_enabled: noticesEnabled,
    });
    setLoading(false);

    if (ok) {
      notifySuccess(guardian ? "Acudiente actualizado" : "Acudiente agregado");
      onSaved();
      onClose();
    }
  };

  return (
    <SchoolModal title={guardian ? "Editar acudiente" : "Agregar adulto responsable"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="space-y-1.5">
          <Select
            label="Cliente (adulto)"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            searchable
            searchPlaceholder="Buscar adulto…"
          >
            <option value="">Seleccionar…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
              Parentesco <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="Ej. Madre"
              required
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface">Teléfono</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Si difiere del cliente"
              inputMode="tel"
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-on-surface">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Opcional"
            inputMode="email"
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4">
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
            <input
              type="checkbox"
              checked={noticeReceiver}
              onChange={(e) => setNoticeReceiver(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            Es el receptor de avisos del alumno
          </label>
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
            <input
              type="checkbox"
              checked={noticesEnabled}
              onChange={(e) => setNoticesEnabled(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            Quiere recibir avisos (clases, cambios, promociones)
          </label>
          <p className="text-xs text-on-surface-variant">
            Solo un acudiente por alumno recibe los avisos: al marcar este, el anterior deja de recibirlos.
          </p>
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
            disabled={loading || !customerId || !normalizeName(relationship)}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando…" : "Guardar acudiente"}
          </button>
        </div>
      </form>
    </SchoolModal>
  );
}
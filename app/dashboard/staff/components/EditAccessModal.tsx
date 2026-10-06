"use client";

import React, { useState } from "react";
import { useStaffStore } from "@/stores/staff.store";
import { useProfile } from "@/components/ProfileProvider";
import { Select } from "@/components/ui/Select";
import { notifySuccess } from "@/lib/notifications";
import { staffRolesForType } from "@/config/business";
import type { WorkerMember } from "@/services/worker.service";
import { Modal } from "@/components/ui/Modal";

/**
 * Edita los datos de acceso que controla el dueño. El correo identifica la
 * cuenta y la contraseña siempre pertenece al empleado.
 */
export function EditAccessModal({ worker, onClose }: { worker: WorkerMember; onClose: () => void }) {
  const updateAccess = useStaffStore((s) => s.updateAccess);
  const resendInvitation = useStaffStore((s) => s.resendInvitation);
  const submitting = useStaffStore((s) => s.submitting);
  const error = useStaffStore((s) => s.error);
  const profile = useProfile();
  const roleOptions = staffRolesForType(profile?.businessType ?? null);
  const options =
    worker.role && !roleOptions.includes(worker.role) ? [worker.role, ...roleOptions] : roleOptions;

  const [fullName, setFullName] = useState(worker.full_name ?? "");
  const [role, setRole] = useState(worker.role ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await updateAccess(worker.id, {
      fullName,
      role,
    });
    if (ok) {
      notifySuccess("Acceso actualizado", "Los datos de la cuenta se guardaron.");
      onClose();
    }
  };

  const handleResend = async () => {
    const ok = await resendInvitation(worker.id);
    if (ok) notifySuccess("Invitación reenviada", "El correo fue enviado nuevamente.");
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Editar acceso"
      className="max-w-md!"
      bodyClassName="border-t border-outline-variant/10"
    >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Nombre completo</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Correo electrónico</label>
            <input
              type="email"
              readOnly
              value={worker.email ?? ""}
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl text-on-surface-variant"
            />
          </div>

          <Select
            label="Rol / Cargo"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">Seleccionar cargo</option>
            {options.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>

          {worker.access_status === "pending" && (
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={submitting}
              className="w-full rounded-xl border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {submitting ? "Enviando…" : "Reenviar invitación"}
            </button>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50"
            >
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
    </Modal>
  );
}

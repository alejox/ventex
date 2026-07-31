"use client";

import React, { useState } from "react";
import { IconX } from "@/app/assets/icons/DashboardIcons";
import { useStaffStore } from "@/stores/staff.store";
import { useProfile } from "@/components/ProfileProvider";
import { Select } from "@/components/ui/Select";
import { notifySuccess } from "@/lib/notifications";
import { staffRolesForType } from "@/config/business";
import type { WorkerMember } from "@/services/worker.service";

/**
 * Edita los datos de acceso que controla el dueño. El correo identifica la
 * cuenta y la contraseña siempre pertenece al empleado.
 */
export function EditAccessModal({ worker, onClose }: { worker: WorkerMember; onClose: () => void }) {
  const updateAccess = useStaffStore((s) => s.updateAccess);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Editar acceso</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <IconX className="w-5 h-5" />
          </button>
        </div>

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
      </div>
    </div>
  );
}

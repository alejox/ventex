"use client";

import { useState } from "react";
import { IconX } from "@/app/assets/icons/DashboardIcons";
import { useWorkerStore } from "@/stores/worker.store";
import { notifySuccess } from "@/lib/notifications";
import { type WorkerPermissions, type WorkerPermission } from "@/config/business";
import { PermissionToggles, togglePermission } from "./PermissionToggles";

export function PermissionsPanel({
  workerId,
  current,
  onClose,
}: {
  workerId: string;
  current: WorkerPermissions;
  onClose: () => void;
}) {
  const updatePermissions = useWorkerStore((s) => s.updatePermissions);
  const submitting = useWorkerStore((s) => s.submitting);
  const error = useWorkerStore((s) => s.error);
  const [perms, setPerms] = useState<WorkerPermissions>({ ...current });

  const toggle = (p: WorkerPermission) => {
    setPerms((prev) => togglePermission(prev, p));
  };

  const handleSave = async () => {
    const ok = await updatePermissions(workerId, perms);
    if (ok) {
      notifySuccess("Permisos guardados", "Los permisos del trabajador se actualizaron.");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10 shrink-0">
          <h2 className="text-lg font-bold text-on-surface">Permisos del trabajador</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 overflow-y-auto">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          <p className="text-sm text-on-surface-variant mb-4">
            Activa o desactiva los módulos a los que este trabajador puede acceder.
          </p>

          <PermissionToggles perms={perms} onToggle={toggle} />
        </div>

        <div className="flex items-center justify-between gap-4 p-6 pt-0 shrink-0">
          <div className="flex gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleSave}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50"
            >
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

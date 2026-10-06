"use client";

import { useState } from "react";
import { IconX } from "@/app/assets/icons/DashboardIcons";
import { useStaffStore } from "@/stores/staff.store";
import { notifySuccess } from "@/lib/notifications";
import { type WorkerPermissions, type WorkerPermission } from "@/config/business";
import { PermissionToggles, togglePermission } from "./PermissionToggles";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { samePermissions } from "./permission-diff";

export function PermissionsPanel({
  workerId,
  current,
  isAdmin,
  onClose,
}: {
  workerId: string;
  current: WorkerPermissions;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const setAdmin = useStaffStore((s) => s.setAdmin);
  const updatePermissions = useStaffStore((s) => s.updatePermissions);
  const submitting = useStaffStore((s) => s.submitting);
  const error = useStaffStore((s) => s.error);
  const [perms, setPerms] = useState<WorkerPermissions>({ ...current });

  const toggle = (p: WorkerPermission) => {
    setPerms((prev) => togglePermission(prev, p));
  };

  const [admin, setAdminOn] = useState(isAdmin);
  const dirty = admin !== isAdmin || !samePermissions(perms, current);
  const { confirm, dialog } = useConfirm();

  /** Escape, la X, el fondo o "Cerrar": con cambios sin guardar, se pregunta. */
  const requestClose = async () => {
    if (submitting) return;
    if (dirty) {
      const discard = await confirm({
        title: "¿Descartar los cambios?",
        description: "Cambiaste permisos que todavía no guardaste. Si cierras ahora, se pierden.",
        confirmLabel: "Descartar",
        cancelLabel: "Seguir editando",
        tone: "danger",
      });
      if (!discard) return;
    }
    onClose();
  };

  const handleSave = async () => {
    // El rol de administrador es una decisión aparte de los toggles: se guarda
    // primero, y si falla no se tocan los permisos.
    if (admin !== isAdmin && !(await setAdmin(workerId, admin))) return;
    const ok = await updatePermissions(workerId, perms);
    if (ok) {
      notifySuccess("Permisos guardados", "Los permisos se actualizaron.");
      onClose();
    }
  };

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) void requestClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          void requestClose();
        }
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="permissions-panel-title" className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10 shrink-0">
          <h2 id="permissions-panel-title" className="text-lg font-bold text-on-surface">Permisos</h2>
          <button onClick={() => void requestClose()} aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 overflow-y-auto">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={admin}
            onClick={() => setAdminOn((v) => !v)}
            className={`w-full flex items-center justify-between gap-4 p-3 rounded-2xl border text-left transition-colors ${
              admin ? "bg-primary/5 border-primary/40" : "bg-surface-container-low border-outline-variant/10 hover:bg-surface-container"
            }`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-on-surface">Administrador del negocio</span>
              <span className="block text-xs text-on-surface-variant mt-0.5">
                Actúa como el dueño: ve y gestiona todo el negocio, liquida comisiones y
                configura. No puede cambiar la facturación ni los accesos del equipo.
              </span>
            </span>
            <span className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${admin ? "bg-primary" : "bg-surface-container-highest border border-outline-variant/20"}`}>
              <span className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-all ${admin ? "left-[22px]" : "left-[2px]"}`} />
            </span>
          </button>

          {admin ? (
            <p className="text-sm text-on-surface-variant">
              Un administrador tiene acceso a todo; los permisos individuales no aplican.
            </p>
          ) : (
            <>
              <p className="text-sm text-on-surface-variant mb-4">
                Activa o desactiva las secciones a las que esta persona puede entrar.
              </p>

              <PermissionToggles perms={perms} onToggle={toggle} onReplace={setPerms} />
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 p-6 pt-0 shrink-0">
          <div className="flex gap-3 ml-auto">
            <button
              onClick={() => void requestClose()}
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
    {dialog}
    </>
  );
}

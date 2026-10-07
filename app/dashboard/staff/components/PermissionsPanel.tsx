"use client";

import { useState } from "react";
import { useStaffStore } from "@/stores/staff.store";
import { notifySuccess } from "@/lib/notifications";
import { type WorkerPermissions, type WorkerPermission } from "@/config/business";
import { PermissionToggles, togglePermission } from "./PermissionToggles";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { samePermissions } from "./permission-diff";
import { Modal } from "@/components/ui/Modal";
import { useShiftsStore } from "@/stores/shifts.store";
import { CloseShiftModal } from "@/components/shift/CloseShiftModal";

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
  const [closingShiftId, setClosingShiftId] = useState<string | null>(null);

  // Sin permiso de caja no se abre ni se cierra turno (close_shift lo exige).
  // Si se le quita con un turno abierto, ese cajón lo cierra el dueño.
  const openShift = useShiftsStore((s) =>
    s.shifts.find((sh) => sh.worker_id === workerId && sh.status === "open"),
  );
  const losesPos = !admin && (isAdmin || current.pos === true) && perms.pos !== true;
  const showShiftWarning = Boolean(openShift) && losesPos;
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
    <Modal
      open
      onClose={() => void requestClose()}
      title="Permisos"
      className="max-w-md!"
      bodyClassName="border-t border-outline-variant/10"
      footerClassName=""
      footer={
        <div className="flex items-center justify-between gap-4 p-6 pt-4">
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
      }
    >
        <div className="p-6 space-y-3">
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

              {showShiftWarning && openShift && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-on-surface">
                  <p>
                    Tiene un turno abierto desde las{" "}
                    {new Date(openShift.opened_at).toLocaleTimeString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    . Sin permiso de Punto de Venta no podrá cerrarlo: ciérralo tú para cuadrar la caja.
                  </p>
                  <button
                    type="button"
                    onClick={() => setClosingShiftId(openShift.id)}
                    className="mt-2 px-3 py-1.5 rounded-lg border border-outline-variant/20 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    Cerrar su turno
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {closingShiftId && (
          <CloseShiftModal shiftId={closingShiftId} onClose={() => setClosingShiftId(null)} />
        )}
    </Modal>
    {dialog}
    </>
  );
}

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { IconUsers, IconPlus, IconX, IconLogOut, IconCheck } from "@/app/assets/icons/DashboardIcons";
import { useWorkerStore } from "@/stores/worker.store";
import { useShiftsStore } from "@/stores/shifts.store";
import type { WorkerMember } from "@/services/worker.service";
import { useProfile } from "@/components/ProfileProvider";
import { BusinessKeyCard } from "@/components/BusinessKeyCard";
import { CloseShiftModal } from "@/components/shift/CloseShiftModal";
import { notifySuccess } from "@/lib/notifications";
import {
  WORKER_PERMISSION_LABELS,
  staffRolesForType,
  type WorkerPermission,
  type WorkerPermissions,
} from "@/config/business";

/**
 * Lista de toggles de permisos. Compartida por el alta y la edición para que
 * agregar un permiso en WORKER_PERMISSION_LABELS baste para verlo en ambos.
 */
function PermissionToggles({
  perms,
  onToggle,
}: {
  perms: WorkerPermissions;
  onToggle: (p: WorkerPermission) => void;
}) {
  const allKeys = Object.keys(WORKER_PERMISSION_LABELS) as WorkerPermission[];

  return (
    <div className="space-y-2">
      {allKeys.map((perm) => (
        <button
          key={perm}
          type="button"
          onClick={() => onToggle(perm)}
          className={`w-full flex items-center justify-between gap-4 p-3 rounded-2xl border text-left transition-colors ${
            perms[perm]
              ? "bg-primary/5 border-primary/40"
              : "bg-surface-container-low border-outline-variant/10 hover:bg-surface-container"
          }`}
        >
          <span className="text-sm font-semibold text-on-surface">
            {WORKER_PERMISSION_LABELS[perm]}
          </span>
          <span
            className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
              perms[perm]
                ? "bg-primary"
                : "bg-surface-container-highest border border-outline-variant/20"
            }`}
          >
            <span
              className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-all ${
                perms[perm] ? "left-[22px]" : "left-[2px]"
              }`}
            />
          </span>
        </button>
      ))}
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const inviteWorker = useWorkerStore((s) => s.inviteWorker);
  const submitting = useWorkerStore((s) => s.submitting);
  const error = useWorkerStore((s) => s.error);
  const profile = useProfile();
  const roleOptions = staffRolesForType(profile?.businessType ?? null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [perms, setPerms] = useState<WorkerPermissions>({});
  const [done, setDone] = useState(false);

  const togglePerm = (p: WorkerPermission) => {
    setPerms((prev) => ({ ...prev, [p]: !prev[p] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await inviteWorker({ username, password, fullName, role, permissions: perms });
    if (ok) setDone(true);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-surface-container rounded-3xl w-full max-w-md p-8 text-center border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/20 flex items-center justify-center mb-4">
            <IconCheck className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-2">Trabajador creado</h2>
          <p className="text-sm text-on-surface-variant mb-6">
            Se ha creado la cuenta para <strong>{fullName}</strong>. Ya puede iniciar sesión en la pestaña
            <span className="font-semibold"> Empleado</span> con la llave del negocio, su usuario
            <strong> {username}</strong> y su contraseña.
          </p>
          <button
            onClick={onClose}
            className="py-2.5 px-6 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10 shrink-0">
          <h2 className="text-lg font-bold text-on-surface">Invitar trabajador</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
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
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Usuario</label>
            <input
              type="text"
              required
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
              placeholder="ej: juan.perez"
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              El trabajador entrará con la llave del negocio, este usuario y su contraseña.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Contraseña</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Rol / Cargo</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface"
            >
              <option value="">Seleccionar cargo</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 border-t border-outline-variant/10">
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Permisos</label>
            <p className="text-xs text-on-surface-variant mb-3">
              Elige a qué secciones tendrá acceso. Puedes cambiarlos después.
            </p>
            <PermissionToggles perms={perms} onToggle={togglePerm} />
          </div>

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
              {submitting ? "Creando…" : "Crear trabajador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PermissionsPanel({
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
    setPerms((prev) => ({ ...prev, [p]: !prev[p] }));
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

function EditWorkerModal({ worker, onClose }: { worker: WorkerMember; onClose: () => void }) {
  const updateWorker = useWorkerStore((s) => s.updateWorker);
  const submitting = useWorkerStore((s) => s.submitting);
  const error = useWorkerStore((s) => s.error);
  const profile = useProfile();
  const roleOptions = staffRolesForType(profile?.businessType ?? null);
  // Incluye el cargo actual aunque no esté en el catálogo (p. ej. datos antiguos).
  const options =
    worker.role && !roleOptions.includes(worker.role) ? [worker.role, ...roleOptions] : roleOptions;

  const [fullName, setFullName] = useState(worker.full_name ?? "");
  const [username, setUsername] = useState(worker.username ?? "");
  const [role, setRole] = useState(worker.role ?? "");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await updateWorker(worker.id, {
      fullName,
      username,
      role,
      password: password || undefined,
    });
    if (ok) {
      notifySuccess("Trabajador actualizado", "Los datos del trabajador se guardaron.");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Editar trabajador</h2>
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
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Usuario</label>
            <input
              type="text"
              required
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
              placeholder="ej: juan.perez"
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Rol / Cargo</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface"
            >
              <option value="">Seleccionar cargo</option>
              {options.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Nueva contraseña</label>
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Dejar en blanco para no cambiarla"
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50"
            />
          </div>

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

const shiftMoney = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const shiftDate = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Estado del arqueo de un turno cerrado. El sobrante también es una alerta
 * (dinero sin venta que lo respalde), por eso no comparte el verde del cuadre.
 */
function ShiftStatusBadge({ difference, notes }: { difference: number | null; notes: string | null }) {
  if (difference == null) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant">
        Cerrado
      </span>
    );
  }

  if (difference === 0) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#10b981]/10 text-[#10b981]">
        Cuadrado
      </span>
    );
  }

  const faltante = difference < 0;
  return (
    <span
      title={notes ?? undefined}
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${
        faltante ? "bg-error/10 text-error" : "bg-amber-500/10 text-amber-500"
      }`}
    >
      {faltante ? "Faltante" : "Sobrante"} {shiftMoney(Math.abs(difference))}
    </span>
  );
}

function ShiftHistorySection({ workers }: { workers: WorkerMember[] }) {
  const shifts = useShiftsStore((s) => s.shifts);
  const loading = useShiftsStore((s) => s.loading);
  const fetchShifts = useShiftsStore((s) => s.fetchShifts);

  const [closingShiftId, setClosingShiftId] = useState<string | null>(null);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const workerName = (workerId: string) =>
    workers.find((w) => w.id === workerId)?.full_name ?? "Empleado";

  return (
    <div className="mt-10">
      <div className="mb-4">
        <h3 className="text-base font-bold text-on-surface">Historial de turnos</h3>
        <p className="text-sm text-on-surface-variant mt-1">
          Aperturas y cierres de caja de tus empleados, con el arqueo de cada turno.
        </p>
      </div>

      {loading && shifts.length === 0 ? (
        <div className="text-sm text-on-surface-variant py-8 text-center">Cargando turnos…</div>
      ) : shifts.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-8 text-center text-sm text-on-surface-variant">
          Aún no hay turnos registrados. Cuando un empleado abra su primer turno aparecerá aquí.
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-outline-variant/10 text-xs uppercase tracking-wide text-on-surface-variant">
                <th className="p-4 font-semibold">Empleado</th>
                <th className="p-4 font-semibold">Apertura</th>
                <th className="p-4 font-semibold">Cierre</th>
                <th className="p-4 font-semibold text-right">Ventas</th>
                <th className="p-4 font-semibold text-right">Base</th>
                <th className="p-4 font-semibold text-right">Retiros</th>
                <th className="p-4 font-semibold text-right">Esperado</th>
                <th className="p-4 font-semibold text-right">Contado</th>
                <th className="p-4 font-semibold text-right">Diferencia</th>
                <th className="p-4 font-semibold text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => {
                const open = s.status === "open";
                return (
                  <tr key={s.id} className="border-b border-outline-variant/10 last:border-0">
                    <td className="p-4 font-semibold text-on-surface">
                      {workerName(s.worker_id)}
                      {s.notes && (
                        <span className="block text-xs font-normal text-on-surface-variant mt-0.5 max-w-[220px] truncate" title={s.notes}>
                          {s.notes}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-on-surface-variant whitespace-nowrap">{shiftDate(s.opened_at)}</td>
                    <td className="p-4 text-on-surface-variant whitespace-nowrap">
                      {s.closed_at ? shiftDate(s.closed_at) : "—"}
                    </td>
                    <td className="p-4 text-right text-on-surface tabular-nums">
                      {open ? "—" : `${s.sales_count ?? 0} · ${shiftMoney(s.sales_total ?? 0)}`}
                    </td>
                    <td className="p-4 text-right text-on-surface tabular-nums">{shiftMoney(s.opening_cash)}</td>
                    <td className="p-4 text-right text-on-surface-variant tabular-nums">
                      {s.withdrawals_total ? `-${shiftMoney(s.withdrawals_total)}` : "—"}
                    </td>
                    <td className="p-4 text-right text-on-surface tabular-nums">
                      {s.expected_cash != null ? shiftMoney(s.expected_cash) : "—"}
                    </td>
                    <td className="p-4 text-right text-on-surface tabular-nums">
                      {s.closing_cash != null ? shiftMoney(s.closing_cash) : "—"}
                    </td>
                    <td
                      className={`p-4 text-right font-bold tabular-nums ${
                        s.difference == null
                          ? "text-on-surface-variant"
                          : s.difference === 0
                            ? "text-[#10b981]"
                            : s.difference < 0
                              ? "text-error"
                              : "text-amber-500"
                      }`}
                    >
                      {s.difference != null
                        ? `${s.difference > 0 ? "+" : ""}${shiftMoney(s.difference)}`
                        : "—"}
                    </td>
                    <td className="p-4 text-right">
                      {open ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#10b981]/10 text-[#10b981]">
                            Abierto
                          </span>
                          <button
                            onClick={() => setClosingShiftId(s.id)}
                            className="px-3 py-1.5 rounded-lg border border-outline-variant/20 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
                          >
                            Cerrar
                          </button>
                        </div>
                      ) : (
                        <ShiftStatusBadge difference={s.difference} notes={s.notes} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {closingShiftId && (
        <CloseShiftModal shiftId={closingShiftId} onClose={() => setClosingShiftId(null)} />
      )}
    </div>
  );
}

export default function TrabajadoresPage() {
  const workers = useWorkerStore((s) => s.workers);
  const loading = useWorkerStore((s) => s.loading);
  const fetchWorkers = useWorkerStore((s) => s.fetchWorkers);
  const deactivateWorker = useWorkerStore((s) => s.deactivateWorker);

  const [showInvite, setShowInvite] = useState(false);
  const [permsFor, setPermsFor] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  const handleDeactivate = useCallback(
    async (workerId: string, name: string) => {
      if (confirm(`¿Desactivar a "${name}"? El trabajador ya no podrá acceder al sistema.`)) {
        await deactivateWorker(workerId);
      }
    },
    [deactivateWorker],
  );

  const editingWorker = permsFor ? workers.find((w) => w.id === permsFor) : null;
  const workerToEdit = editFor ? workers.find((w) => w.id === editFor) : null;

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-lg font-bold text-on-surface">Trabajadores</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Invita empleados a tu negocio. Cada trabajador accede con su propio usuario y contraseña.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors shadow-lg shadow-primary/20"
        >
          <IconPlus className="w-4 h-4" />
          Invitar
        </button>
      </div>

      <div className="mb-6">
        <BusinessKeyCard />
      </div>

      {loading ? (
        <div className="text-sm text-on-surface-variant py-12 text-center">Cargando trabajadores…</div>
      ) : workers.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/10 p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-surface-container-high flex items-center justify-center mb-4">
            <IconUsers className="w-8 h-8 text-on-surface-variant" />
          </div>
          <h3 className="text-lg font-bold text-on-surface mb-2">Sin trabajadores aún</h3>
          <p className="text-sm text-on-surface-variant max-w-md mx-auto">
            Invita a tus empleados para que puedan usar el sistema con su propio acceso. Tú controlas lo que pueden ver y hacer.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {workers.map((worker) => {
            const activePerms = Object.entries(worker.worker_permissions ?? {})
              .filter(([, v]) => v)
              .map(([k]) => WORKER_PERMISSION_LABELS[k as WorkerPermission]);

            return (
              <div
                key={worker.id}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-on-surface truncate">
                      {worker.full_name ?? "Sin nombre"}
                    </p>
                    {worker.role && (
                      <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant">
                        {worker.role}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-on-surface-variant truncate">
                    {worker.username ? `@${worker.username}` : "Sin usuario"}
                  </p>
                  {activePerms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {activePerms.map((label) => (
                        <span
                          key={label}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  {activePerms.length === 0 && (
                    <p className="text-xs text-on-surface-variant/60 mt-1">Sin permisos configurados</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditFor(worker.id)}
                    className="px-4 py-2 rounded-xl border border-outline-variant/20 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setPermsFor(worker.id)}
                    className="px-4 py-2 rounded-xl border border-outline-variant/20 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    Permisos
                  </button>
                  <button
                    onClick={() => handleDeactivate(worker.id, worker.full_name ?? "este trabajador")}
                    className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                    title="Desactivar trabajador"
                  >
                    <IconLogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ShiftHistorySection workers={workers} />

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}

      {workerToEdit && (
        <EditWorkerModal worker={workerToEdit} onClose={() => setEditFor(null)} />
      )}

      {editingWorker && (
        <PermissionsPanel
          workerId={editingWorker.id}
          current={editingWorker.worker_permissions ?? {}}
          onClose={() => setPermsFor(null)}
        />
      )}
    </div>
  );
}

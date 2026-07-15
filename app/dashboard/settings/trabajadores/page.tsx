"use client";

import React, { useEffect, useState, useCallback } from "react";
import { IconUsers, IconPlus, IconX, IconLogOut, IconCheck } from "@/app/assets/icons/DashboardIcons";
import { useWorkerStore } from "@/stores/worker.store";
import {
  WORKER_PERMISSION_LABELS,
  type WorkerPermission,
  type WorkerPermissions,
} from "@/config/business";

function InviteModal({ onClose }: { onClose: () => void }) {
  const inviteWorker = useWorkerStore((s) => s.inviteWorker);
  const submitting = useWorkerStore((s) => s.submitting);
  const error = useWorkerStore((s) => s.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await inviteWorker({ email, password, fullName, role });
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
            Se ha creado la cuenta para <strong>{fullName}</strong>. El trabajador ya puede iniciar sesión con su email y contraseña.
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
      <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Invitar trabajador</h2>
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
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@correo.com"
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50"
            />
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
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ej: Barbero, Cajero, Lavador"
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
  const [saved, setSaved] = useState(false);

  const toggle = (p: WorkerPermission) => {
    setPerms((prev) => ({ ...prev, [p]: !prev[p] }));
    setSaved(false);
  };

  const handleSave = async () => {
    const ok = await updatePermissions(workerId, perms);
    if (ok) setSaved(true);
  };

  const allKeys = Object.keys(WORKER_PERMISSION_LABELS) as WorkerPermission[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Permisos del trabajador</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          <p className="text-sm text-on-surface-variant mb-4">
            Activa o desactiva los módulos a los que este trabajador puede acceder.
          </p>

          {allKeys.map((perm) => (
            <button
              key={perm}
              type="button"
              onClick={() => toggle(perm)}
              className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl border text-left transition-colors ${
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

        <div className="flex items-center justify-between gap-4 p-6 pt-0">
          <span className={`text-sm font-medium text-[#10b981] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
            ✓ Permisos guardados
          </span>
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

export default function TrabajadoresPage() {
  const workers = useWorkerStore((s) => s.workers);
  const loading = useWorkerStore((s) => s.loading);
  const fetchWorkers = useWorkerStore((s) => s.fetchWorkers);
  const deactivateWorker = useWorkerStore((s) => s.deactivateWorker);

  const [showInvite, setShowInvite] = useState(false);
  const [permsFor, setPermsFor] = useState<string | null>(null);

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
                  <p className="font-semibold text-on-surface truncate">
                    {worker.full_name ?? "Sin nombre"}
                  </p>
                  <p className="text-sm text-on-surface-variant truncate">{worker.email}</p>
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

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}

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

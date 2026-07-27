"use client";

import { useEffect, useState, useCallback } from "react";
import { IconUsers, IconPlus, IconLogOut } from "@/app/assets/icons/DashboardIcons";
import { useWorkerStore } from "@/stores/worker.store";
import { BusinessKeyCard } from "@/components/BusinessKeyCard";
import {
  WORKER_PERMISSION_LABELS,
  type WorkerPermission,
} from "@/config/business";
import { InviteModal } from "./components/InviteModal";
import { EditWorkerModal } from "./components/EditWorkerModal";
import { PermissionsPanel } from "./components/PermissionsPanel";
import { ShiftHistorySection } from "./components/ShiftHistorySection";

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

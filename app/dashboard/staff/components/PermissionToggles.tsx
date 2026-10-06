"use client";

import { useMemo } from "react";
import {
  WORKER_PERMISSION_LABELS,
  WORKER_PERMISSION_PARENT,
  WORKER_PERMISSION_HINTS,
  permissionsForBusiness,
  type WorkerPermission,
  type WorkerPermissions,
} from "@/config/business";
import { useProfile } from "@/components/ProfileProvider";

/** Los permisos que aplican al negocio del perfil activo (ver `permissionsForBusiness`). */
export function useApplicablePermissions(): WorkerPermission[] {
  const profile = useProfile();
  const businessType = profile?.businessType ?? null;
  const modules = profile?.modules ?? null;
  return useMemo(() => permissionsForBusiness(businessType, modules), [businessType, modules]);
}

export function togglePermission(prev: WorkerPermissions, p: WorkerPermission): WorkerPermissions {
  const next: WorkerPermissions = { ...prev, [p]: !prev[p] };
  if (!next[p]) {
    for (const key of Object.keys(WORKER_PERMISSION_PARENT) as WorkerPermission[]) {
      if (WORKER_PERMISSION_PARENT[key] === p) next[key] = false;
    }
  }
  return next;
}

export function PermissionToggles({
  perms,
  onToggle,
  onReplace,
}: {
  perms: WorkerPermissions;
  onToggle: (p: WorkerPermission) => void;
  /** Si viene, se ofrecen los atajos "Marcar todos" / "Desmarcar todos". */
  onReplace?: (next: WorkerPermissions) => void;
}) {
  // Solo lo que existe en este negocio: un salón no ve Vehículos ni
  // Facturación. Lo escondido que ya estaba encendido se conserva al guardar.
  const allKeys = useApplicablePermissions();
  const topLevel = allKeys.filter((k) => !WORKER_PERMISSION_PARENT[k]);
  const childrenOf = (parent: WorkerPermission) =>
    allKeys.filter((k) => WORKER_PERMISSION_PARENT[k] === parent);

  const Toggle = ({ perm, disabled }: { perm: WorkerPermission; disabled?: boolean }) => {
    const on = Boolean(perms[perm]) && !disabled;
    const hint = WORKER_PERMISSION_HINTS[perm];
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(perm)}
        className={`w-full flex items-center justify-between gap-4 p-3 rounded-2xl border text-left transition-colors ${
          on
            ? "bg-primary/5 border-primary/40"
            : "bg-surface-container-low border-outline-variant/10 hover:bg-surface-container"
        } ${disabled ? "opacity-40 cursor-not-allowed hover:bg-surface-container-low" : ""}`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-on-surface">
            {WORKER_PERMISSION_LABELS[perm]}
          </span>
          {hint && (
            <span className="block text-xs text-on-surface-variant mt-0.5">{hint}</span>
          )}
        </span>
        <span
          className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
            on ? "bg-primary" : "bg-surface-container-highest border border-outline-variant/20"
          }`}
        >
          <span
            className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-all ${
              on ? "left-[22px]" : "left-[2px]"
            }`}
          />
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      {onReplace && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <span className="text-xs text-on-surface-variant">
            Atajo para los permisos de abajo (no lo convierte en administrador).
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                onReplace({ ...perms, ...Object.fromEntries(allKeys.map((k) => [k, true])) })
              }
              className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              Marcar todos
            </button>
            <button
              type="button"
              onClick={() => onReplace({})}
              className="rounded-full border border-outline-variant/20 px-3 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
            >
              Desmarcar todos
            </button>
          </div>
        </div>
      )}
      {topLevel.map((perm) => {
        const children = childrenOf(perm);
        return (
          <div key={perm} className="space-y-2">
            <Toggle perm={perm} />
            {children.length > 0 && (
              <div className="ml-4 pl-3 border-l-2 border-outline-variant/20 space-y-2">
                {children.map((child) => (
                  <Toggle key={child} perm={child} disabled={!perms[perm]} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { IconX, IconCheck } from "@/app/assets/icons/DashboardIcons";
import { useWorkerStore } from "@/stores/worker.store";
import { useProfile } from "@/components/ProfileProvider";
import { Select } from "@/components/ui/Select";
import { staffRolesForType, type WorkerPermissions, type WorkerPermission } from "@/config/business";
import { PermissionToggles, togglePermission } from "./PermissionToggles";

export function InviteModal({ onClose }: { onClose: () => void }) {
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
    setPerms((prev) => togglePermission(prev, p));
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

          <Select
            label="Rol / Cargo"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">Seleccionar cargo</option>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>

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

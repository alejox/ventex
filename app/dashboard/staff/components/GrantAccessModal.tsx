"use client";

import React, { useState } from "react";
import { IconX, IconCheck } from "@/app/assets/icons/DashboardIcons";
import { useStaffStore } from "@/stores/staff.store";
import { useProfile } from "@/components/ProfileProvider";
import { Select } from "@/components/ui/Select";
import {
  ADMIN_ROLE_LABEL,
  hasAnyPermission,
  permissionTemplatesFor,
  staffRolesForType,
  suggestedTemplateForRole,
  templatePermissions,
  type WorkerPermissions,
  type WorkerPermission,
} from "@/config/business";
import { PermissionToggles, togglePermission, useApplicablePermissions } from "./PermissionToggles";

/** "" = desde cero; "custom" = el dueño tocó los toggles después de elegir. */
type TemplateChoice = string;
const CUSTOM = "custom";
import type { TeamMember } from "@/lib/team";

/**
 * Le crea acceso al sistema a alguien que YA tiene ficha de personal.
 *
 * `staffId` es lo que amarra la cuenta a la ficha: sin él nacería una cuenta
 * suelta y la persona volvería a aparecer dos veces en la lista, que es justo
 * el problema que esta pantalla vino a resolver. El nombre sale de la ficha y
 * no se edita acá — se cambia en la ficha, que es la que manda.
 */
export function GrantAccessModal({
  member,
  onClose,
}: {
  member: TeamMember;
  onClose: () => void;
}) {
  const grantAccess = useStaffStore((s) => s.grantAccess);
  const submitting = useStaffStore((s) => s.submitting);
  const error = useStaffStore((s) => s.error);
  const profile = useProfile();
  const roleOptions = staffRolesForType(profile?.businessType ?? null);
  const options =
    member.role && !roleOptions.includes(member.role) ? [member.role, ...roleOptions] : roleOptions;

  const [email, setEmail] = useState(member.email ?? "");
  const [role, setRole] = useState(member.role ?? "");
  // Elegir el cargo "Administrador" lo sugiere, pero el dueño puede cambiarlo.
  const [isAdmin, setIsAdmin] = useState(member.role === ADMIN_ROLE_LABEL);
  const applicable = useApplicablePermissions();
  // Las plantillas dependen solo del perfil, que no cambia con el modal abierto.
  const [templates] = useState(() =>
    permissionTemplatesFor(profile?.businessType ?? null, profile?.modules ?? null),
  );
  // Nace con la plantilla de su cargo: antes nacía sin permisos, aceptaba la
  // invitación y entraba a un sistema donde no veía nada.
  const [initialTemplate] = useState(() =>
    member.role === ADMIN_ROLE_LABEL ? null : suggestedTemplateForRole(member.role, templates),
  );
  const [templateId, setTemplateId] = useState<TemplateChoice>(initialTemplate?.id ?? "");
  const [perms, setPermsState] = useState<WorkerPermissions>(() =>
    initialTemplate ? templatePermissions(initialTemplate) : {},
  );
  // Aviso de "sin permisos": el primer envío lo muestra, el segundo confirma.
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [done, setDone] = useState(false);

  const setPerms = (next: WorkerPermissions) => {
    setPermsState(next);
    setTemplateId(CUSTOM);
    setConfirmEmpty(false);
  };

  const togglePerm = (p: WorkerPermission) => {
    setPermsState((prev) => togglePermission(prev, p));
    setTemplateId(CUSTOM);
    setConfirmEmpty(false);
  };

  const applyTemplate = (id: TemplateChoice) => {
    const template = templates.find((t) => t.id === id);
    setTemplateId(id);
    setPermsState(template ? templatePermissions(template) : {});
    setConfirmEmpty(false);
  };

  const sinPermisos = !isAdmin && !hasAnyPermission(perms, applicable);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sinPermisos && !confirmEmpty) {
      setConfirmEmpty(true);
      return;
    }
    const ok = await grantAccess({
      email,
      fullName: member.full_name,
      role,
      staffId: member.id,
      permissions: isAdmin ? {} : perms,
      isAdmin,
    });
    if (ok) setDone(true);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-surface-container rounded-3xl w-full max-w-md p-8 text-center border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/20 flex items-center justify-center mb-4">
            <IconCheck className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-2">Invitación creada</h2>
          <p className="text-sm text-on-surface-variant mb-6">
            <strong>{member.full_name}</strong> podrá aceptar el acceso con{" "}
            <strong>{email}</strong>. Si todavía no tiene una cuenta, recibirá
            un correo para crear su contraseña.
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
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-on-surface">Permisos y acceso</h2>
            <p className="text-sm text-on-surface-variant mt-0.5 truncate">{member.full_name}</p>
          </div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors">
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
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Correo electrónico</label>
            <input
              type="email"
              required
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              placeholder="persona@ejemplo.com"
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              La persona recibirá la invitación y elegirá su propia contraseña.
            </p>
          </div>

          <Select
            label="Rol / Cargo"
            value={role}
            onChange={(e) => {
              const next = e.target.value;
              setRole(next);
              if (next === ADMIN_ROLE_LABEL) setIsAdmin(true);
              // Cambiar de cargo cambia la plantilla, salvo que el dueño ya
              // haya ajustado los permisos a mano: eso no se pisa.
              if (templateId !== CUSTOM) {
                const suggested = suggestedTemplateForRole(next, templates);
                if (suggested) applyTemplate(suggested.id);
              }
            }}
          >
            <option value="">Seleccionar cargo</option>
            {options.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>

          <button
            type="button"
            onClick={() => setIsAdmin((v) => !v)}
            className={`w-full flex items-center justify-between gap-4 p-3 rounded-2xl border text-left transition-colors ${
              isAdmin ? "bg-primary/5 border-primary/40" : "bg-surface-container-low border-outline-variant/10 hover:bg-surface-container"
            }`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-on-surface">Administrador del negocio</span>
              <span className="block text-xs text-on-surface-variant mt-0.5">
                Actúa como el dueño: ve y gestiona todo el negocio, liquida comisiones y
                configura. No puede cambiar la facturación ni los accesos del equipo.
              </span>
            </span>
            <span className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${isAdmin ? "bg-primary" : "bg-surface-container-highest border border-outline-variant/20"}`}>
              <span className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isAdmin ? "left-[22px]" : "left-[2px]"}`} />
            </span>
          </button>

          {isAdmin ? (
            <p className="text-sm text-on-surface-variant">
              Un administrador tiene acceso a todo; los permisos individuales no aplican.
            </p>
          ) : (
            <div className="pt-2 border-t border-outline-variant/10">
              <label className="block text-sm font-semibold text-on-surface mb-1.5">Permisos</label>
              <p className="text-xs text-on-surface-variant mb-3">
                Elige a qué secciones tendrá acceso. Puedes cambiarlos después.
              </p>
              <div className="mb-3">
                <Select
                  label="Empezar desde…"
                  value={templateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">Desde cero (sin permisos)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                  {templateId === CUSTOM && <option value={CUSTOM}>Personalizado</option>}
                </Select>
                {templates.find((t) => t.id === templateId) && (
                  <p className="text-xs text-on-surface-variant mt-1">
                    {templates.find((t) => t.id === templateId)!.description} Ajusta lo que quieras abajo.
                  </p>
                )}
              </div>
              <PermissionToggles perms={perms} onToggle={togglePerm} onReplace={setPerms} />
            </div>
          )}

          {confirmEmpty && sinPermisos && (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-on-surface"
            >
              <strong>No marcaste ningún permiso.</strong> {member.full_name} podrá entrar, pero
              no verá ninguna sección hasta que le des alguno. Elige una plantilla arriba o
              envía la invitación igual.
            </div>
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
              {submitting ? "Creando…" : confirmEmpty && sinPermisos ? "Enviar sin permisos" : "Crear invitación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

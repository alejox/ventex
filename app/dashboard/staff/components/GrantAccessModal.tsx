"use client";

import React, { useState } from "react";
import { IconCheck } from "@/app/assets/icons/DashboardIcons";
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
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { samePermissions } from "./permission-diff";

/** "" = desde cero; "custom" = el dueño tocó los toggles después de elegir. */
type TemplateChoice = string;
const CUSTOM = "custom";
import type { TeamMember } from "@/lib/team";
import { Modal } from "@/components/ui/Modal";

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
  // Cómo nació el formulario: contra esto se decide si hay cambios sin guardar.
  const [initialValues] = useState(() => ({ email, role, isAdmin, perms }));
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

  const dirty =
    !done &&
    (email !== initialValues.email ||
      role !== initialValues.role ||
      isAdmin !== initialValues.isAdmin ||
      !samePermissions(perms, initialValues.perms));
  const { confirm, dialog } = useConfirm();

  /** Escape, la X, el fondo o "Cancelar": con cambios sin guardar, se pregunta. */
  const requestClose = async () => {
    if (submitting) return;
    if (dirty) {
      const discard = await confirm({
        title: "¿Descartar los cambios?",
        description: "Todavía no enviaste la invitación. Si cierras ahora, se pierde lo que configuraste.",
        confirmLabel: "Descartar",
        cancelLabel: "Seguir editando",
        tone: "danger",
      });
      if (!discard) return;
    }
    onClose();
  };

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
      <Modal
        open
        onClose={onClose}
        title="Invitación creada"
        icon={
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
            <IconCheck className="w-7 h-7 text-primary-ink" />
          </div>
        }
        description={
          <>
            <strong>{member.full_name}</strong> podrá aceptar el acceso con{" "}
            <strong>{email}</strong>. Si todavía no tiene una cuenta, recibirá
            un correo para crear su contraseña.
          </>
        }
        size="sm"
        dismissible={false}
        showCloseButton={false}
        className="max-w-md! text-center"
        bodyClassName="px-8 pb-8 pt-2"
      >
        <button
          onClick={onClose}
          className="py-2.5 px-6 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-dim transition-colors"
        >
          Cerrar
        </button>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={() => void requestClose()}
      title="Permisos y acceso"
      description={member.full_name}
      className="max-w-md!"
      bodyClassName="border-t border-outline-variant/10"
    >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
            role="switch"
            aria-checked={isAdmin}
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
              onClick={() => void requestClose()}
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
      {dialog}
    </Modal>
  );
}

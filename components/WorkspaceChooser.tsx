"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "@/stores/workspace.store";

export function WorkspaceChooser() {
  const context = useWorkspaceStore((state) => state.context);
  const loading = useWorkspaceStore((state) => state.loading);
  const error = useWorkspaceStore((state) => state.error);
  const load = useWorkspaceStore((state) => state.load);
  const select = useWorkspaceStore((state) => state.select);
  const accept = useWorkspaceStore((state) => state.accept);
  const signOut = useWorkspaceStore((state) => state.signOut);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (workspaceId: string) => {
    if (await select(workspaceId)) {
      window.location.assign("/dashboard");
    }
  };

  const leaveSession = async () => {
    if (await signOut()) {
      window.location.assign("/login");
    }
  };

  return (
    <div className="w-full max-w-[520px] mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-on-surface">
          Elegí un negocio
        </h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Tu acceso y tus permisos cambian de forma independiente en cada
          negocio.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-error/20 bg-error-container/20 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {loading && !context ? (
        <p className="text-center text-sm text-on-surface-variant">
          Cargando negocios…
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {(context?.available ?? []).map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                disabled={loading}
                onClick={() => void choose(workspace.workspace_id)}
                className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 text-left transition-colors hover:border-primary/40 hover:bg-surface-container disabled:opacity-50"
              >
                <span className="block font-semibold text-on-surface">
                  {workspace.business_name || "Mi negocio"}
                </span>
                <span className="mt-1 block text-xs text-on-surface-variant">
                  {workspace.member_kind === "owner"
                    ? "Dueño"
                    : workspace.role || "Empleado"}
                </span>
              </button>
            ))}
          </div>

          {(context?.invitations.length ?? 0) > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">
                Invitaciones pendientes
              </h2>
              {context?.invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container p-5"
                >
                  <p className="font-semibold text-on-surface">
                    {invitation.business_name || "Negocio Ventex"}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {invitation.role || "Miembro del equipo"}
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void accept(invitation.id)}
                    className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
                  >
                    Aceptar invitación
                  </button>
                </div>
              ))}
            </section>
          )}

          {(context?.available.length ?? 0) === 0 &&
            (context?.invitations.length ?? 0) === 0 && (
              <div className="rounded-2xl bg-surface-container p-5 text-center">
                <p className="text-sm text-on-surface-variant">
                  No tenés negocios disponibles. Si esperabas una invitación,
                  verificá que hayas iniciado sesión con el correo invitado.
                </p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void leaveSession()}
                  className="mt-4 rounded-xl border border-outline-variant/30 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-50"
                >
                  Cerrar sesión
                </button>
              </div>
            )}
        </>
      )}
    </div>
  );
}

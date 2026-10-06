"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useProfile } from "@/components/ProfileProvider";
import { useWorkspaceStore } from "@/stores/workspace.store";

export function WorkspaceSwitcher() {
  const profile = useProfile();
  const context = useWorkspaceStore((state) => state.context);
  const load = useWorkspaceStore((state) => state.load);
  const select = useWorkspaceStore((state) => state.select);
  const loading = useWorkspaceStore((state) => state.loading);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Se cierra con clic/toque afuera o con Escape (A23); Escape devuelve el
  // foco al botón para que el teclado no quede en el limbo.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const switchTo = async (workspaceId: string) => {
    if (workspaceId === profile?.workspaceId) {
      setOpen(false);
      return;
    }
    if (await select(workspaceId)) {
      // Full navigation intentionally destroys every workspace-scoped Zustand
      // cache before the next business renders.
      window.location.assign("/dashboard");
    }
  };

  if (!profile?.workspaceId) return null;

  const businessName = profile.businessName || "Mi negocio";
  const available = context?.available ?? [];
  const invitations = context?.invitations.length ?? 0;

  // Con un solo negocio y sin invitaciones no hay a dónde cambiar: un botón
  // "Cambiar negocio" que abre una lista de uno es ruido (A23). Queda el nombre.
  if (available.length <= 1 && invitations === 0) {
    return (
      <div className="min-w-0 max-w-32 sm:max-w-48 px-1 text-xs text-on-surface" title={businessName}>
        <span className="block truncate font-semibold">{businessName}</span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full max-w-32 sm:max-w-48 rounded-xl border border-divider bg-surface-container px-2.5 sm:px-3 py-1.5 text-left text-xs text-on-surface hover:bg-surface-container-high transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="block truncate font-semibold">{businessName}</span>
        <span className="block truncate text-[11px] text-on-surface-variant">
          {invitations > 0 ? `Cambiar negocio · ${invitations} invitación${invitations === 1 ? "" : "es"}` : "Cambiar negocio"}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-divider bg-surface-container-lowest p-2 shadow-2xl">
          {available.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              disabled={loading}
              onClick={() => void switchTo(workspace.workspace_id)}
              className="block w-full rounded-xl px-3 py-3 text-left text-sm text-on-surface hover:bg-surface-container disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
            >
              <span className="block truncate font-semibold">
                {workspace.business_name || "Mi negocio"}
              </span>
              <span className="text-xs text-on-surface-variant">
                {workspace.member_kind === "owner"
                  ? "Dueño"
                  : workspace.role || "Empleado"}
              </span>
            </button>
          ))}
          {invitations > 0 && (
            <Link
              href="/workspace"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-xl px-3 py-2 text-xs font-semibold text-primary-ink hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
            >
              Ver invitaciones pendientes
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

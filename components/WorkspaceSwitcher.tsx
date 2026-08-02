"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full max-w-32 sm:max-w-48 rounded-xl border border-outline-variant/20 bg-surface-container px-2.5 sm:px-3 py-2 text-left text-xs text-on-surface"
        aria-expanded={open}
      >
        <span className="block truncate font-semibold">
          {profile.businessName || "Mi negocio"}
        </span>
        <span className="block text-[10px] text-on-surface-variant">
          Cambiar negocio
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-2 shadow-2xl">
          {(context?.available ?? []).map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              disabled={loading}
              onClick={() => void switchTo(workspace.workspace_id)}
              className="block w-full rounded-xl px-3 py-3 text-left text-sm text-on-surface hover:bg-surface-container disabled:opacity-50"
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
          {(context?.invitations.length ?? 0) > 0 && (
            <Link
              href="/workspace"
              className="mt-1 block rounded-xl px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              Ver invitaciones pendientes
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

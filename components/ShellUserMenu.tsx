"use client";

import Link from "next/link";
import { useState } from "react";
import { signout } from "@/utils/supabase/actions";
import { IconSettings, IconLogOut } from "@/app/assets/icons/DashboardIcons";

/**
 * Menú de usuario del header (avatar → nombre, correo, ajustes y cerrar sesión).
 * Único para los tres shells (dashboard, super admin y revendedor): el menú es
 * el mismo en todos, así que vive aquí y no se personaliza por panel.
 */
export function ShellUserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 group focus:outline-none"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center overflow-hidden transition-colors group-hover:border-primary/60">
          <span className="text-xs font-bold text-primary">{initials}</span>
        </div>
        <span className="hidden sm:block text-sm font-medium text-on-surface group-hover:text-primary transition-colors">
          {name.split(" ")[0]}
        </span>
      </button>

      {open && (
        <>
          {/* Capa de cierre al hacer clic fuera. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-3 w-56 rounded-xl bg-surface-container-high border border-outline-variant/10 shadow-2xl overflow-hidden z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-3 border-b border-outline-variant/10 mb-1">
              <p className="text-sm font-bold text-on-surface truncate">{name}</p>
              <p className="text-xs text-on-surface-variant truncate">{email}</p>
            </div>

            <Link
              href="/dashboard/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors w-full text-left"
            >
              <IconSettings className="w-4 h-4" />
              Ajustes de Perfil
            </Link>

            <form action={signout}>
              <button
                type="submit"
                className="flex items-center gap-3 px-4 py-2 mt-1 text-sm font-medium text-error hover:text-error-dim hover:bg-error/10 transition-colors w-full text-left"
              >
                <IconLogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

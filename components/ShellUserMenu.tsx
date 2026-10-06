"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { signout } from "@/utils/supabase/actions";
import { IconSettings, IconLogOut } from "@/app/assets/icons/DashboardIcons";

/**
 * Menú de usuario del header (avatar → nombre, correo, ajustes y cerrar sesión).
 * Único para los tres shells (dashboard, super admin y revendedor): el menú es
 * el mismo en todos, así que vive aquí y no se personaliza por panel.
 *
 * `showSettings` oculta el acceso a Ajustes: los trabajadores no administran la
 * configuración del negocio (ver el gate en app/dashboard/settings/layout.tsx).
 */
export function ShellUserMenu({
  name,
  email,
  showSettings = true,
}: {
  name: string;
  email: string;
  showSettings?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  /** Cierra y, si se pide, devuelve el foco al avatar (Escape, no un clic afuera). */
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  // Al abrir, el foco entra al primer ítem (patrón "menu button" de ARIA).
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "ArrowDown":
        event.preventDefault();
        list[(index + 1) % list.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        list[(index - 1 + list.length) % list.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        list[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        list[list.length - 1]?.focus();
        break;
      case "Tab":
        // Tab sale del menú: se cierra para que no quede abierto a la deriva.
        setOpen(false);
        break;
    }
  };

  const itemClass =
    "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors w-full text-left focus-visible:outline-none";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-3 group rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Menú de usuario de ${name}`}
      >
        <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary-ink/30 flex items-center justify-center overflow-hidden transition-colors group-hover:border-primary-ink/60">
          <span className="text-xs font-bold text-primary-ink">{initials}</span>
        </div>
        <span className="hidden sm:block text-sm font-medium text-on-surface group-hover:text-primary-ink transition-colors">
          {name.split(" ")[0]}
        </span>
      </button>

      {open && (
        <>
          {/* Capa de cierre al hacer clic fuera. */}
          <div className="fixed inset-0 z-40" onClick={() => close(false)} />
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Opciones de la cuenta"
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 mt-3 w-56 rounded-xl bg-surface-container-high border border-divider shadow-2xl overflow-hidden z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="px-4 py-3 border-b border-divider mb-1">
              <p className="text-sm font-bold text-on-surface truncate">{name}</p>
              <p className="text-xs text-on-surface-variant truncate">{email}</p>
            </div>

            {/* "Configuración" y no "Ajustes de Perfil": lleva a la
                configuración del NEGOCIO, no a un perfil personal (A9). */}
            {showSettings && (
              <Link
                href="/dashboard/settings"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className={`${itemClass} text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest focus-visible:bg-surface-container-highest focus-visible:text-on-surface`}
              >
                <IconSettings className="w-4 h-4" aria-hidden="true" />
                Configuración
              </Link>
            )}

            <form action={signout}>
              <button
                type="submit"
                role="menuitem"
                tabIndex={-1}
                className={`${itemClass} mt-1 text-error hover:bg-error/10 focus-visible:bg-error/10`}
              >
                <IconLogOut className="w-4 h-4" aria-hidden="true" />
                Cerrar sesión
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

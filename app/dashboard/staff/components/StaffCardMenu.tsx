"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export interface StaffMenuAction {
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger" | "primary";
  disabled?: boolean;
}

/**
 * Menú "⋯" de la tarjeta de Personal: las acciones secundarias que antes eran
 * seis botones apilados en cada tarjeta.
 *
 * Patrón de menú de WAI-ARIA: botón con `aria-haspopup`/`aria-expanded`, lista
 * con `role="menu"`, flechas para moverse, Escape cierra y devuelve el foco al
 * botón, y un clic afuera también cierra.
 */
export function StaffCardMenu({ label, actions }: { label: string; actions: StaffMenuAction[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current.find((item) => item && !item.disabled)?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled));
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      enabled[(index + 1) % enabled.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      enabled[(index - 1 + enabled.length) % enabled.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      enabled[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      enabled[enabled.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  if (actions.length === 0) return null;

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="grid h-9 w-9 place-items-center rounded-full border border-outline-variant/20 bg-surface-container-lowest/90 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1 flex w-52 flex-col rounded-xl border border-outline-variant/30 bg-surface-container-high p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
        >
          {actions.map((action, index) => (
            <button
              key={action.label}
              ref={(node) => { items.current[index] = node; }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={action.disabled}
              onClick={() => {
                close(false);
                action.onSelect();
              }}
              className={`rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-container-highest focus:bg-surface-container-highest focus:outline-none disabled:opacity-50 ${
                action.tone === "danger" ? "text-error" : action.tone === "primary" ? "font-semibold text-primary" : "text-on-surface"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

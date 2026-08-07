"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Product } from "@/services/inventory.service";

interface DropdownRect {
  top: number;
  left: number;
  width: number;
  /** Si se abre hacia arriba porque abajo no entraba. */
  up: boolean;
}

/** Alto estimado del panel, para decidir hacia qué lado abrirlo. */
const PANEL_MAX_HEIGHT = 260;

function rectFor(el: HTMLElement): DropdownRect {
  const box = el.getBoundingClientRect();
  const below = window.innerHeight - box.bottom;
  const up = below < PANEL_MAX_HEIGHT && box.top > below;
  return {
    top: up ? box.top - PANEL_MAX_HEIGHT - 4 : box.bottom + 4,
    left: box.left,
    width: box.width,
    up,
  };
}

interface ParentProductSearchProps {
  /** Candidatos a producto padre, ya filtrados (sin variantes ni servicios). */
  parents: Array<Pick<Product, "id" | "name" | "sku">>;
  /** `parent_product_id` elegido ("" = ninguno). */
  value: string;
  /** Nombre tipeado, para la opción de crear un padre nuevo. */
  createNewLabel: string;
  /** Si el usuario eligió explícitamente crear un padre nuevo. */
  createNewSelected: boolean;
  onSelect: (parentId: string) => void;
  onCreateNew: () => void;
}

/**
 * Buscador de producto padre para variantes.
 *
 * Reemplaza al `<Select>` que traía el "crear producto padre" preseleccionado:
 * acá elegir un padre existente es lo natural y "crear padre nuevo" es una
 * acción explícita al final del listado, nunca el valor por defecto del campo.
 *
 * Va por PORTAL a `<body>` con `position: fixed` y se abre hacia arriba cuando
 * abajo no hay lugar — mismo patrón que `PurchaseForm.tsx` y `CitySelect.tsx`.
 */
export function ParentProductSearch({
  parents,
  value,
  createNewLabel,
  createNewSelected,
  onSelect,
  onCreateNew,
}: ParentProductSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DropdownRect | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedParent = parents.find((p) => p.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parents.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 10);
  }, [parents, query]);

  const openDropdown = () => {
    if (inputRef.current) setRect(rectFor(inputRef.current));
    // Con un padre ya elegido y sin búsqueda escrita, sembrar el filtro con su
    // nombre para que la selección siga visible en el listado.
    setQuery((q) => (!q.trim() && value ? (selectedParent?.name ?? q) : q));
    setOpen(true);
  };

  const closeDropdown = () => {
    setOpen(false);
    setRect(null);
  };

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (inputRef.current) setRect(rectFor(inputRef.current));
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const showCreateNew = createNewLabel.trim().length > 0;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        aria-label="Producto padre"
        value={open ? query : (selectedParent?.name ?? "")}
        placeholder="Buscar producto padre…"
        onFocus={openDropdown}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) openDropdown();
        }}
        onBlur={() => setTimeout(closeDropdown, 200)}
        onKeyDown={(e) => {
          if (e.key === "Escape") closeDropdown();
        }}
        className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
      />

      {open &&
        rect &&
        createPortal(
          <div
            style={{ top: rect.top, left: rect.left, width: rect.width, maxHeight: PANEL_MAX_HEIGHT }}
            role="listbox"
            aria-label="Producto padre"
            className="fixed z-[120] overflow-y-auto bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl animate-in fade-in duration-100"
          >
            {parents.length === 0 ? (
              <p className="px-3 py-2 text-xs text-on-surface-variant">Todavía no tienes productos.</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-on-surface-variant">Sin resultados</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={p.id === value}
                  onMouseDown={() => onSelect(p.id)}
                  className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.sku && <span className="text-xs text-on-surface-variant font-mono">{p.sku}</span>}
                  </span>
                </button>
              ))
            )}

            {showCreateNew && (
              <button
                type="button"
                role="option"
                aria-selected={createNewSelected}
                onMouseDown={onCreateNew}
                className={`w-full text-left px-3 py-2.5 mt-1 pt-2 border-t border-outline-variant/10 transition-colors ${
                  createNewSelected ? "bg-primary/5 text-primary" : "text-primary"
                }`}
              >
                <span className="text-sm font-semibold">
                  {`✨ Usar "${createNewLabel.trim().toUpperCase()}" como nuevo producto padre`}
                </span>
                <span className="block mt-0.5 text-xs font-normal text-on-surface-variant">
                  Esto creará un producto padre nuevo, separado de tu catálogo actual.
                </span>
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchColombiaCities, type ColombiaCity } from "@/services/geo.service";

interface DropdownRect {
  top: number;
  left: number;
  width: number;
  /** Si se abre hacia arriba porque abajo no entraba. */
  up: boolean;
}

/** Alto estimado del panel, para decidir hacia qué lado abrirlo. */
const PANEL_MAX_HEIGHT = 240;

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

interface CitySelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * Buscador con predicción sobre las 1103 ciudades de Colombia
 * (`public.co_cities`, sembrada una sola vez — ver
 * `20260807100000_add_colombia_cities.sql`).
 *
 * El valor guardado es "Ciudad, Departamento", no solo "Ciudad": varios
 * nombres se repiten entre departamentos (ej. "Armenia" en Antioquia y
 * Quindío), y sin el departamento el dato queda ambiguo al leerlo después.
 *
 * Va por PORTAL a `<body>` con `position: fixed`, mismo patrón que el
 * buscador de producto de `PurchaseForm.tsx`: así ningún `overflow` de un
 * ancestro (el drawer de proveedor, un modal) lo recorta.
 */
export function CitySelect({
  id,
  value,
  onChange,
  className,
  placeholder = "Buscar ciudad…",
  ...rest
}: CitySelectProps) {
  const [cities, setCities] = useState<ColombiaCity[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DropdownRect | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchColombiaCities()
      .then(setCities)
      .catch(() => {
        /* sin ciudades el campo sigue funcionando como texto libre vacío */
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? cities.filter(
          (c) =>
            c.city.toLowerCase().includes(q) || c.department.toLowerCase().includes(q)
        )
      : cities;
    return base.slice(0, 15);
  }, [cities, search]);

  const openDropdown = () => {
    if (inputRef.current) setRect(rectFor(inputRef.current));
    setOpen(true);
    setSearch("");
  };

  const closeDropdown = () => {
    setOpen(false);
    setRect(null);
  };

  // El contenedor que scrollea puede no ser la ventana (un drawer, un modal
  // con su propio overflow-y): `capture: true` es la única forma de
  // enterarse del scroll de un ancestro, no solo del document.
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

  const select = (c: ColombiaCity) => {
    onChange(`${c.city}, ${c.department}`);
    closeDropdown();
  };

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        autoComplete="off"
        value={open ? search : value}
        onFocus={openDropdown}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!open) setOpen(true);
        }}
        // Delay para que el mousedown de una opción llegue antes que el blur.
        onBlur={() => setTimeout(closeDropdown, 200)}
        placeholder={placeholder}
        className={className}
        {...rest}
      />

      {open &&
        rect &&
        createPortal(
          <div
            style={{ top: rect.top, left: rect.left, width: rect.width, maxHeight: PANEL_MAX_HEIGHT }}
            className="fixed z-[300] overflow-y-auto bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl animate-in fade-in duration-100"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-on-surface-variant">Sin resultados</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={`${c.department}-${c.city}`}
                  type="button"
                  onMouseDown={() => select(c)}
                  className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  <span className="font-medium">{c.city}</span>
                  <span className="text-xs text-on-surface-variant ml-1.5">{c.department}</span>
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

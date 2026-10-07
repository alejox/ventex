"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";

/**
 * Paleta "Ir a…" del shell (A15): ⌘K / Ctrl+K o clic en el buscador del header.
 *
 * Es HONESTA sobre lo que hace: navega entre las secciones que esta persona ya
 * ve en su menú. No busca clientes ni productos (eso es el "mediano plazo" del
 * informe); por eso el placeholder dice "Ir a una sección…" y no "Buscar".
 * Antes el buscador mandaba cualquier palabra que no reconocía al catálogo.
 *
 * La lista de comandos la arma el shell con la salida de `visibleNavItems` /
 * `workerNavItems`: este componente no decide visibilidad, solo filtra y navega.
 */

export interface PaletteCommand {
  id: string;
  label: string;
  href: string;
  /** Encabezado del grupo del menú ("Ventas", "Clientes"…), si tiene. */
  group?: string | null;
  /** Sinónimos con los que la gente lo busca ("cobrar" → Punto de venta). */
  keywords?: string[];
}

/** Minúsculas y sin tildes: "Facturación" se encuentra escribiendo "facturacion". */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra y ordena por relevancia: primero lo que EMPIEZA con lo escrito, luego
 * lo que tiene una palabra que empieza así, luego coincidencias en grupo o
 * sinónimos. Sin texto, devuelve todo en el orden del menú. Pura y testeada
 * (`tests/command-palette.test.ts`).
 */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const q = normalizeSearch(query);
  if (!q) return commands;
  const scored: { command: PaletteCommand; score: number; index: number }[] = [];
  commands.forEach((command, index) => {
    const label = normalizeSearch(command.label);
    const group = normalizeSearch(command.group ?? "");
    const keywords = (command.keywords ?? []).map(normalizeSearch);
    let score = 0;
    if (label.startsWith(q)) score = 4;
    else if (label.split(/\s+/).some((word) => word.startsWith(q))) score = 3;
    else if (label.includes(q)) score = 2;
    else if (keywords.some((k) => k.startsWith(q) || k.includes(q)) || group.includes(q)) score = 1;
    if (score > 0) scored.push({ command, score, index });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ command }) => command);
}

/** Sinónimos por id de ítem del menú. Lo que no está acá se busca solo por nombre. */
export const NAV_KEYWORDS: Record<string, string[]> = {
  panel: ["inicio", "resumen", "home"],
  pos: ["vender", "cobrar", "caja", "venta", "pos"],
  sales: ["ventas", "historial", "recibos", "anular"],
  billing: ["facturas", "cotizaciones"],
  calendar: ["citas", "agenda", "reservas", "turnos"],
  customers: ["clientes"],
  credits: ["fiado", "deudas", "cartera"],
  promociones: ["promos", "fidelizacion", "cortes"],
  inventory: ["productos", "servicios", "catalogo", "stock", "precios"],
  pedidos: ["reponer", "faltantes"],
  production: ["recetas", "lotes", "insumos", "preparacion", "fabricacion", "costo"],
  distributors: ["proveedores", "distribuidores"],
  purchases: ["compras", "facturas de compra"],
  expenses: ["gastos", "egresos"],
  staff: ["personal", "empleados", "equipo", "trabajadores"],
  commissions: ["comisiones", "liquidar"],
  subscription: ["plan", "suscripcion", "pago"],
  landing: ["sitio web", "pagina", "reservas en linea"],
  settings: ["ajustes", "configuracion", "negocio", "impuestos"],
};

export function CommandPalette({
  open,
  onClose,
  commands,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  onNavigate: (href: string) => void;
}) {
  if (!open) return null;
  return <OpenPalette onClose={onClose} commands={commands} onNavigate={onNavigate} />;
}

function OpenPalette({
  onClose,
  commands,
  onNavigate,
}: {
  onClose: () => void;
  commands: PaletteCommand[];
  onNavigate: (href: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  const go = (command: PaletteCommand | undefined) => {
    if (!command) return;
    onClose();
    onNavigate(command.href);
  };

  const move = (next: number) => {
    if (results.length === 0) return;
    const wrapped = (next + results.length) % results.length;
    setActive(wrapped);
    listRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(optionId(wrapped))}`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(activeIndex - 1);
        break;
      case "Home":
        if (results.length > 0) {
          event.preventDefault();
          move(0);
        }
        break;
      case "End":
        if (results.length > 0) {
          event.preventDefault();
          move(results.length - 1);
        }
        break;
      case "Enter":
        event.preventDefault();
        go(results[activeIndex]);
        break;
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Ir a una sección"
      size="md"
      initialFocusRef={inputRef}
      bodyClassName="px-0 pb-2"
    >
      <div className="px-6 pb-3">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
          aria-label="Ir a una sección"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Escribe el nombre de una sección…"
          className="w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-base text-on-surface placeholder:text-on-surface-variant/80 focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary-ink/25 sm:text-sm"
        />
        <p className="mt-2 text-[11px] text-on-surface-variant">
          ↑ ↓ para moverte · Enter para abrir · Esc para cerrar
        </p>
      </div>
      {results.length === 0 ? (
        <p className="px-6 py-6 text-center text-sm text-on-surface-variant" role="status">
          Ninguna sección coincide con “{query.trim()}”.
        </p>
      ) : (
        <ul ref={listRef} id={listId} role="listbox" aria-label="Secciones" className="max-h-[50vh] overflow-y-auto px-3">
          {results.map((command, index) => {
            const selected = index === activeIndex;
            return (
              <li
                key={command.id}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                onMouseMove={() => setActive(index)}
                onClick={() => go(command)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${
                  selected ? "bg-primary/10 text-on-surface" : "text-on-surface"
                }`}
              >
                <span className={`min-w-0 truncate ${selected ? "font-semibold" : ""}`}>{command.label}</span>
                {command.group && (
                  <span className="shrink-0 text-xs text-on-surface-variant">{command.group}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

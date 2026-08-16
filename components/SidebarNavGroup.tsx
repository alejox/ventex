"use client";

import Link from "next/link";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { NavItem } from "@/config/business";
import {
  IconCalendar,
  IconShoppingCart,
  IconTruck,
  IconUsers,
  IconUserBadge,
  IconBox,
  IconWallet,
  IconHome,
} from "@/app/assets/icons/DashboardIcons";

type IconType = typeof IconHome;

/**
 * Icono del MÓDULO, no de la pantalla.
 *
 * `NAV_ICONS` mapea por id de ítem; acá se mapea por id de grupo, que es otra
 * cosa: el grupo es el padre del acordeón y necesita su propia cara. Un grupo
 * sin icono cae en el de su primer hijo, que es mejor que un hueco.
 */
const NAV_GROUP_ICONS: Record<string, IconType> = {
  ventas: IconShoppingCart,
  agenda: IconCalendar,
  catalogo: IconBox,
  abastecimiento: IconTruck,
  finanzas: IconWallet,
  equipo: IconUsers,
  inicio: IconHome,
};

export interface NavGroupModel {
  id: string;
  label: string | null;
  items: NavItem[];
}

/**
 * Cuáles grupos cerró la persona. Se guarda lo CERRADO y no lo abierto: un
 * grupo nuevo —o el primer ingreso— nace abierto, así nadie pierde de vista una
 * sección que nunca supo que existía. Guardar lo abierto haría lo contrario.
 */
const STORAGE_KEY = "ventex.nav.grupos-cerrados";

const VACIO = "[]";

/**
 * El estado se lee con `useSyncExternalStore` y no con `useState`, y eso NO es
 * ceremonia: `localStorage` no existe en el servidor. Leerlo en el primer
 * render hace que el servidor pinte todos los grupos abiertos y el cliente los
 * pinte como quedaron, y React tira el árbol entero con un error de hidratación
 * —medido, no supuesto—. Este hook le da a React una foto para el servidor y
 * otra para el cliente, que es exactamente el caso para el que existe.
 *
 * La foto es el JSON crudo, un string: `getSnapshot` tiene que devolver algo
 * comparable por valor. Devolver un `Set` nuevo en cada llamada sería un objeto
 * distinto cada vez y React re-renderizaría para siempre.
 */
const suscriptores = new Set<() => void>();

function subscribe(cb: () => void) {
  suscriptores.add(cb);
  return () => {
    suscriptores.delete(cb);
  };
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? VACIO;
  } catch {
    // localStorage bloqueado (Safari en privado): el menú funciona sin memoria.
    return VACIO;
  }
}

const getServerSnapshot = () => VACIO;

export function useClosedNavGroups() {
  const crudo = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const cerrados = useMemo<Set<string>>(() => {
    try {
      return new Set(JSON.parse(crudo) as string[]);
    } catch {
      return new Set();
    }
  }, [crudo]);

  const toggle = useCallback((id: string) => {
    const actual = new Set<string>(JSON.parse(getSnapshot()) as string[]);
    if (actual.has(id)) actual.delete(id);
    else actual.add(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...actual]));
    } catch {
      /* sin memoria, pero el menú responde igual */
    }
    suscriptores.forEach((cb) => cb());
  }, []);

  return { cerrados, toggle };
}

function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 shrink-0 ml-auto transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * Un módulo del menú con sus submódulos plegables.
 *
 * Vive en su propio archivo porque lo usan la barra de escritorio Y el cajón
 * del teléfono. Antes eran dos copias del mismo JSX y ya habían divergido —una
 * escondía el encabezado con la barra colapsada y la otra no—; con el acordeón
 * la deriva habría sido peor, porque son dos comportamientos y no solo dos
 * estilos.
 *
 * Reglas:
 *  - Un grupo con UN solo ítem no es un módulo con submódulos: se pinta plano,
 *    con el nombre del ítem. Un padre con un único hijo es un clic de peaje.
 *  - El grupo que contiene la pantalla actual está SIEMPRE abierto y su cabecera
 *    no responde al clic: plegarlo escondería la pantalla en la que estás.
 *  - Los hijos van sin icono e indentados, como en el admin de WordPress: el
 *    icono es del módulo, y repetirlo abajo compite con él en vez de guiar.
 */
export function SidebarNavGroup({
  group,
  activeNavId,
  closed,
  onToggle,
  onNavigate,
  icons,
}: {
  group: NavGroupModel;
  activeNavId: string | null;
  closed: boolean;
  onToggle: (id: string) => void;
  onNavigate?: () => void;
  icons: Record<string, IconType>;
}) {
  const contieneActivo = group.items.some((it) => it.id === activeNavId);
  const plano = group.items.length <= 1 || !group.label;
  const abierto = contieneActivo || !closed;

  if (plano) {
    return (
      <div>
        {group.items.map((item) => {
          const Icon = icons[item.id];
          const activo = item.id === activeNavId;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onNavigate}
              aria-current={activo ? "page" : undefined}
              className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                activo
                  ? "bg-primary/10 text-primary"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
              }`}
            >
              {activo && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />
              )}
              {Icon && <Icon className="w-5 h-5 shrink-0" />}
              <span className="whitespace-nowrap">{item.name}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  const GroupIcon = NAV_GROUP_ICONS[group.id] ?? icons[group.items[0].id];
  const panelId = `nav-grupo-${group.id}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => !contieneActivo && onToggle(group.id)}
        aria-expanded={abierto}
        aria-controls={panelId}
        // El grupo activo no se pliega, así que tampoco finge ser un botón.
        aria-disabled={contieneActivo || undefined}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold ${
          contieneActivo
            ? "bg-primary/10 text-primary cursor-default"
            : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
        }`}
      >
        {GroupIcon && <GroupIcon className="w-5 h-5 shrink-0" />}
        <span className="whitespace-nowrap">{group.label}</span>
        <Chevron abierto={abierto} />
      </button>

      {abierto && (
        <div
          id={panelId}
          className="ml-[1.625rem] pl-3 pt-1 pb-1 border-l border-outline-variant/20 flex flex-col gap-0.5"
        >
          {group.items.map((item) => {
            const activo = item.id === activeNavId;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onNavigate}
                aria-current={activo ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  activo
                    ? "bg-primary/[0.07] text-primary font-bold"
                    : "text-on-surface-variant/80 font-medium hover:text-on-surface hover:bg-surface-container-low"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

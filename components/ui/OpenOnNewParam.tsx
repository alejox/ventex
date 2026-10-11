"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Intenciones que llegan por la URL desde el Panel (F24 / F6) y otros atajos:
 *  - `?new=1` abre el formulario de alta (acción rápida "Nueva factura").
 *  - `?new=<otro>` abre un alta distinta de la principal (`?new=insumo` en
 *    Inventario abre el insumo rápido): llega a `onOpenNew` con el valor.
 *  - `?filtro=<id>` deja la lista ya filtrada (pendiente "Facturas vencidas").
 *
 * Una vez aplicadas se limpian de la URL, para que recargar no vuelva a abrir
 * el modal. Se limpian SOLO esas dos: el resto de la query (búsqueda, vista,
 * página) es estado de la pantalla y sigue valiendo. Va en su propio
 * componente y la página lo envuelve en `<Suspense>`: `useSearchParams` en una
 * ruta prerenderizada lo exige (guía `use-search-params` de esta versión de Next).
 */
export function OpenOnNewParam({
  onOpen,
  onOpenNew,
  onFilter,
}: {
  onOpen?: () => void;
  /** Cualquier `?new=` distinto de "1", con su valor. */
  onOpenNew?: (value: string) => void;
  onFilter?: (value: string) => void;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wantsNew = params.get("new");
  const filter = params.get("filtro");
  // Lo que queda en la URL después de consumir `new` y `filtro`.
  const rest = new URLSearchParams(params.toString());
  rest.delete("new");
  rest.delete("filtro");
  const restQuery = rest.toString();
  useEffect(() => {
    if (!wantsNew && !filter) return;
    if (wantsNew === "1") onOpen?.();
    else if (wantsNew) onOpenNew?.(wantsNew);
    if (filter) onFilter?.(filter);
    router.replace(restQuery ? `${pathname}?${restQuery}` : pathname, { scroll: false });
  }, [wantsNew, filter, restQuery, onOpen, onOpenNew, onFilter, router, pathname]);
  return null;
}

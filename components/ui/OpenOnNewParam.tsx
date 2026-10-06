"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Intenciones que llegan por la URL desde el Panel (F24 / F6):
 *  - `?new=1` abre el formulario de alta (acción rápida "Nueva factura").
 *  - `?filtro=<id>` deja la lista ya filtrada (pendiente "Facturas vencidas").
 *
 * Una vez aplicadas se limpian de la URL, para que recargar no vuelva a abrir
 * el modal. Va en su propio componente y la página lo envuelve en
 * `<Suspense>`: `useSearchParams` en una ruta prerenderizada lo exige (guía
 * `use-search-params` de esta versión de Next).
 */
export function OpenOnNewParam({
  onOpen,
  onFilter,
}: {
  onOpen?: () => void;
  onFilter?: (value: string) => void;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wantsNew = params.get("new") === "1";
  const filter = params.get("filtro");
  useEffect(() => {
    if (!wantsNew && !filter) return;
    if (wantsNew) onOpen?.();
    if (filter) onFilter?.(filter);
    router.replace(pathname, { scroll: false });
  }, [wantsNew, filter, onOpen, onFilter, router, pathname]);
  return null;
}

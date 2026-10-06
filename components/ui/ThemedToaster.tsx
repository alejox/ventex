"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

/**
 * `<Toaster>` de sonner atado al tema de la app (A20).
 *
 * Sin `theme`, sonner usa su paleta clara aunque la app esté en oscuro. Arriba
 * al centro y no a la derecha: en móvil, `top-right` tapaba el encabezado.
 */
export function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-center" closeButton />;
}

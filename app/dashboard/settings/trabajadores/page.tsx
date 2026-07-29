import { permanentRedirect } from "next/navigation";

/**
 * Trabajadores dejó de ser una pestaña de Ajustes: la cuenta de acceso es una
 * faceta de la ficha de personal, no una entidad aparte, así que ambas viven
 * ahora en /dashboard/staff.
 *
 * La ruta se mantiene como redirect porque estaba enlazada desde el menú de
 * Ajustes y de la ayuda, y porque los dueños la tienen marcada.
 */
export default function TrabajadoresRedirect() {
  permanentRedirect("/dashboard/staff");
}

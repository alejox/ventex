import { permanentRedirect } from "next/navigation";

/**
 * Profesores dejó de ser una pantalla propia de Académico: el perfil docente
 * (especialidades, bio, disponibilidad) es una sección opcional de la ficha
 * de la persona en Personal, igual que su acceso al sistema — dos pantallas
 * para una misma persona era el problema, no la solución.
 *
 * La ruta se mantiene como redirect porque estaba enlazada desde el resumen
 * de Académico y los dueños la tienen marcada.
 */
export default function ProfesoresRedirect() {
  permanentRedirect("/dashboard/staff");
}

import { permanentRedirect } from "next/navigation";

/**
 * Servicios dejó de ser una pantalla aparte.
 *
 * Productos y servicios son las dos mitades de una misma pregunta —"qué
 * vendo"— y tenerlas separadas obligaba al dueño a saber de antemano en cuál de
 * las dos buscar. Peor: para que un servicio apareciera en las dos, se guardaba
 * en las dos tablas, con una sincronización por nombre que en producción no
 * funcionaba en ningún caso.
 *
 * Hoy los dos viven en /dashboard/inventory, que lee cada mitad de su tabla.
 * La ruta se mantiene como redirect porque estaba en el menú, en el POS vacío y
 * en los marcadores de los dueños.
 */
export default function ServiciosRedirect() {
  permanentRedirect("/dashboard/inventory");
}

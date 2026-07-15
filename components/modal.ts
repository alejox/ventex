/**
 * Props del fondo (backdrop) de un modal para cerrarlo al hacer clic fuera.
 *
 * Cierra en `mousedown` y solo si el press se originó en el propio fondo. Con
 * `onClick` el modal se cerraba al hacer clic DENTRO de un input: si el puntero
 * se mueve un píxel entre presionar y soltar (o el input se re-renderiza), el
 * click se dispara sobre el ancestro común —el fondo— aunque el press haya
 * empezado en el campo.
 */
export function backdropProps(onClose: () => void) {
  return {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}

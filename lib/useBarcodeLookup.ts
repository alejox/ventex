import { useEffect, useRef, useState } from "react";
import { useOpenFactsStore } from "@/stores/openfacts.store";
import type { OpenFactsProduct } from "@/services/openfacts.service";

const MIN_LENGTH = 8;
const DEBOUNCE_MS = 600;

/** Un resultado SIEMPRE viaja con el código que lo produjo. */
interface Settled {
  barcode: string;
  /** `null` = se buscó y no existe. Distinto de "todavía no se buscó". */
  product: OpenFactsProduct | null;
}

/**
 * Busca un código de barras en Open Facts, con rebote, para autocompletar la
 * ficha de un producto.
 *
 * **Nada de lo que devuelve puede pertenecer a otro código.** Antes el resultado
 * vivía suelto en su propio estado y se devolvía con sólo mirar que el código
 * actual tuviera largo suficiente: al corregir un código por otro, la pantalla
 * seguía afirmando "Info encontrada: <producto viejo>" debajo del código nuevo
 * durante todo el rebote más la ida y vuelta a la red. Un tilde verde asegurando
 * algo falso sobre el código que la persona está mirando. Guardando el `barcode`
 * JUNTO al producto, un resultado ajeno no se puede mostrar: no hay dónde ponerlo.
 *
 * `searching` se DERIVA, no se guarda: si el código es lo bastante largo y
 * todavía no hay resultado para ÉL, se está buscando. Eso cubre también los
 * 600 ms del rebote, que antes eran una ventana muerta —sin spinner y con el
 * hallazgo anterior en pantalla—, que es justo cuando se siente que la pantalla
 * no reacciona. Y como el estado se escribe una sola vez, al final, el efecto no
 * dispara renders en cadena.
 */
export function useBarcodeLookup(
  barcode: string,
  onFound?: (product: OpenFactsProduct) => void,
) {
  const lookup = useOpenFactsStore((s) => s.lookup);
  const onFoundRef = useRef(onFound);

  // El callback se lee por ref para que cambiar su identidad en cada render no
  // reinicie el rebote. El código de barras, en cambio, SÍ es dependencia real.
  useEffect(() => {
    onFoundRef.current = onFound;
  });

  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    const trimmed = barcode?.trim() ?? "";
    if (trimmed.length < MIN_LENGTH) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const product = await lookup(trimmed);
      // La respuesta de un código abandonado se descarta acá. La bandera vive en
      // el closure de ESTE efecto, así que no puede confundirse con la de otra
      // búsqueda — el riesgo de compararla contra una ref mutable compartida.
      if (cancelled) return;
      setSettled({ barcode: trimmed, product });
      if (product) onFoundRef.current?.(product);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [barcode, lookup]);

  const trimmed = barcode?.trim() ?? "";
  const isForThisCode = settled !== null && settled.barcode === trimmed;

  return {
    // Un código corto no está buscando nada; borrarlo apaga el spinner solo.
    searching: trimmed.length >= MIN_LENGTH && !isForThisCode,
    product: isForThisCode ? settled.product : null,
  };
}

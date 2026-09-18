"use client";

import { useEffect, useState } from "react";

const BUSINESS_WORDS = ["empresa", "salón", "tienda", "emprendimiento", "barbería"];

export function RotatingBusinessWord() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % BUSINESS_WORDS.length);
    }, 2400);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <span
      // `max-w-full` es lo que evita que el ancho reservado se coma la pantalla:
      // 11ch al tamaño del titular da ~370px, más que los 342px útiles de un
      // iPhone de 390. Al desbordar, `mx-auto` del padre no puede centrarlo y la
      // pastilla quedaba corrida a la derecha.
      // Sin `text-start`: la alineación la decide quien lo usa. Centrada en
      // móvil, a la izquierda desde lg.
      // 12ch y no 11: medido, la pastilla más ancha ("emprendimiento") pide
      // 296px al tamaño móvil del titular y 11ch reservaba 277 — se desbordaba
      // 19px y el centrado se corría 9. 12ch da 302px y entra en los 327 útiles
      // del iPhone más chico.
      className="inline-block w-[12ch] sm:w-[14ch] max-w-full align-baseline"
      aria-live="polite"
    >
      <span
        key={BUSINESS_WORDS[index]}
        className="inline-block whitespace-nowrap rounded-[0.28em] bg-on-surface px-[0.18em] py-[0.04em] text-background animate-business-word"
        aria-label={BUSINESS_WORDS[index]}
      >
        {BUSINESS_WORDS[index]}
      </span>
    </span>
  );
}

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
      className="inline-block w-[11ch] sm:w-[14ch] text-start align-baseline"
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

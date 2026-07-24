"use client";

import { useId } from "react";

interface MoneyInputProps {
  /** Valor crudo (string numérico sin separadores) que maneja el formulario. */
  value: string;
  /** Devuelve el valor crudo, listo para `parseFloat`. Nunca el texto formateado. */
  onChange: (raw: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  "aria-label"?: string;
}

/**
 * Campo de dinero: muestra `$` y separadores de miles mientras se escribe, pero
 * hacia afuera entrega un número limpio.
 *
 * El formulario NUNCA ve el texto formateado. Si el estado guardara "1,234", el
 * `parseFloat` del servicio devolvería 1 y el producto se guardaría a $1 sin que
 * nadie lo note. Por eso la conversión ocurre en el borde, acá.
 *
 * Es `type="text"` con `inputMode="decimal"`: un `type="number"` no admite
 * separadores de miles, y en móvil igual abre el teclado numérico.
 */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = "0",
  className = "",
  disabled,
  readOnly,
  required,
  "aria-label": ariaLabel,
}: MoneyInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-on-surface-variant pointer-events-none"
      >
        $
      </span>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={formatMoney(value)}
        onChange={(e) => onChange(parseMoney(e.target.value))}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        /* text-base en móvil: por debajo de 16px iOS hace zoom al enfocar. */
        className={`w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 pl-8 pr-4 text-base sm:text-sm text-on-surface tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50 ${className}`}
      />
    </div>
  );
}

/**
 * Texto tecleado -> valor crudo.
 *
 * Se descarta todo lo que no sea dígito o separador decimal, y se conserva solo
 * el PRIMER punto: "1.2.3" es un error de tipeo, no un número.
 */
export function parseMoney(text: string): string {
  const cleaned = text.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

/**
 * Valor crudo -> texto con separadores de miles.
 *
 * El punto decimal recién tecleado ("1234.") se conserva tal cual: si se
 * formateara, el campo se comería el punto y no se podrían escribir centavos.
 */
export function formatMoney(raw: string): string {
  if (raw === "") return "";
  const [whole, decimals] = raw.split(".");
  const groupedWhole = whole === "" ? "" : Number(whole).toLocaleString("en-US");
  if (decimals === undefined) return groupedWhole;
  return `${groupedWhole}.${decimals}`;
}

import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-dim",
  secondary:
    "border border-outline-variant/30 bg-surface-container text-on-surface hover:bg-surface-container-high",
  danger: "bg-error text-on-error hover:bg-error/90 focus-visible:ring-error",
  ghost: "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface",
};

// `md` y `lg` cumplen el área táctil de 40px; `sm` es para barras densas.
const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-xs gap-1.5",
  md: "min-h-10 px-5 text-sm gap-2",
  lg: "min-h-12 px-6 text-base gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Deshabilita el botón, muestra un spinner y marca `aria-busy`. */
  loading?: boolean;
  /** Texto mientras `loading` (si no, se conserva el texto normal). */
  loadingLabel?: ReactNode;
  /** Ocupa todo el ancho disponible (`w-full`). */
  fullWidth?: boolean;
  /** Ícono antes del texto (se oculta mientras carga: lo reemplaza el spinner). */
  icon?: ReactNode;
}

/**
 * Botón de la plataforma. `type="button"` por defecto: un `<button>` sin tipo
 * dentro de un `<form>` es un submit, y ese es el origen clásico de "guardé sin
 * querer". Para enviar un formulario, pasá `type="submit"` explícito.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  fullWidth = false,
  icon,
  type = "button",
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentProps<"button">, "aria-label" | "children"> {
  /** Obligatorio: un botón solo con ícono no tiene otro nombre accesible. */
  "aria-label": string;
  icon: ReactNode;
  variant?: ButtonVariant;
  /** `md` = 40×40 (área táctil mínima). `sm` = 32×32 solo para barras densas. */
  size?: "sm" | "md";
  loading?: boolean;
}

const ICON_SIZE = { sm: "h-8 w-8", md: "h-10 w-10" } as const;

/** Botón cuadrado solo con ícono. El `title` nativo repite el `aria-label`. */
export function IconButton({
  icon,
  variant = "ghost",
  size = "md",
  loading = false,
  type = "button",
  disabled,
  className = "",
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      title={title ?? rest["aria-label"]}
      className={`${BASE} ${VARIANT[variant]} ${ICON_SIZE[size]} shrink-0 p-0 ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : <span aria-hidden="true" className="inline-flex">{icon}</span>}
    </button>
  );
}

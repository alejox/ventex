import type { ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, X, AlertTriangle } from "lucide-react";

/**
 * Los tres avisos comparten una sola tarjeta y solo cambian el acento. Todo sale
 * de los tokens del tema (`globals.css`): en oscuro la tarjeta es oscura, no
 * un recuadro pastel claro encima de una pantalla negra. Contraste AA en los dos
 * temas — texto `on-surface`/`on-surface-variant` sobre `surface-bright`, y los
 * íconos en `accent-fin` / `warning` / `error`, que ya están calibrados por tema.
 */
type Tone = "success" | "warning" | "error";

const TONE: Record<Tone, { border: string; icon: ReactNode }> = {
  success: {
    border: "border-l-accent-fin",
    icon: <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent-fin" />,
  },
  warning: {
    border: "border-l-warning",
    icon: <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />,
  },
  error: {
    border: "border-l-error",
    icon: <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-error" />,
  },
};

function show(tone: Tone, title: string, description: string | undefined, duration: number) {
  const { border, icon } = TONE[tone];
  toast.custom(
    (t) => (
      <div
        role={tone === "error" ? "alert" : "status"}
        className={`flex w-[min(356px,calc(100vw-2rem))] items-start gap-3 rounded-lg border border-outline-variant border-l-4 ${border} bg-surface-bright p-4 shadow-lg`}
      >
        {icon}
        <div className="flex-1">
          <p className="text-sm font-semibold text-on-surface">{title}</p>
          {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
        </div>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={() => toast.dismiss(t)}
          className="ml-auto inline-flex shrink-0 rounded text-on-surface-variant hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ),
    { duration },
  );
}

export const notifySuccess = (title: string, description?: string) =>
  show("success", title, description, 4000);

/**
 * Aviso ámbar: la acción SÍ se hizo, pero hay algo que mirar. Distinto de
 * `notifyError`, que es rojo y significa que la acción no ocurrió.
 */
export const notifyWarning = (title: string, description?: string) =>
  show("warning", title, description, 5000);

export const notifyError = (title: string, description?: string) =>
  show("error", title, description, 4000);

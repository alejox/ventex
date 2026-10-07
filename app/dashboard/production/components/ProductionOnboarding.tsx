"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";

const STORAGE_KEY = "ventex.production.onboarding.dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const noopSubscribe = () => () => {};

interface Step {
  done: boolean;
  title: string;
  body: string;
  href?: string;
  onClick?: () => void;
  cta: string;
}

/**
 * Los tres pasos del módulo, con su avance real: no es un tutorial que se
 * recita, es una lista que se va tachando sola a medida que el negocio crea
 * insumos, arma recetas y registra su primer lote. Se cierra con la X y no
 * vuelve (por navegador: es una ayuda, no un dato del negocio).
 */
export function ProductionOnboarding({
  hasIngredients,
  hasRecipes,
  hasBatches,
  onRegisterBatch,
}: {
  hasIngredients: boolean;
  hasRecipes: boolean;
  hasBatches: boolean;
  onRegisterBatch: () => void;
}) {
  // En el servidor (y en el primer render) se da por cerrada: así no aparece y
  // desaparece al hidratar.
  const storedDismissed = useSyncExternalStore(noopSubscribe, readDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  if (storedDismissed || dismissedNow) return null;

  const steps: Step[] = [
    {
      done: hasIngredients,
      title: "Crea tus insumos",
      body: "Lo que compras para preparar: café, leche, vasos, harina. Márcalos como “Solo insumo”.",
      href: "/dashboard/inventory/product?from=/dashboard/production",
      cta: "Crear insumo",
    },
    {
      done: hasRecipes,
      title: "Arma la receta",
      body: "En la ficha del producto: “Latte → 20 g de café, 200 ml de leche, 1 vaso”.",
      href: "/dashboard/inventory?from=/dashboard/production",
      cta: "Ir a productos",
    },
    {
      done: hasBatches,
      title: "Vende o registra un lote",
      body: "Cada venta descuenta los insumos sola. Lo que preparas por tandas, regístralo aquí.",
      onClick: onRegisterBatch,
      cta: "Registrar lote",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Sin almacenamiento (modo privado): se cierra solo por esta visita.
    }
    setDismissedNow(true);
  };

  return (
    <section
      aria-labelledby="production-onboarding-title"
      className="relative rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:p-6"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar la guía"
        title="Cerrar la guía"
        className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="pr-10">
        <h2 id="production-onboarding-title" className="text-base font-bold text-on-surface">
          Así funciona, en tres pasos
        </h2>
        <p className="text-sm text-on-surface-variant mt-0.5">
          {doneCount === 0 ? "Empieza por el primero." : `Llevas ${doneCount} de 3.`}
        </p>
      </div>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={`rounded-2xl border p-4 ${step.done ? "border-success/25 bg-success/5" : "border-outline-variant/15 bg-surface-container"}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done ? "bg-success text-white" : "bg-primary/15 text-primary-ink"
                }`}
              >
                {step.done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </span>
              <p className="text-sm font-semibold text-on-surface">
                {step.title}
                {step.done && <span className="sr-only"> (hecho)</span>}
              </p>
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">{step.body}</p>
            {!step.done && step.href && (
              <Link
                href={step.href}
                className="mt-3 inline-block text-sm font-semibold text-primary-ink underline-offset-2 hover:underline"
              >
                {step.cta}
              </Link>
            )}
            {!step.done && step.onClick && (
              <button
                type="button"
                onClick={step.onClick}
                className="mt-3 inline-block text-sm font-semibold text-primary-ink underline-offset-2 hover:underline"
              >
                {step.cta}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

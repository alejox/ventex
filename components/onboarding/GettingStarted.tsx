"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useProfile } from "@/components/ProfileProvider";
import { useGettingStartedStore } from "@/stores/getting-started.store";
import { allGettingStartedDone, gettingStartedSteps, requiredGettingStartedSteps } from "@/lib/getting-started";
import { IconCheck } from "@/app/assets/icons/DashboardIcons";

/**
 * Preferencia por negocio, en este dispositivo: "dismissed" (tocó "Ya lo
 * tengo") o "done" (completó todo). Con cualquiera de las dos el panel ni
 * siquiera consulta los hechos. Es una comodidad, no un dato: si el storage
 * no está disponible, el checklist simplemente vuelve a aparecer mientras
 * falten pasos.
 */
const storageKey = (scope: string) => `ventex:primeros-pasos:${scope}`;

const staffStorageKey = (scope: string) => `ventex:primeros-pasos:staff:${scope}`;
// Failed writes remain usable during this visit, isolated by membership.
const transientStaffFlags = new Map<string, boolean>();
const listeners = new Set<() => void>();

function readStaffDone(key: string): boolean {
  return transientStaffFlags.get(key) ?? (readFlag(key) === "done");
}

function writeStaffDone(key: string, done: boolean) {
  try {
    window.localStorage.setItem(key, done ? "done" : "pending");
    transientStaffFlags.delete(key);
  } catch {
    transientStaffFlags.set(key, done);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin storage (modo privado): se oculta igual en esta visita.
  }
  listeners.forEach((l) => l());
}

/**
 * Checklist "Primeros pasos" del panel (B2 del informe de UX): tras
 * registrarse el dueño caía en un POS vacío sin saber por dónde empezar.
 *
 * Qué pasos aplican lo decide `gettingStartedSteps` (puro, testeado) según el
 * rubro; si están hechos, unas consultas de existencia baratas. Solo lo ve
 * quien administra el negocio, no un trabajador.
 */
export function GettingStarted() {
  const profile = useProfile();
  const facts = useGettingStartedStore((s) => s.facts);
  const fetchFacts = useGettingStartedStore((s) => s.fetchFacts);

  const eligible = Boolean(profile && !profile.isWorker && profile.businessType);
  const scope = profile?.membershipId ?? profile?.id ?? "anon";
  const key = storageKey(scope);
  const staffKey = staffStorageKey(scope);
  const staffManuallyDone = useSyncExternalStore(
    subscribe,
    () => readStaffDone(staffKey),
    () => false,
  );
  // En el servidor no hay storage: se asume oculto y se decide al hidratar,
  // para no mostrar y esconder el bloque de golpe.
  const flag = useSyncExternalStore(
    subscribe,
    () => readFlag(key),
    () => "ssr",
  );
  const hidden = !eligible || flag !== null;

  useEffect(() => {
    if (!hidden) void fetchFacts();
  }, [hidden, fetchFacts]);

  const steps = useMemo(
    () =>
      facts && profile ? gettingStartedSteps(profile.businessType, profile.modules ?? null, facts, staffManuallyDone) : [],
    [facts, profile, staffManuallyDone],
  );
  const allDone = allGettingStartedDone(steps);

  // Completo: se recuerda para no volver a consultar en cada visita al panel.
  useEffect(() => {
    if (!hidden && allDone) writeFlag(key, "done");
  }, [hidden, allDone, key]);

  if (hidden || !facts || steps.length === 0 || allDone) return null;

  // El progreso cuenta solo los pasos obligatorios: personal y sitio son opcionales.
  const required = requiredGettingStartedSteps(steps);
  const doneCount = required.filter((s) => s.done).length;
  const pct = Math.round((doneCount / required.length) * 100);

  return (
    <section
      aria-labelledby="getting-started-title"
      className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="getting-started-title" className="text-base font-bold text-on-surface">
            Primeros pasos
          </h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {doneCount} de {required.length} listos. Completa estos pasos para empezar a vender con todo
            configurado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => writeFlag(key, "dismissed")}
          className="self-start shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
        >
          Ya lo tengo
        </button>
      </div>

      <div
        className="mt-4 h-1.5 rounded-full bg-surface-container-high overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={required.length}
        aria-valuenow={doneCount}
        aria-label="Progreso de los primeros pasos"
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={`flex items-center rounded-xl border transition-colors ${
              step.done
                ? "border-outline-variant/10 bg-surface-container-lowest/60"
                : "border-outline-variant/20 bg-surface-container-lowest hover:border-primary/40"
            }`}
          >
            <Link
              href={step.href}
              className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span
                className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.done ? "bg-primary text-on-primary" : "border border-outline-variant/40 text-on-surface-variant"
                }`}
                aria-hidden="true"
              >
                {step.done ? <IconCheck className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold ${
                    step.done ? "text-on-surface-variant line-through decoration-1" : "text-on-surface"
                  }`}
                >
                  {step.label}
                  <span className="sr-only">{step.done ? " (hecho)" : " (pendiente)"}</span>
                </span>
                {step.optional && (
                  <span className="mt-1 inline-block rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                    Opcional
                  </span>
                )}
                {!step.done && <span className="block text-xs text-on-surface-variant mt-0.5">{step.hint}</span>}
              </span>
            </Link>
            {step.id === "staff" && (
              <label className="ml-auto flex shrink-0 self-center items-center gap-2 px-3 text-xs text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={step.done}
                  disabled={facts.hasStaff}
                  onChange={(event) => writeStaffDone(staffKey, event.target.checked)}
                  className="h-4 w-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
                {step.done ? "Marcado como hecho" : "Marcar como hecho"}
              </label>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

"use client";

import { useState } from "react";

interface ConfirmLessonActionProps {
  token: string;
}

/**
 * Única pieza interactiva de `app/school/c/[token]/page.tsx`: un botón que
 * dispara el POST a `/api/school/confirm`. La página en sí es un Server
 * Component que solo RENDERIZA (GET) — este componente es el único lugar del
 * flujo que puede confirmar, y solo reacciona a un clic explícito, nunca a la
 * carga de la página.
 */
export function ConfirmLessonAction({ token }: ConfirmLessonActionProps) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleConfirm = async () => {
    setState("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/school/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setState("error");
        setMessage(body.error ?? "No se pudo confirmar la clase.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage("No pudimos conectar con el servidor. Revisá tu conexión.");
    }
  };

  if (state === "done") {
    return (
      <p className="rounded-2xl bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        Clase confirmada. Ya se puede cerrar con la asistencia desde la escuela.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleConfirm()}
        disabled={state === "sending"}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
      >
        {state === "sending" ? "Confirmando…" : "Confirmar que dicté la clase"}
      </button>
      {state === "error" && <p className="text-xs font-medium text-error">{message}</p>}
    </div>
  );
}

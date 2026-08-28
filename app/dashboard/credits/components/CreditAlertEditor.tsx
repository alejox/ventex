"use client";

import { useState } from "react";
import { CREDIT_ALERT_DEFAULT, creditAlertText } from "@/lib/credits";

interface CreditAlertEditorProps {
  alert: boolean;
  note: string | null;
  submitting: boolean;
  /** Falso para el trabajador: el RPC lo rechaza, así que ni se le ofrece. */
  editable: boolean;
  onSave: (alert: boolean, note: string | null) => Promise<boolean>;
}

/**
 * El aviso interno del cliente: el switch "No fiar" y su motivo.
 *
 * Dos decisiones de comportamiento:
 *
 * 1. **El switch guarda solo; el texto guarda con un botón.** Prender la marca
 *    es una decisión completa en sí misma —y es la urgente—, mientras que el
 *    motivo se escribe letra por letra: guardar en cada tecla mandaría un RPC
 *    por carácter y dejaría avisos a medio escribir en la base.
 * 2. **Apagar el switch borra el motivo**, y lo decide la base
 *    (`set_credit_alert`). Acá solo se refleja: el borrador local se limpia con
 *    lo que devolvió el guardado.
 */
export function CreditAlertEditor({
  alert,
  note,
  submitting,
  editable,
  onSave,
}: CreditAlertEditorProps) {
  const [draft, setDraft] = useState(note ?? "");

  // Ajuste durante el render, no en un efecto: el compilador de React rechaza
  // el setState-en-efecto, y acá además llegaría un frame tarde. El motivo
  // guardado cambia por dos caminos —se abre la ficha de otro cliente, o el
  // propio guardado lo borró al apagar el switch— y el borrador tiene que
  // seguirlo en los dos.
  const [notaGuardada, setNotaGuardada] = useState(note);
  if (notaGuardada !== note) {
    setNotaGuardada(note);
    setDraft(note ?? "");
  }

  if (!editable) {
    // El trabajador lo LEE —para eso está el aviso— pero no lo toca.
    return alert ? (
      <p className="text-xs text-error font-semibold">
        ⚠ {creditAlertText(note)}
      </p>
    ) : null;
  }

  const sucio = draft.trim() !== (note ?? "").trim();

  return (
    <div className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          role="switch"
          checked={alert}
          disabled={submitting}
          onChange={(e) => onSave(e.target.checked, draft.trim() || null)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-error,#ef4444)] cursor-pointer disabled:opacity-50"
        />
        <span className="min-w-0">
          <span className="block text-xs font-bold text-on-surface">
            Marcar “{CREDIT_ALERT_DEFAULT}”
          </span>
          <span className="block text-[11px] text-on-surface-variant mt-0.5">
            Avisa en Créditos y en el Punto de Venta al elegir este cliente. No
            bloquea la venta: el que la frena es el cupo.
          </span>
        </span>
      </label>

      {alert && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={draft}
            maxLength={80}
            disabled={submitting}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={CREDIT_ALERT_DEFAULT}
            aria-label="Motivo del aviso"
            className="flex-1 min-w-0 bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-error focus:ring-1 focus:ring-error disabled:opacity-50"
          />
          <button
            type="button"
            disabled={submitting || !sucio}
            onClick={() => onSave(true, draft.trim() || null)}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold bg-error/10 text-error hover:bg-error hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-error/10 disabled:hover:text-error"
          >
            Guardar aviso
          </button>
        </div>
      )}
    </div>
  );
}

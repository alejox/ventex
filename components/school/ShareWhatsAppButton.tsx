"use client";

import { useState } from "react";
import { useSchoolMaterialsStore } from "@/stores/school-materials.store";
import { shareWhatsAppUrl } from "@/services/school-materials.service";
import type { CommunicationPurpose } from "@/services/school-materials.service";

interface ShareWhatsAppButtonProps {
  message: string;
  /** Teléfono conocido del destinatario; sin él se abre WhatsApp sin número. */
  phone?: string | null;
  /**
   * Los tres juntos habilitan la bitácora (`school_log_communication`, que
   * exige un acudiente vinculado al alumno). Sin ellos el botón solo abre
   * WhatsApp, sin registrar nada — es el caso del enlace de confirmación al
   * profesor, que no es una comunicación con un acudiente.
   */
  studentId?: string;
  guardianCustomerId?: string;
  purpose?: CommunicationPurpose;
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
}

/**
 * Botón "Compartir por WhatsApp": abre el chat con el mensaje ya escrito y
 * deja que una PERSONA lo revise y lo mande — nunca envía solo. Dos estados
 * reales, nada de "enviado"/"entregado"/"leído":
 *
 * - Al abrir el enlace se registra `prepared` (se preparó el mensaje).
 * - Solo si el operador confirma explícitamente que lo mandó se registra
 *   `shared`. Si cancela a mitad de camino, la bitácora se queda en
 *   `prepared` — eso es CORRECTO, no un estado a medias.
 */
export function ShareWhatsAppButton({
  message,
  phone,
  studentId,
  guardianCustomerId,
  purpose,
  disabled,
  disabledReason,
  label = "Compartir por WhatsApp",
}: ShareWhatsAppButtonProps) {
  const logCommunication = useSchoolMaterialsStore((s) => s.logCommunication);
  const [opened, setOpened] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const canLog = Boolean(studentId && guardianCustomerId && purpose);

  const handleOpen = () => {
    window.open(shareWhatsAppUrl(phone, message), "_blank", "noopener");
    setOpened(true);
    if (canLog) {
      void logCommunication({
        studentId: studentId!,
        guardianCustomerId: guardianCustomerId!,
        purpose: purpose!,
        state: "prepared",
        message,
      });
    }
  };

  const handleConfirmShared = async () => {
    setConfirming(true);
    if (canLog) {
      await logCommunication({
        studentId: studentId!,
        guardianCustomerId: guardianCustomerId!,
        purpose: purpose!,
        state: "shared",
        message,
      });
    }
    setConfirming(false);
    setOpened(false);
  };

  if (disabled) {
    return (
      <span className="text-xs text-on-surface-variant/60" title={disabledReason}>
        {disabledReason ?? "No disponible"}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        {label}
      </button>
      {opened && canLog && (
        <button
          type="button"
          onClick={() => void handleConfirmShared()}
          disabled={confirming}
          className="text-xs font-semibold text-primary transition-colors hover:underline disabled:opacity-50"
        >
          {confirming ? "Registrando…" : "Ya lo mandé"}
        </button>
      )}
    </div>
  );
}

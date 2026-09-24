"use client";

import { useState } from "react";
import { SchoolModal } from "@/components/school/SchoolModal";
import { ShareWhatsAppButton } from "@/components/school/ShareWhatsAppButton";
import { useSchoolMaterialsStore } from "@/stores/school-materials.store";
import { buildFamilyLinkUrl, noticeShareGate } from "@/services/school-materials.service";
import type { StudentGuardian } from "@/services/school-people.service";

interface FamilyLinkDialogProps {
  studentId: string;
  studentName: string;
  guardians: StudentGuardian[];
  onClose: () => void;
}

/**
 * Emite el enlace de lectura familiar (7 días, reutilizable) y ofrece
 * compartirlo por WhatsApp. El token crudo lo ve esta pantalla UNA sola vez
 * —la base solo guarda el hash—, así que si se cierra sin copiarlo/compartirlo
 * hay que generar uno nuevo (que revoca el anterior).
 */
export function FamilyLinkDialog({ studentId, studentName, guardians, onClose }: FamilyLinkDialogProps) {
  const createFamilyLink = useSchoolMaterialsStore((s) => s.createFamilyLink);
  const saving = useSchoolMaterialsStore((s) => s.saving);
  const error = useSchoolMaterialsStore((s) => s.error);
  const clearError = useSchoolMaterialsStore((s) => s.clearError);

  const [guardianId, setGuardianId] = useState(guardians[0]?.customer_id ?? "");
  const [link, setLink] = useState<{ token: string; expiresAt: string } | null>(null);

  const guardian = guardians.find((g) => g.customer_id === guardianId) ?? null;

  const handleGenerate = async () => {
    if (!guardian) return;
    clearError();
    const result = await createFamilyLink(studentId, guardian.customer_id);
    if (!result) return;
    setLink({ token: result.token, expiresAt: result.expires_at });
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = link ? buildFamilyLinkUrl(origin, link.token) : null;
  const gate = guardian ? noticeShareGate(guardian) : { ok: false };
  const message = url
    ? `Hola ${guardian?.full_name ?? ""}, acá tenés el enlace de la escuela de ${studentName} para ver su próxima clase y su material: ${url} (válido por 7 días).`
    : "";

  return (
    <SchoolModal title={`Enlace familiar · ${studentName}`} onClose={onClose}>
      <div className="space-y-4 p-6 pt-4">
        {guardians.length === 0 ? (
          <p className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
            Este alumno no tiene adultos responsables registrados. Agregá uno primero.
          </p>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant">Enviar a</label>
              <select
                value={guardianId}
                onChange={(e) => {
                  setGuardianId(e.target.value);
                  setLink(null);
                }}
                className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
              >
                {guardians.map((g) => (
                  <option key={g.customer_id} value={g.customer_id}>
                    {g.full_name} {g.relationship ? `(${g.relationship})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {!link ? (
              <>
                {error && <p className="text-xs font-medium text-error">{error}</p>}
                <div className="flex justify-end gap-2 border-t border-outline-variant/10 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={!guardian || saving}
                    className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
                  >
                    {saving ? "Generando…" : "Generar enlace"}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3 border-t border-outline-variant/10 pt-4">
                <p className="break-all rounded-xl bg-surface-container-low p-3 text-xs text-on-surface-variant">
                  {url}
                </p>
                <p className="text-xs text-on-surface-variant">
                  Válido hasta {new Date(link.expiresAt).toLocaleString("es-CO")}. Regenerarlo revoca este.
                </p>
                <ShareWhatsAppButton
                  message={message}
                  phone={guardian?.phone}
                  studentId={studentId}
                  guardianCustomerId={guardianId}
                  purpose="other"
                  disabled={!gate.ok}
                  disabledReason={gate.reason}
                />
              </div>
            )}
          </>
        )}
      </div>
    </SchoolModal>
  );
}

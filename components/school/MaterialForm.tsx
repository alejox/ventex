"use client";

import { useState } from "react";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolMaterialsStore } from "@/stores/school-materials.store";
import { materialInputGate } from "@/services/school-materials.service";
import type { MaterialKind } from "@/services/school-materials.service";

interface MaterialFormProps {
  /** Alumno destinatario (ficha del estudiante: un material, un alumno). */
  studentId: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Sube o enlaza un material para UN alumno. El archivo pasa primero por
 * `/api/school/upload` (valida tipo/tamaño/cuota server-side) y recién
 * después se crea la fila de `school_materials` con sus destinatarios — el
 * store (`uploadMaterial`) encadena los dos pasos.
 */
export function MaterialForm({ studentId, onClose, onSaved }: MaterialFormProps) {
  const uploadMaterial = useSchoolMaterialsStore((s) => s.uploadMaterial);
  const saving = useSchoolMaterialsStore((s) => s.saving);
  const error = useSchoolMaterialsStore((s) => s.error);
  const clearError = useSchoolMaterialsStore((s) => s.clearError);

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [kind, setKind] = useState<MaterialKind>("file");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");

  const gate = materialInputGate({ kind, hasFile: Boolean(file), externalUrl });

  const submit = async () => {
    clearError();
    const ok = await uploadMaterial({
      title,
      instructions,
      kind,
      externalUrl,
      file,
      recipientStudentIds: [studentId],
    });
    if (!ok) return;
    onSaved();
  };

  return (
    <SchoolModal title="Nuevo material" onClose={onClose}>
      <div className="space-y-4 p-6 pt-4">
        <div>
          <label className="text-xs font-semibold text-on-surface-variant">Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej.: Partitura — Estudio N.° 1"
            className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-on-surface-variant">Instrucciones (opcional)</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="Ej.: practicar compases 1 a 8 con metrónomo a 60"
            className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind("file")}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              kind === "file"
                ? "border-primary bg-primary/10 text-primary"
                : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            Archivo
          </button>
          <button
            type="button"
            onClick={() => setKind("link")}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              kind === "link"
                ? "border-primary bg-primary/10 text-primary"
                : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            Enlace externo
          </button>
        </div>

        {kind === "file" ? (
          <div>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.ogg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-on-surface-variant"
            />
            <p className="mt-1 text-[11px] text-on-surface-variant/70">
              PDF, imagen o audio, hasta 20 MB. Nada de video en esta versión.
            </p>
          </div>
        ) : (
          <div>
            <input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-on-surface-variant/70">
              Un enlace externo conserva las condiciones de acceso del servicio de destino:
              Ventex no puede garantizar su privacidad.
            </p>
          </div>
        )}

        {!gate.ok && (file || externalUrl) && (
          <p className="text-xs text-on-surface-variant">{gate.reason}</p>
        )}
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
            onClick={() => void submit()}
            disabled={saving || !title.trim() || !gate.ok}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </SchoolModal>
  );
}

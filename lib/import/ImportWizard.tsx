"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  buildPreview,
  type DuplicatePolicy,
  type ImportEntity,
  type ImportResult,
  type PreviewRow,
} from "./core";
import { ACCEPTED_IMPORT_TYPES, downloadTemplate, readSpreadsheetFile } from "./spreadsheet";

/**
 * Asistente de importación compartido por Catálogo, Clientes y Proveedores:
 *
 *   plantilla → subir → vista previa (errores por fila) → confirmar → resultado
 *
 * No hace I/O contra la base: recibe `onImport` (una acción del store, que a
 * su vez llama al service). Leer el archivo local sí ocurre acá, porque es
 * conversión de un `File` en filas, no un viaje a la red.
 */

export interface ImportItem<R> {
  line: number;
  record: R;
  existingId?: string;
}

interface ImportWizardProps<R> {
  open: boolean;
  onClose: () => void;
  /** "productos", "clientes"… */
  title: string;
  entity: ImportEntity<R>;
  /** Claves de lo que ya existe (mismas que `entity.keysOf`) → id. */
  existing: Map<string, string>;
  templateFileName: string;
  /** Avisos extra que dependen del negocio (categorías nuevas, etc.). */
  annotate?: (rows: PreviewRow<R>[]) => PreviewRow<R>[];
  onImport: (items: ImportItem<R>[], onProgress: (done: number, total: number) => void) => Promise<ImportResult>;
  /** Texto bajo la descarga de la plantilla. */
  note?: ReactNode;
  /** Columnas (por clave) que se muestran en la vista previa. Por defecto, las 3 primeras. */
  previewKeys?: string[];
}

type Step = "upload" | "preview" | "importing" | "result";

const ACTION_CHIP: Record<string, { label: string; className: string }> = {
  create: { label: "Nuevo", className: "bg-primary/10 text-primary border-primary/20" },
  update: { label: "Actualiza", className: "bg-surface-container-high text-on-surface border-outline-variant/40" },
  skip: { label: "Se omite", className: "bg-surface-container-highest text-on-surface-variant border-outline-variant/30" },
  error: { label: "Error", className: "bg-error/10 text-error border-error/30" },
};

export function ImportWizard<R>({
  open,
  onClose,
  title,
  entity,
  existing,
  templateFileName,
  annotate,
  onImport,
  note,
  previewKeys,
}: ImportWizardProps<R>) {
  const [step, setStep] = useState<Step>("upload");
  const [matrix, setMatrix] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [policy, setPolicy] = useState<DuplicatePolicy>("update");
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => {
    if (!matrix) return null;
    const built = buildPreview(matrix, entity, existing, policy);
    return annotate ? { ...built, rows: annotate(built.rows) } : built;
  }, [matrix, entity, existing, policy, annotate]);

  const shownKeys = previewKeys ?? entity.columns.slice(0, 3).map((c) => c.key);
  const labelOf = (key: string) => entity.columns.find((c) => c.key === key)?.label ?? key;

  const reset = () => {
    setStep("upload");
    setMatrix(null);
    setFileName("");
    setReadError(null);
    setResult(null);
    setImportError(null);
    setOnlyProblems(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    if (step === "importing") return;
    reset();
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const rows = await readSpreadsheetFile(file);
      if (rows.length <= 1) {
        setReadError("El archivo no tiene filas para importar debajo de los encabezados.");
        return;
      }
      setMatrix(rows);
      setFileName(file.name);
      setStep("preview");
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setReading(false);
    }
  };

  const toImport: ImportItem<R>[] = (preview?.rows ?? [])
    .filter((r) => (r.action === "create" || r.action === "update") && r.record)
    .map((r) => ({ line: r.line, record: r.record as R, existingId: r.action === "update" ? r.existingId : undefined }));

  const runImport = async () => {
    setStep("importing");
    setImportError(null);
    setProgress({ done: 0, total: toImport.length });
    try {
      const res = await onImport(toImport, (done, total) => setProgress({ done, total }));
      setResult({
        ...res,
        skipped: (preview?.counts.skip ?? 0) + (preview?.counts.error ?? 0),
      });
      setStep("result");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "La importación no se pudo completar.");
      setStep("preview");
    }
  };

  const rowsShown = (preview?.rows ?? []).filter(
    (r) => !onlyProblems || r.action === "error" || r.warnings.length > 0,
  );
  const blocked = (preview?.missingColumns.length ?? 0) > 0;

  const footer =
    step === "upload" ? (
      <div className="flex justify-end">
        <Button variant="ghost" onClick={close}>Cancelar</Button>
      </div>
    ) : step === "preview" ? (
      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
        <Button variant="ghost" onClick={reset}>Elegir otro archivo</Button>
        <Button onClick={runImport} disabled={blocked || toImport.length === 0}>
          {toImport.length === 0 ? "Nada para importar" : `Importar ${toImport.length} ${toImport.length === 1 ? "fila" : "filas"}`}
        </Button>
      </div>
    ) : step === "result" ? (
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={reset}>Importar otro archivo</Button>
        <Button onClick={close}>Listo</Button>
      </div>
    ) : null;

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Importar ${title}`}
      description={step === "preview" && fileName ? `Archivo: ${fileName}` : undefined}
      size="xl"
      dismissible={step !== "importing"}
      closeOnEscape={step !== "importing"}
      footer={footer}
    >
      {step === "upload" && (
        <div className="space-y-6">
          <ol className="space-y-5 text-sm text-on-surface">
            <li>
              <p className="font-semibold">1. Descarga la plantilla</p>
              <p className="text-on-surface-variant mt-1">
                Trae las columnas en el orden correcto y las instrucciones en la segunda hoja. También sirve un CSV
                exportado desde acá o cualquier hoja con los mismos encabezados.
              </p>
              {note && <div className="text-on-surface-variant mt-1">{note}</div>}
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                loading={downloading}
                onClick={async () => {
                  setDownloading(true);
                  try {
                    await downloadTemplate(templateFileName, entity.columns, title.charAt(0).toUpperCase() + title.slice(1));
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                Descargar plantilla (.xlsx)
              </Button>
            </li>
            <li>
              <p className="font-semibold">2. Si ya existe, ¿qué hago?</p>
              <fieldset className="mt-2 flex flex-col sm:flex-row gap-2 sm:gap-6">
                <legend className="sr-only">Qué hacer con los registros que ya existen</legend>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="dup" checked={policy === "update"} onChange={() => setPolicy("update")} className="accent-primary" />
                  Actualizarlo con los datos del archivo
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="dup" checked={policy === "skip"} onChange={() => setPolicy("skip")} className="accent-primary" />
                  Dejarlo como está (omitir)
                </label>
              </fieldset>
              <p className="text-xs text-on-surface-variant mt-1.5">
                Una celda vacía no borra el dato guardado.
              </p>
            </li>
            <li>
              <p className="font-semibold">3. Sube el archivo</p>
              <label className="mt-2 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant/40 bg-surface-container-lowest px-4 py-8 text-center cursor-pointer hover:border-primary transition-colors focus-within:ring-2 focus-within:ring-primary">
                <span className="font-semibold text-primary">{reading ? "Leyendo…" : "Elegir archivo .xlsx o .csv"}</span>
                <span className="text-xs text-on-surface-variant">Hasta 5 MB. Se lee la primera hoja.</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_IMPORT_TYPES}
                  className="sr-only"
                  disabled={reading}
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
              {readError && (
                <p role="alert" className="mt-2 text-sm text-error">{readError}</p>
              )}
            </li>
          </ol>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4">
          {blocked && (
            <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              Faltan columnas obligatorias: <strong>{preview.missingColumns.join(", ")}</strong>. Usa la plantilla o
              renombra los encabezados.
            </p>
          )}
          {importError && (
            <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              {importError}
            </p>
          )}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {(["create", "update", "skip", "error"] as const).map((a) => (
              <div key={a} className="rounded-xl bg-surface-container-low border border-outline-variant/20 p-3">
                <dt className="text-xs text-on-surface-variant">
                  {a === "create" ? "Nuevos" : a === "update" ? "A actualizar" : a === "skip" ? "Se omiten" : "Con errores"}
                </dt>
                <dd className={`text-2xl font-bold tabular-nums ${a === "error" && preview.counts.error > 0 ? "text-error" : "text-on-surface"}`}>
                  {preview.counts[a]}
                </dd>
              </div>
            ))}
          </dl>
          {preview.unknownColumns.length > 0 && (
            <p className="text-xs text-on-surface-variant">
              Columnas que no se usan y se ignoran: {preview.unknownColumns.join(", ")}.
            </p>
          )}
          {preview.counts.error > 0 && (
            <p className="text-sm text-on-surface-variant">
              Las filas con error <strong>no se importan</strong>. Puedes corregirlas en el archivo y volver a subirlo, o
              importar ahora las que están bien.
            </p>
          )}
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="accent-primary" />
            Ver solo filas con errores o avisos
          </label>
          <div className="overflow-x-auto rounded-xl border border-outline-variant/20 max-h-[45vh]">
            <table className="w-full text-sm">
              <caption className="sr-only">Vista previa de la importación</caption>
              <thead className="sticky top-0 bg-surface-container-low">
                <tr className="text-left text-[11px] uppercase tracking-wider text-on-surface-variant">
                  <th scope="col" className="px-3 py-2">Línea</th>
                  <th scope="col" className="px-3 py-2">Acción</th>
                  {shownKeys.map((k) => (
                    <th key={k} scope="col" className="px-3 py-2">{labelOf(k)}</th>
                  ))}
                  <th scope="col" className="px-3 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {rowsShown.map((r) => (
                  <tr key={r.line} className={r.action === "error" ? "bg-error/5" : ""}>
                    <td className="px-3 py-2 tabular-nums text-on-surface-variant">{r.line}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${ACTION_CHIP[r.action].className}`}>
                        {ACTION_CHIP[r.action].label}
                      </span>
                    </td>
                    {shownKeys.map((k) => (
                      <td key={k} className="px-3 py-2 text-on-surface max-w-[14rem] truncate" title={r.values[k]}>
                        {r.values[k] || <span className="text-on-surface-variant">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-xs">
                      {r.errors.map((e) => (
                        <p key={e} className="text-error">{e}</p>
                      ))}
                      {r.warnings.map((w) => (
                        <p key={w} className="text-on-surface-variant">{w}</p>
                      ))}
                    </td>
                  </tr>
                ))}
                {rowsShown.length === 0 && (
                  <tr>
                    <td colSpan={shownKeys.length + 3} className="px-3 py-6 text-center text-on-surface-variant">
                      Ninguna fila con errores ni avisos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="py-8 space-y-3" role="status" aria-live="polite">
          <p className="text-sm text-on-surface">
            Importando {progress.done} de {progress.total}… No cierres esta ventana.
          </p>
          <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-4" role="status">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[
              { label: "Creados", value: result.created },
              { label: "Actualizados", value: result.updated },
              { label: "Omitidos", value: result.skipped },
              { label: "Fallaron", value: result.failed.length },
            ].map((x) => (
              <div key={x.label} className="rounded-xl bg-surface-container-low border border-outline-variant/20 p-3">
                <dt className="text-xs text-on-surface-variant">{x.label}</dt>
                <dd className={`text-2xl font-bold tabular-nums ${x.label === "Fallaron" && x.value > 0 ? "text-error" : "text-on-surface"}`}>
                  {x.value}
                </dd>
              </div>
            ))}
          </dl>
          {result.skipped > 0 && (
            <p className="text-xs text-on-surface-variant">
              Omitidos = filas que ya existían (y elegiste no tocar) más las que tenían errores en la vista previa.
            </p>
          )}
          {result.failed.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-on-surface mb-1">Filas que la base rechazó:</p>
              <ul className="max-h-48 overflow-y-auto text-sm space-y-1">
                {result.failed.map((f) => (
                  <li key={f.line} className="text-error">
                    Línea {f.line}: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

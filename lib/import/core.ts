import { normalizeHeader } from "./values";

/**
 * Motor genérico de importación: encabezados → registros validados → plan.
 *
 * Todo es puro. Cada entidad (productos, clientes, proveedores) aporta sus
 * columnas, cómo convertir una fila en registro y qué claves la identifican;
 * el motor resuelve lo común —encabezados en cualquier orden, filas vacías,
 * números de línea, duplicados dentro del archivo y contra lo que ya existe—
 * una sola vez y con tests.
 */

export interface ImportColumn {
  /** Clave interna (la usa `toRecord`). */
  key: string;
  /** Encabezado de la plantilla. */
  label: string;
  /** Otros nombres con los que se acepta la columna. */
  aliases?: string[];
  required?: boolean;
  /** Valor de ejemplo para la fila de muestra de la plantilla. */
  example?: string;
  /** Ayuda corta para la hoja "Instrucciones". */
  help?: string;
}

export interface RecordResult<R> {
  record: R | null;
  errors: string[];
  warnings?: string[];
}

export interface ImportEntity<R> {
  /** "productos", "clientes"… para los textos. */
  noun: string;
  columns: ImportColumn[];
  /** Convierte la fila (por clave de columna) en registro, o en errores. */
  toRecord: (values: Record<string, string>) => RecordResult<R>;
  /**
   * Claves que identifican el registro (p. ej. `sku:ABC`, `barcode:779…`).
   * El prefijo dice QUÉ dato coincidió y se usa en el mensaje.
   */
  keysOf: (record: R) => string[];
  /** Nombre legible de cada prefijo de clave ("SKU", "documento"). */
  keyLabels: Record<string, string>;
}

export type ImportAction = "create" | "update" | "skip" | "error";

export interface PreviewRow<R> {
  /** Línea del archivo (1 = encabezados), para que coincida con la hoja. */
  line: number;
  values: Record<string, string>;
  record: R | null;
  errors: string[];
  warnings: string[];
  action: ImportAction;
  /** Id del registro existente con el que coincide. */
  existingId?: string;
}

export type DuplicatePolicy = "update" | "skip";

export interface ImportPreview<R> {
  rows: PreviewRow<R>[];
  /** Columnas obligatorias que el archivo no trae: impiden importar. */
  missingColumns: string[];
  /** Encabezados del archivo que no corresponden a ninguna columna. */
  unknownColumns: string[];
  counts: Record<ImportAction, number>;
}

/**
 * Ubica cada columna conocida en el encabezado del archivo. El orden de las
 * columnas no importa, ni mayúsculas, tildes, `*` o paréntesis.
 */
export function mapHeaders(
  header: string[],
  columns: ImportColumn[],
): { index: Record<string, number>; missing: string[]; unknown: string[] } {
  const normalized = header.map((h) => normalizeHeader(h ?? ""));
  const index: Record<string, number> = {};
  const used = new Set<number>();
  for (const col of columns) {
    const names = [col.label, ...(col.aliases ?? [])].map(normalizeHeader);
    const at = normalized.findIndex((h, i) => !used.has(i) && h !== "" && names.includes(h));
    if (at >= 0) {
      index[col.key] = at;
      used.add(at);
    }
  }
  const missing = columns.filter((c) => c.required && index[c.key] === undefined).map((c) => c.label);
  const unknown = header.filter((h, i) => !used.has(i) && (h ?? "").trim() !== "");
  return { index, missing, unknown };
}

/**
 * Arma la vista previa: valida cada fila y decide qué se hará con ella.
 *
 * - Fila con errores → `error` (no se importa).
 * - Repetida dentro del archivo (misma clave que una fila anterior) → `error`:
 *   no hay forma buena de elegir cuál de las dos vale.
 * - Coincide con algo existente → `update` o `skip`, según `policy`.
 * - Coincide con DOS existentes distintos (el SKU es de uno y el código de
 *   barras de otro) → `error`: actualizar cualquiera de los dos sería adivinar.
 * - Lo demás → `create`.
 */
export function buildPreview<R>(
  matrix: string[][],
  entity: ImportEntity<R>,
  existing: Map<string, string>,
  policy: DuplicatePolicy,
): ImportPreview<R> {
  const counts: Record<ImportAction, number> = { create: 0, update: 0, skip: 0, error: 0 };
  if (matrix.length === 0) {
    return {
      rows: [],
      missingColumns: entity.columns.filter((c) => c.required).map((c) => c.label),
      unknownColumns: [],
      counts,
    };
  }

  const [header, ...body] = matrix;
  const { index, missing, unknown } = mapHeaders(header, entity.columns);
  const seen = new Map<string, number>();
  const rows: PreviewRow<R>[] = [];

  body.forEach((cells, i) => {
    const line = i + 2;
    const values: Record<string, string> = {};
    for (const col of entity.columns) {
      const at = index[col.key];
      values[col.key] = at === undefined ? "" : String(cells[at] ?? "").trim();
    }
    if (Object.values(values).every((v) => v === "")) return;

    const result = entity.toRecord(values);
    const errors = [...result.errors];
    const warnings = [...(result.warnings ?? [])];
    let action: ImportAction = "create";
    let existingId: string | undefined;

    if (result.record && errors.length === 0) {
      const keys = entity.keysOf(result.record);
      for (const key of keys) {
        const prev = seen.get(key);
        if (prev !== undefined) {
          errors.push(`Repetido en el archivo: mismo ${labelOf(entity, key)} que la línea ${prev}`);
          break;
        }
      }
      if (errors.length === 0) {
        const matches = [...new Set(keys.map((k) => existing.get(k)).filter((id): id is string => !!id))];
        if (matches.length > 1) {
          errors.push(
            `Los datos coinciden con ${matches.length} ${entity.noun} distintos; corrige el archivo para que apunte a uno solo`,
          );
        } else if (matches.length === 1) {
          existingId = matches[0];
          const which = keys.find((k) => existing.get(k) === existingId)!;
          action = policy;
          warnings.push(
            policy === "update"
              ? `Ya existe (mismo ${labelOf(entity, which)}): se actualizará`
              : `Ya existe (mismo ${labelOf(entity, which)}): se omitirá`,
          );
        }
        for (const key of keys) seen.set(key, line);
      }
    }

    if (errors.length > 0 || !result.record) action = "error";
    counts[action]++;
    rows.push({ line, values, record: errors.length ? null : result.record, errors, warnings, action, existingId });
  });

  return { rows, missingColumns: missing, unknownColumns: unknown, counts };
}

function labelOf<R>(entity: ImportEntity<R>, key: string): string {
  const prefix = key.slice(0, key.indexOf(":"));
  return entity.keyLabels[prefix] ?? prefix;
}

/** Resultado de ejecutar el plan, para la pantalla final. */
export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: { line: number; message: string }[];
}

/**
 * Inserta por lotes, y si un lote entero rebota (un duplicado que apareció
 * entre la vista previa y la confirmación, por ejemplo) reintenta ESE lote
 * fila por fila para saber exactamente cuál falló. Un error en la fila 340 no
 * tira abajo las otras 99 del lote ni obliga a adivinar dónde estaba.
 *
 * Las funciones de I/O llegan inyectadas: esto se testea sin base.
 */
export async function runInBatches<I extends { line: number }>(
  items: I[],
  batchSize: number,
  insertMany: (batch: I[]) => Promise<void>,
  insertOne: (item: I) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; failed: { line: number; message: string }[] }> {
  let okCount = 0;
  const failed: { line: number; message: string }[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      await insertMany(batch);
      okCount += batch.length;
    } catch {
      for (const item of batch) {
        try {
          await insertOne(item);
          okCount++;
        } catch (err) {
          failed.push({ line: item.line, message: errorMessage(err) });
        }
      }
    }
    onProgress?.(Math.min(i + batch.length, items.length), items.length);
  }
  return { ok: okCount, failed };
}

/** Mensaje legible de un error de Supabase/PostgREST o de JS. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: string; message?: string };
    if (e.code === "23505") return "Ya existe un registro con ese dato único (SKU, código o documento)";
    if (e.code === "42501") return "No tienes permiso para crear o editar estos registros";
    if (e.message) return e.message;
  }
  return String(err ?? "Error desconocido");
}

import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { schoolApiAccess } from "@/services/school.server";
import { quotaGate } from "@/services/school-materials.service";

const BUCKET = "school-materials";

// Mismo allowlist del bucket (migración `20260924040000_school_module_storage`):
// nada de video en el MVP. Se revalida ACÁ y no solo en la policy de Storage
// porque el upload lo hace el cliente admin (service_role, sin RLS) — la
// validación real de tipo/tamaño es esta, nunca la del navegador.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // tope del bucket
const DEFAULT_QUOTA_BYTES = 104_857_600;

function extensionOf(mimeType: string): string {
  const byMime: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
  };
  return byMime[mimeType] ?? "bin";
}

/**
 * Sube un material al bucket privado con validación server-side de tipo,
 * tamaño y cuota. Nunca inserta la fila de `school_materials`: eso lo hace
 * `createMaterial` desde el cliente, después de que esta ruta devuelve la
 * ubicación del archivo ya subido — mantiene la capa de I/O de la tabla en un
 * solo lugar (el servicio) y esta ruta solo resuelve lo que EXIGE el cliente
 * admin (Storage server-side).
 */
export async function POST(request: NextRequest) {
  const access = await schoolApiAccess();
  if (!access) {
    return NextResponse.json(
      { error: "No tenés acceso al módulo de la escuela." },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Ese tipo de archivo no está permitido (nada de video en esta versión)." },
      { status: 415 }
    );
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "El archivo supera el tamaño máximo permitido (20 MB)." },
      { status: 413 }
    );
  }

  const admin = createAdminClient();
  const { tenantId } = access;

  const [{ data: settingsRow }, { data: materials }] = await Promise.all([
    admin.from("school_settings").select("storage_quota_bytes").eq("user_id", tenantId).maybeSingle(),
    admin.from("school_materials").select("file_size").eq("user_id", tenantId),
  ]);
  const quotaBytes = settingsRow?.storage_quota_bytes ?? DEFAULT_QUOTA_BYTES;
  const usedBytes = (materials ?? []).reduce((acc, m) => acc + (m.file_size ?? 0), 0);

  const gate = quotaGate(usedBytes, quotaBytes, file.size);
  if (!gate.ok) {
    return NextResponse.json({ error: `No se pudo subir: ${gate.reason}.` }, { status: 413 });
  }

  const path = `${tenantId}/${crypto.randomUUID()}.${extensionOf(file.type)}`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json(
      { error: "No se pudo guardar el archivo. Intentá de nuevo." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    path,
    name: file.name,
    size: file.size,
    mimeType: file.type,
  });
}

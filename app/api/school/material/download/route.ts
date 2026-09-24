import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { schoolApiAccess } from "@/services/school.server";
import { fetchFamilyPayload } from "@/services/school-family.server";

const BUCKET = "school-materials";
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Único camino de descarga de un material privado. Una URL de storage suelta
 * NUNCA alcanza (el bucket no tiene policy de SELECT): esta ruta autoriza y
 * recién ahí entrega una URL firmada de corta duración con el cliente admin.
 *
 * Dos caminos de autorización, mutuamente excluyentes:
 * - Sesión de trabajador (`?materialId=`): `worker_can('school')` + el
 *   material pertenece al tenant efectivo del que pide.
 * - Enlace familiar (`?materialId=&token=`): el token debe resolver a
 *   `family_read`, no vencido, no revocado, y el material debe estar entre
 *   los que `school_family_payload` (alcance por token) devuelve para ESE
 *   estudiante — nunca el de otro alumno ni de otra familia.
 */
export async function GET(request: NextRequest) {
  const materialId = request.nextUrl.searchParams.get("materialId");
  const token = request.nextUrl.searchParams.get("token");
  if (!materialId) {
    return NextResponse.json({ error: "Falta el material." }, { status: 400 });
  }

  const admin = createAdminClient();

  let tenantId: string | null = null;

  if (token) {
    let payload;
    try {
      payload = await fetchFamilyPayload(token);
    } catch {
      return NextResponse.json({ error: "El enlace no es válido o venció." }, { status: 403 });
    }
    const authorized = payload.materials.some((m) => m.id === materialId);
    if (!authorized) {
      return NextResponse.json(
        { error: "Ese material no está disponible con este enlace." },
        { status: 403 }
      );
    }
    // El tenant se resuelve del propio material ya autorizado por el token
    // (nunca de un parámetro del llamador).
    const { data: material } = await admin
      .from("school_materials")
      .select("user_id")
      .eq("id", materialId)
      .maybeSingle();
    tenantId = material?.user_id ?? null;
  } else {
    const access = await schoolApiAccess();
    if (!access) {
      return NextResponse.json(
        { error: "No tenés acceso al módulo de la escuela." },
        { status: 403 }
      );
    }
    tenantId = access.tenantId;
  }

  if (!tenantId) {
    return NextResponse.json({ error: "Material no encontrado." }, { status: 404 });
  }

  const { data: material, error } = await admin
    .from("school_materials")
    .select("kind, file_path, external_url, user_id")
    .eq("id", materialId)
    .eq("user_id", tenantId)
    .maybeSingle();
  if (error || !material) {
    return NextResponse.json({ error: "Material no encontrado." }, { status: 404 });
  }
  if (material.kind === "link") {
    // La proyección familiar (`school_family_payload`) no expone
    // `external_url` — solo id/título/instrucciones/tipo, por diseño (nunca
    // listados de grupo). Esta ruta ya autorizó el acceso arriba (token
    // escopeado o sesión del tenant), así que es el lugar correcto para
    // resolver la URL real: mismo candado, sin ampliar lo que el RPC filtra.
    if (!material.external_url) {
      return NextResponse.json({ error: "Este material no tiene enlace configurado." }, { status: 404 });
    }
    return NextResponse.redirect(material.external_url);
  }
  if (!material.file_path) {
    return NextResponse.json({ error: "Material no encontrado." }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(material.file_path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "No se pudo generar la descarga." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}

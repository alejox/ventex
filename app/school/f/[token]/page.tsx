import { fetchFamilyPayload } from "@/services/school-family.server";

/**
 * Página familiar (lectura), fuera de `/dashboard`. Muestra SOLO lo que
 * `school_family_payload` proyecta por token: el alumno del enlace, su
 * próxima clase y su material — nunca listados de grupo ni datos de otra
 * familia. GET renderiza y NO consume nada (el enlace familiar es reutilizable
 * hasta que vence). La descarga de cada material pasa por
 * `/api/school/material/download`, que revalida el alcance del token.
 */
function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const KIND_LABEL: Record<string, string> = { file: "Archivo", link: "Enlace externo" };

export default async function FamilyMaterialPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let error: string | null = null;
  let payload: Awaited<ReturnType<typeof fetchFamilyPayload>> | null = null;
  try {
    payload = await fetchFamilyPayload(token);
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    error = /VENCIDO/.test(raw)
      ? "Este enlace venció. Pedile a la escuela uno nuevo."
      : /revocad/i.test(raw)
        ? "Este enlace fue revocado."
        : "Este enlace no es válido.";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-lg">
        <h1 className="text-lg font-bold text-on-surface">Escuela de música</h1>

        {error ? (
          <p className="mt-4 rounded-2xl bg-error/10 p-4 text-sm font-medium text-error">{error}</p>
        ) : (
          payload && (
            <div className="mt-4 space-y-5">
              <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4">
                <p className="font-semibold text-on-surface">{payload.student.full_name}</p>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  {payload.student.instrument}
                  {payload.student.level ? ` · ${payload.student.level}` : ""}
                </p>
              </div>

              <div>
                <h2 className="text-sm font-bold text-on-surface">Próxima clase</h2>
                {payload.next_lesson ? (
                  <p className="mt-1.5 text-sm text-on-surface-variant">
                    {payload.next_lesson.instrument} · {formatSlot(payload.next_lesson.start_at)}
                    {payload.next_lesson.room ? ` · ${payload.next_lesson.room}` : ""}
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-on-surface-variant">No hay clases programadas.</p>
                )}
              </div>

              <div>
                <h2 className="text-sm font-bold text-on-surface">Material</h2>
                {payload.materials.length === 0 ? (
                  <p className="mt-1.5 text-sm text-on-surface-variant">
                    Todavía no hay material publicado para {payload.student.full_name.split(" ")[0]}.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {payload.materials.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-3"
                      >
                        <p className="text-sm font-semibold text-on-surface">{m.title}</p>
                        {m.instructions && (
                          <p className="mt-0.5 text-xs text-on-surface-variant">{m.instructions}</p>
                        )}
                        {m.kind === "link" && (
                          <p className="mt-1 text-[11px] text-on-surface-variant/80">
                            Enlace externo: las condiciones de acceso son las del servicio de
                            destino, no las de Ventex.
                          </p>
                        )}
                        <a
                          href={`/api/school/material/download?materialId=${m.id}&token=${token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                        >
                          {KIND_LABEL[m.kind] ?? m.kind} · Descargar / abrir
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        )}

        <p className="mt-6 text-center text-xs text-on-surface-variant/70">
          Este enlace es personal: no lo compartas fuera de tu familia.
        </p>
      </div>
    </main>
  );
}

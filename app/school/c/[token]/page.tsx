import { previewConfirmLink } from "@/services/school-family.server";
import { ConfirmLessonAction } from "@/components/school/ConfirmLessonAction";

/**
 * Página de confirmación del profesor, fuera de `/dashboard` (proxy.ts no la
 * cubre — se autoguarda leyendo el token). El GET SOLO renderiza: ni siquiera
 * un preview de WhatsApp puede confirmar nada por acá, porque confirmar es un
 * POST explícito (`ConfirmLessonAction` → `/api/school/confirm`).
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

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programada",
  pending_close: "Ya confirmada, por cerrar",
  realized: "Ya cerrada",
  cancelled: "Cancelada",
  rescheduled: "Reprogramada",
};

export default async function TeacherConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let error: string | null = null;
  let lesson: Awaited<ReturnType<typeof previewConfirmLink>> | null = null;
  try {
    lesson = await previewConfirmLink(token);
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    error = /VENCIDO/.test(raw)
      ? "Este enlace de confirmación venció. Pedile a la escuela uno nuevo."
      : /revocad|usó/i.test(raw)
        ? "Este enlace ya se usó o fue reemplazado por uno nuevo."
        : "Este enlace no es válido.";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-lg">
        <h1 className="text-lg font-bold text-on-surface">Confirmación de clase</h1>

        {error ? (
          <p className="mt-4 rounded-2xl bg-error/10 p-4 text-sm font-medium text-error">{error}</p>
        ) : (
          lesson && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4">
                <p className="font-semibold text-on-surface">{lesson.instrument}</p>
                <p className="mt-1 text-sm text-on-surface-variant">{formatSlot(lesson.start_at)}</p>
                <p className="mt-0.5 text-sm text-on-surface-variant">Profesor/a: {lesson.teacher_name}</p>
                {lesson.room && <p className="mt-0.5 text-sm text-on-surface-variant">Sala: {lesson.room}</p>}
                <p className="mt-2 text-xs font-semibold text-primary">
                  {STATUS_LABEL[lesson.status] ?? lesson.status}
                </p>
              </div>

              {lesson.status === "scheduled" ? (
                <ConfirmLessonAction token={token} />
              ) : (
                <p className="text-sm text-on-surface-variant">
                  Esta clase ya no está pendiente de confirmación.
                </p>
              )}
            </div>
          )
        )}

        <p className="mt-6 text-center text-xs text-on-surface-variant/70">Ventex — Escuela de música</p>
      </div>
    </main>
  );
}

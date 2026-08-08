/**
 * Estado de carga de CUALQUIER ruta del dashboard.
 *
 * Sin este archivo, el App Router deja la pantalla anterior dibujada mientras
 * resuelve el segmento nuevo. Eso producía los dos síntomas que reportó QA, que
 * en realidad eran uno solo:
 *
 *   · "El primer clic en el menú no navega." Sí navegaba. Como nada cambiaba en
 *     pantalla, la persona volvía a hacer clic y para entonces ya había llegado.
 *   · "Se ve el contenido de Mi Plan antes de que aparezca el Panel." El mismo
 *     hueco, esta vez observado de frente.
 *
 * Un solo archivo cubre todo `/dashboard/*`: React busca el límite de Suspense
 * más cercano hacia arriba, y para todas las rutas hijas ese límite es éste.
 *
 * El esqueleto es deliberadamente genérico —encabezado, tarjetas y lista— porque
 * se muestra en pantallas de formas distintas. Su trabajo no es adivinar la
 * pantalla que viene: es decir "te escuché, ya voy".
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Cargando">
      <div className="space-y-3">
        <div className="h-8 w-64 max-w-full rounded-lg bg-surface-container-high animate-pulse" />
        <div className="h-4 w-40 max-w-full rounded bg-surface-container-high/60 animate-pulse" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border border-outline-variant/10 bg-surface-container animate-pulse"
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-outline-variant/10 bg-surface-container">
        <div className="h-16 border-b border-outline-variant/10 bg-surface-container-lowest" />
        <div className="divide-y divide-outline-variant/5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-7 py-4">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-surface-container-high animate-pulse" />
              <div className="h-4 flex-1 rounded bg-surface-container-high/70 animate-pulse" />
              <div className="hidden h-4 w-24 rounded bg-surface-container-high/50 animate-pulse sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

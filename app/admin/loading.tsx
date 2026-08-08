/**
 * Mismo motivo que `app/dashboard/loading.tsx`: sin un límite de Suspense, el
 * App Router deja la pantalla anterior dibujada mientras carga la nueva, y el
 * clic en el menú parece no haber hecho nada.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Cargando">
      <div className="h-8 w-56 max-w-full rounded-lg bg-surface-container-high animate-pulse" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border border-outline-variant/10 bg-surface-container animate-pulse"
          />
        ))}
      </div>
      <div className="h-80 rounded-3xl border border-outline-variant/10 bg-surface-container animate-pulse" />
    </div>
  );
}

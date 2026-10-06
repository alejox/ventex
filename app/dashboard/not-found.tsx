import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * `notFound()` llamado dentro de `/dashboard/*` (p. ej. un registro que no
 * existe o no es de este negocio). Se dibuja dentro del shell, así que el menú
 * sigue disponible. Las URLs que no coinciden con ninguna ruta NO llegan acá:
 * esas las atiende `app/not-found.tsx`.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-outline-variant/10 bg-surface-container-lowest px-6 py-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
          <SearchX className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold text-on-surface">No encontramos lo que buscas</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Puede que se haya eliminado o que el enlace no sea correcto.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

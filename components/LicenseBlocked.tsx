import { signout } from "@/utils/supabase/actions";
import { LogoHorizontal } from "@/components/Logo";

const MESSAGES: Record<string, { title: string; body: string }> = {
  pending: {
    title: "Licencia pendiente de activación",
    body: "Tu cuenta está creada pero tu revendedor no tiene créditos disponibles para activar tu licencia. Contáctalo para que la active.",
  },
  expired: {
    title: "Licencia vencida",
    body: "Tu mes de servicio terminó y no fue posible renovarlo. Contacta a tu revendedor para renovar tu licencia.",
  },
  suspended: {
    title: "Cuenta suspendida",
    body: "Tu acceso fue suspendido por tu revendedor. Contáctalo para reactivar tu cuenta.",
  },
};

/**
 * Pantalla de bloqueo para clientes de revendedor sin licencia vigente.
 * Server Component: la decisión de mostrarla la toma el layout del dashboard
 * tras llamar a ensure_license_current() (autoritativo en BD).
 */
export function LicenseBlocked({ status }: { status: string }) {
  const msg = MESSAGES[status] ?? MESSAGES.expired;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-background font-sans p-6">
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm p-8 text-center">
        <div className="flex justify-center mb-6">
          <LogoHorizontal className="w-[120px] h-[32px]" />
        </div>
        <div className="w-14 h-14 mx-auto rounded-full bg-error-container/20 flex items-center justify-center mb-5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-7 h-7 text-error-dim"
          >
            <rect x="5" y="11" width="14" height="9" rx="2" strokeLinecap="round" strokeLinejoin="round" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0v4" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-on-surface">{msg.title}</h1>
        <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">{msg.body}</p>
        <form action={signout} className="mt-8">
          <button
            type="submit"
            className="py-2.5 px-6 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/20 transition-colors"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

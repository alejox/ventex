import { signout } from "@/utils/supabase/actions";
import { LogoHorizontal } from "@/components/Logo";
import { whatsappUrl } from "@/config/contact";
import { fetchProfileServer } from "@/services/profile.server";

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
 *
 * B23: además de "contacta a tu revendedor", ofrece escribirle a soporte por
 * WhatsApp con el negocio y el estado ya en el mensaje, para que nadie quede
 * encerrado sin saber a quién llamar. El perfil ya lo leyó el layout en esta
 * misma petición (`fetchProfileServer` está memoizado con `cache`).
 */
export async function LicenseBlocked({ status }: { status: string }) {
  const msg = MESSAGES[status] ?? MESSAGES.expired;
  const profile = await fetchProfileServer().catch(() => null);
  const business = profile?.businessName?.trim() || profile?.fullName?.trim() || "";
  const supportMessage =
    `Hola, ${business ? `soy de ${business}. ` : ""}` +
    `Mi cuenta de Ventex muestra "${msg.title}"` +
    `${profile?.email ? ` (correo: ${profile.email})` : ""}. ¿Me ayudan a reactivarla?`;

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
        <a
          href={whatsappUrl(supportMessage)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 px-6 text-sm font-bold text-on-primary transition-colors hover:bg-primary-dim"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.85 9.85 0 0 0 12.04 2Zm5.8 14.03c-.25.69-1.44 1.32-1.98 1.36-.51.05-1 .24-3.36-.7-2.84-1.12-4.65-4.04-4.79-4.23-.14-.19-1.14-1.52-1.14-2.9 0-1.38.72-2.06.98-2.34.25-.28.55-.35.74-.35l.53.01c.17.01.4-.06.62.48.23.55.78 1.9.85 2.04.07.14.11.3.02.49-.09.19-.14.3-.28.46-.14.16-.29.36-.42.49-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.18-.28.37-.23.62-.14.25.09 1.6.75 1.87.89.28.14.46.21.53.32.07.12.07.67-.18 1.36Z" />
          </svg>
          Escribir a soporte por WhatsApp
        </a>
        <form action={signout} className="mt-3">
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

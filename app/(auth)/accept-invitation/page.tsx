"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Paso intermedio de las invitaciones reenviadas.
 *
 * El enlace de Supabase es de un solo uso y se consume con solo ABRIRLO. Los
 * antivirus y visores de correo abren los enlaces antes que la persona, así que
 * un enlace directo le llega vencido ("Enlace no válido"). Esta página no gasta
 * nada al cargar: el token solo se canjea cuando la persona pulsa el botón, que
 * un robot no pulsa.
 */
function AcceptInvitation() {
  const params = useSearchParams();
  const tokenHash = params.get("token_hash");
  const invitation = params.get("invitation");

  if (!tokenHash || !invitation) {
    return (
      <div className="w-full max-w-[420px] mx-auto text-center">
        <h2 className="text-[28px] font-bold text-on-surface mb-2">Enlace no válido</h2>
        <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
          Falta información en el enlace. Pídele al dueño del negocio que te reenvíe la invitación.
        </p>
        <Link
          href="/login"
          className="inline-block w-full bg-primary hover:bg-primary-dim text-on-primary font-semibold py-3.5 rounded-xl text-[15px] text-center"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  const next = `/update-password?invitation=${encodeURIComponent(invitation)}`;
  const href = `/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=${encodeURIComponent(next)}`;

  return (
    <div className="w-full max-w-[420px] mx-auto text-center">
      <h2 className="text-[28px] font-bold text-on-surface mb-2">Activa tu acceso</h2>
      <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
        Te invitaron a unirte a un negocio en Ventex. Pulsa el botón para elegir tu contraseña y entrar.
      </p>
      <a
        href={href}
        className="inline-block w-full bg-primary hover:bg-primary-dim text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] text-center"
      >
        Continuar
      </a>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitation />
    </Suspense>
  );
}

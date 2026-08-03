import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Enlace de acceso para el invitado que pagó en la landing sin tener cuenta.
 *
 * Este correo es la RED DE SEGURIDAD, no el camino principal: al volver del
 * checkout el visitante sigue en su navegador y la landing ya lo manda a
 * completar el registro. El correo cubre a quien cerró la pestaña.
 *
 * Por qué `generateLink` y no `inviteUserByEmail`:
 *  - `inviteUserByEmail` FALLA con 422 si el correo ya existe, que es justo el
 *    caso de alguien que ya tenía cuenta y compró desde la landing.
 *  - Manda el correo con la plantilla de Supabase, que hoy usa
 *    `{{ .ConfirmationURL }}` y por lo tanto el flujo PKCE `?code=`. Ese código
 *    necesita el `code_verifier` guardado en el navegador que PIDIÓ el enlace, y
 *    acá lo pide el servidor: el enlace moriría al abrirlo.
 *
 * `generateLink` devuelve el `hashed_token`, con el que armamos una URL a
 * `/auth/confirm?token_hash=…&type=…`, que se verifica del lado del servidor y
 * funciona en cualquier navegador o dispositivo.
 */

const EMAIL_TYPES = { invite: "invite", magiclink: "magiclink" } as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Un usuario nuevo se crea con `invite`; uno que ya existe solo puede recibir
 * `magiclink`. En vez de listar usuarios (paginado y con carrera), se intenta
 * el invite y se cae al magiclink cuando el correo ya está registrado.
 */
async function generateAccessLink(email: string, fullName: string | null) {
  const admin = createAdminClient();
  const redirectTo = `${siteUrl()}/auth/confirm`;

  const invite = await admin.auth.admin.generateLink({
    type: EMAIL_TYPES.invite,
    email,
    options: { redirectTo, data: { full_name: fullName } },
  });

  if (!invite.error && invite.data?.properties?.hashed_token) {
    return {
      tokenHash: invite.data.properties.hashed_token,
      type: EMAIL_TYPES.invite as string,
      isNewUser: true,
    };
  }

  const magic = await admin.auth.admin.generateLink({
    type: EMAIL_TYPES.magiclink,
    email,
    options: { redirectTo },
  });

  if (magic.error || !magic.data?.properties?.hashed_token) {
    throw new Error(
      magic.error?.message ?? invite.error?.message ?? "No se pudo generar el enlace de acceso.",
    );
  }

  return {
    tokenHash: magic.data.properties.hashed_token,
    type: EMAIL_TYPES.magiclink as string,
    isNewUser: false,
  };
}

export async function sendGuestCheckoutEmail(input: {
  email: string;
  fullName?: string | null;
  planName?: string | null;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Faltan RESEND_API_KEY o RESEND_FROM_EMAIL para el correo del checkout.");
  }

  const { tokenHash, type, isNewUser } = await generateAccessLink(
    input.email,
    input.fullName ?? null,
  );

  // A un usuario nuevo hay que pedirle contraseña y datos del negocio; a uno
  // que ya tenía cuenta le alcanza con ver su plan ya activo.
  const next = isNewUser ? "/register?paid=1" : "/dashboard/subscription?paid=1";
  const url =
    `${siteUrl()}/auth/confirm` +
    `?token_hash=${encodeURIComponent(tokenHash)}` +
    `&type=${encodeURIComponent(type)}` +
    `&next=${encodeURIComponent(next)}`;

  const plan = input.planName ? escapeHtml(input.planName) : null;
  const greeting = input.fullName ? escapeHtml(input.fullName.split(" ")[0]) : "Hola";
  const safeUrl = escapeHtml(url);
  const action = isNewUser ? "Completar mi registro" : "Ver mi plan";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: plan ? `Tu plan ${plan} de Ventex ya está pago` : "Tu pago en Ventex ya está confirmado",
      text: `${input.fullName ?? "Hola"}, recibimos tu pago${plan ? ` del plan ${plan}` : ""}. ${
        isNewUser
          ? "Entrá a este enlace para poner tu contraseña y activar tu cuenta"
          : "Entrá a este enlace para ver tu plan ya activo"
      }: ${url}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:560px;margin:auto"><h1>¡Pago confirmado!</h1><p>${greeting}, recibimos tu pago${
        plan ? ` del plan <strong>${plan}</strong>` : ""
      }.</p><p>${
        isNewUser
          ? "Solo falta que pongas una contraseña y el nombre de tu negocio para empezar a usar Ventex."
          : "Tu plan ya quedó activo en tu cuenta."
      }</p><p><a href="${safeUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${action}</a></p><p style="font-size:13px;color:#65718b">El enlace es de un solo uso. Si venció, podés iniciar sesión con ${escapeHtml(
        input.email,
      )} y tu plan va a estar igual: el pago ya quedó registrado.</p></div>`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "Resend rechazó el correo del checkout.");
  }
}

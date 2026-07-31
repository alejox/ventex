import "server-only";

type InvitationEmailInput = {
  recipient: string;
  employeeName: string;
  businessName: string;
  role: string | null;
  invitationUrl: string;
};

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

export async function sendExistingUserInvitationEmail(
  input: InvitationEmailInput,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Faltan RESEND_API_KEY o RESEND_FROM_EMAIL.");
  }

  const businessName = escapeHtml(input.businessName || "Ventex");
  const employeeName = escapeHtml(input.employeeName || "Hola");
  const role = input.role ? escapeHtml(input.role) : "miembro del equipo";
  const url = escapeHtml(input.invitationUrl);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.recipient],
      subject: `Invitación para unirte a ${businessName} en Ventex`,
      text: `${employeeName}, te invitaron a trabajar en ${input.businessName || "Ventex"} como ${input.role || "miembro del equipo"}. Iniciá sesión con ${input.recipient} y aceptá la invitación: ${input.invitationUrl}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:560px;margin:auto"><h1>Invitación a ${businessName}</h1><p>${employeeName}, te invitaron a trabajar en <strong>${businessName}</strong> como <strong>${role}</strong>.</p><p>Iniciá sesión con tu cuenta de Google y aceptá la invitación desde Ventex.</p><p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Ver invitación</a></p><p style="font-size:13px;color:#65718b">Si no esperabas este correo, podés ignorarlo.</p></div>`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "Resend rechazó el correo de invitación.");
  }
}

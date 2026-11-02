import type { AppNotification } from "@/services/notifications.service";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * Aviso de WhatsApp al CLIENTE que canceló su cita desde el sitio público.
 *
 * El dueño recibe la notificación "Cita cancelada por el cliente" y desde ahí
 * abre WhatsApp con este mensaje escrito: lo manda una persona, igual que las
 * promociones (Ventex no usa la API de WhatsApp a propósito). Puro y testeado.
 */

export const CANCELLED_BY_CUSTOMER_TITLE = "Cita cancelada por el cliente";

export interface CancelNoticeInput {
  customerName?: string | null;
  service?: string | null;
  /** 'YYYY-MM-DD' tal como lo guarda `appointments.appointment_date`. */
  date?: string | null;
  /** 'HH:MM'. */
  time?: string | null;
  businessName?: string | null;
}

const clean = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null;

/**
 * 'YYYY-MM-DD' → 'DD/MM/YYYY' cortando el texto: `new Date('2026-11-05')` es
 * medianoche UTC y en Colombia se muestra como el 4.
 */
export function formatCancelDate(date: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

export function buildCancelNoticeMessage(input: CancelNoticeInput): string {
  const name = clean(input.customerName);
  const service = clean(input.service);
  const date = formatCancelDate(clean(input.date));
  const time = clean(input.time);
  const business = clean(input.businessName);

  let cita = "se ha cancelado tu cita";
  if (service) cita += ` de ${service}`;
  if (date) cita += ` del ${date}`;
  if (time) cita += ` a las ${time}`;
  if (business) cita += ` en ${business}`;

  return `Hola${name ? ` ${name}` : ""}, ${cita}. Si quieres agendar de nuevo, escríbenos por aquí.`;
}

/**
 * Enlace "Avisar por WhatsApp" para una notificación de cancelación del
 * cliente. Las notificaciones anteriores a `20261101110000` no traen `event`
 * (ni fecha/hora/servicio): se reconocen por el título y el mensaje usa solo
 * lo que hay en `data`. null = no aplica o el teléfono no sirve.
 *
 * El aviso a quien atiende la cita (`event = 'cancelled_by_customer_staff'`,
 * `20261101120000`) nunca trae el enlace: avisarle al cliente es del dueño.
 */
export function cancelNoticeLink(notification: AppNotification, businessName: string | null): string | null {
  const data = notification.data ?? {};
  const isCancel =
    data.event === "cancelled_by_customer" ||
    (data.event === undefined && notification.title === CANCELLED_BY_CUSTOMER_TITLE);
  if (!isCancel) return null;

  const phone = clean(data.customer_phone);
  if (!phone) return null;

  const message = buildCancelNoticeMessage({
    customerName: clean(data.customer_name),
    service: clean(data.service),
    date: clean(data.date),
    time: clean(data.time),
    businessName,
  });
  return whatsappLink(phone, message);
}

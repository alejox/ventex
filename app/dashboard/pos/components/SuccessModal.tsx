import { formatMoney } from "@/lib/money";

interface SuccessModalProps {
  onPrint: () => void;
  onClose: () => void;
  /**
   * La venta se cobró sin conexión y todavía no llegó al servidor.
   *
   * No es un detalle cosmético: este modal se queda en pantalla hasta que el
   * cajero lo cierra, así que es el mensaje que realmente lee. Decirle "el pago
   * se procesó correctamente" cuando la venta está esperando en el dispositivo
   * es la mentira exacta que toda esta función existe para no decir.
   */
  offline?: boolean;
  /**
   * Enlace de WhatsApp con el mensaje del contador de cortes, ya armado.
   *
   * null = no hay nada que mandar: el negocio no tiene promociones activas, la
   * venta no llevó un servicio que cuente, el cliente no está registrado o no
   * tiene teléfono. Y también cuando la venta se cobró SIN CONEXIÓN: ahí el
   * contador de la base todavía no subió, así que el mensaje diría un número
   * viejo.
   */
  whatsappLink?: string | null;
  /** Nombre del cliente, para que el botón diga a quién le escribe. */
  customerName?: string | null;
  /**
   * Abre el cajón a mano. Ausente = esta terminal no tiene cajón configurado.
   *
   * Existe incluso con la apertura automática encendida: si el pulso no salió
   * —la impresora justo estaba imprimiendo, el cable se soltó— el cajero tiene
   * que poder reintentar sin buscar la llave, y con el cliente enfrente.
   */
  onOpenDrawer?: (() => void) | null;
  /** Total cobrado. null = no se conoce (no se dibuja el resumen). */
  total?: number | null;
  /** Efectivo recibido. null = no fue en efectivo o no se anotó. */
  tendered?: number | null;
  /**
   * Cambio a entregar. Con cambio, el número va grande y el modal NO se cierra
   * solo: antes solo se veía en el modal de cobro y desaparecía al confirmar,
   * justo cuando el cajero tenía que contarlo.
   */
  change?: number;
  /**
   * Todavía se está canjeando el premio o armando el mensaje del contador: el
   * modal se abre sin esperarlos (C14) y el botón de WhatsApp aparece después.
   */
  preparingMessage?: boolean;
}

export function SuccessModal({
  onPrint,
  onClose,
  offline = false,
  whatsappLink = null,
  customerName = null,
  onOpenDrawer = null,
  total = null,
  tendered = null,
  change = 0,
  preparingMessage = false,
}: SuccessModalProps) {
  const hasChange = change > 0;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 print:hidden"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-[24px] w-full max-w-sm border border-outline-variant/10 shadow-2xl p-8 text-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
            offline ? "bg-[#f59e0b]/10 text-[#f59e0b]" : "bg-accent-fin/10 text-accent-fin"
          }`}
        >
          {offline ? (
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-8 h-8">
              <path d="M12 8v5" />
              <path d="M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          ) : (
            <svg fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h2 className="text-2xl font-bold text-on-surface mb-2">
          {offline ? "Venta cobrada sin conexión" : "¡Venta exitosa!"}
        </h2>
        <p className={`text-sm text-on-surface-variant ${total != null ? "mb-5" : "mb-8"}`}>
          {offline
            ? "Quedó guardada en este dispositivo y se enviará sola cuando vuelva internet. No cierres sesión ni borres los datos del navegador."
            : "El pago se procesó correctamente. ¿Quieres imprimir el recibo de esta venta?"}
        </p>
        {total != null && (
          <div className="mb-6 rounded-2xl border border-outline-variant/15 bg-surface-container p-4 text-left">
            <dl className="space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-on-surface-variant">Total</dt>
                <dd className="font-bold text-on-surface tabular-nums">{formatMoney(total)}</dd>
              </div>
              {tendered != null && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-on-surface-variant">Recibido</dt>
                  <dd className="font-semibold text-on-surface tabular-nums">{formatMoney(tendered)}</dd>
                </div>
              )}
            </dl>
            {hasChange && (
              <div
                role="status"
                className="mt-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-3 text-center"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Entregar cambio
                </p>
                <p className="text-4xl font-extrabold text-primary tabular-nums tracking-tight break-all">
                  {formatMoney(change)}
                </p>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {preparingMessage && !whatsappLink && (
            <p role="status" className="flex items-center justify-center gap-2 text-xs text-on-surface-variant">
              <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" aria-hidden="true" />
              Actualizando promociones del cliente…
            </p>
          )}
          {/* Va PRIMERO y en verde: es la acción nueva y la que el cajero
              tiene que ver mientras el cliente todavía está en la silla. */}
          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white font-bold transition-colors flex justify-center items-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.6-.8-2.7-1.5-3.8-3.4-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.4 1.9.8 2.6.9 3.5.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z" />
                <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
              </svg>
              {customerName ? `Enviar a ${customerName}` : "Enviar por WhatsApp"}
            </a>
          )}
          <button
            onClick={onPrint}
            className={`w-full py-3 rounded-xl font-bold transition-colors flex justify-center items-center gap-2 ${
              whatsappLink
                ? "border border-outline-variant/30 hover:bg-surface-container-low text-on-surface"
                : "bg-primary text-on-primary hover:bg-primary-dim shadow-lg shadow-primary/20"
            }`}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z" />
              <line x1="16" y1="8" x2="8" y2="8" />
              <line x1="16" y1="12" x2="8" y2="12" />
              <line x1="10" y1="16" x2="8" y2="16" />
            </svg>
            Imprimir Recibo
          </button>
          {onOpenDrawer && (
            <button
              onClick={onOpenDrawer}
              className="w-full py-3 rounded-xl border border-outline-variant/30 hover:bg-surface-container-low text-on-surface font-semibold transition-colors flex justify-center items-center gap-2"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                <rect x="2" y="7" width="20" height="13" rx="2" />
                <path d="M2 12h20" />
                <path d="M10 16h4" />
                <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
              </svg>
              Abrir cajón
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-outline-variant/30 hover:bg-surface-container-low text-on-surface font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

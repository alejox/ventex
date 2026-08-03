import { whatsappUrl } from "@/config/contact";
import { BrandIcon } from "@/app/assets/icons/BrandIcons";

/**
 * Botón flotante de WhatsApp, abajo a la derecha.
 *
 * Sólo la forma: quién lo usa decide QUÉ mensaje va escrito. Por eso no tiene
 * hooks ni `"use client"` — así lo puede montar tanto la landing (Server
 * Component) como el shell del dashboard, y el aspecto no se bifurca en dos
 * copias que se van separando con el tiempo.
 */
export function WhatsappFab({
  message,
  label = "Soporte",
  pulse = false,
}: {
  /** Texto que WhatsApp abre ya escrito. */
  message: string;
  label?: string;
  /**
   * Ondas + escalado para llamar la atención. Va en la landing, donde el
   * visitante todavía no sabe que puede escribir; DENTRO del panel queda apagado
   * a propósito: algo animándose toda la jornada de trabajo deja de llamar la
   * atención y pasa a molestar.
   */
  pulse?: boolean;
}) {
  return (
    /* Contenedor posicionado: las ondas son HERMANAS del botón, no hijas. Como
       hijas se pintarían por encima de su fondo verde y en vez de una onda se
       vería el botón aclarándose. */
    <div className="print:hidden fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40">
      {pulse && (
        <>
          {/* Dos ondas desfasadas media vuelta: con una sola hay un vacío
              perceptible entre repeticiones. `pointer-events-none` para que la
              onda expandida no se coma clics del contenido de al lado. */}
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[#25D366] animate-wave motion-reduce:hidden" />
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[#25D366] animate-wave [animation-delay:1.2s] motion-reduce:hidden" />
        </>
      )}

      <a
        href={whatsappUrl(message)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} por WhatsApp`}
        title={`${label} por WhatsApp`}
        /* z-40 en el contenedor: por debajo de los modales (z-200) — un botón
           flotante encima de un diálogo tapa justamente lo que la persona vino a
           resolver. La safe-area es por el gesto de inicio del iPhone.
           El escalado y el hover NO pueden convivir en `transform`: gana la
           animación y el hover no se vería. Por eso al pasar el mouse el botón
           se ilumina en vez de crecer. */
        className={`relative inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3.5 font-bold text-white shadow-lg shadow-[#25D366]/30 transition-[filter] hover:brightness-110 ${
          pulse ? "animate-breathe motion-reduce:animate-none" : ""
        }`}
      >
        <BrandIcon name="whatsapp" className="h-6 w-6 shrink-0" />
        <span className="hidden pr-1 text-sm sm:inline">{label}</span>
      </a>
    </div>
  );
}

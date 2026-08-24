import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, LegalNotice } from "../components/LegalDoc";

export const metadata: Metadata = {
  title: "Términos de Servicio — Ventex",
  description:
    "Las condiciones que regulan el uso de Ventex: cuentas y colaboradores, planes y pagos, uso aceptable y propiedad de tus datos.",
};

/**
 * El texto es el del documento original, sin reescribir: es material legal y
 * cambiarle la redacción al portarlo cambiaría lo que el negocio se compromete
 * a cumplir. Lo único que se movió es la presentación.
 */
export default function TerminosPage() {
  return (
    <LegalDoc title="Términos de Servicio" updatedAt="24 de agosto de 2026">
      <LegalNotice>
        Este documento es una plantilla base pensada para agilizar la publicación de Ventex. Antes de
        dejarla como versión definitiva, te recomendamos que la revise un abogado, especialmente en lo
        relacionado con condiciones de pago, cancelaciones y responsabilidad frente a tus usuarios.
      </LegalNotice>

      <p>
        Estos Términos de Servicio (&quot;Términos&quot;) regulan el uso de Ventex, la plataforma de punto
        de venta, inventario y finanzas (&quot;el Servicio&quot;, &quot;la Plataforma&quot;), operada por
        Ventex (&quot;nosotros&quot;). Al crear una cuenta o usar el Servicio, aceptas estos Términos.
      </p>

      <h2>1. Descripción del servicio</h2>
      <p>
        Ventex es una plataforma que permite a negocios gestionar ventas (punto de venta), inventario y
        finanzas desde un solo lugar, incluyendo el registro de transacciones, control de stock y
        seguimiento de ingresos y gastos.
      </p>

      <h2>2. Cuentas y colaboradores</h2>
      <p>
        Para usar Ventex debes crear una cuenta con información veraz y actualizada. Eres responsable de
        mantener la confidencialidad de tus credenciales y de toda actividad que ocurra bajo tu cuenta,
        incluida la de los colaboradores que invites. Cada plan tiene un límite de colaboradores según lo
        indicado en la página de precios.
      </p>

      <h2>3. Planes y pagos</h2>
      <ul>
        <li>
          Ventex ofrece un plan gratuito y planes pagos (Plata, Oro) con límites de ventas mensuales y
          número de colaboradores, según lo publicado en{" "}
          <Link href="/#precios">ventex.app</Link>.
        </li>
        <li>
          Los pagos de los planes pagos se procesan mediante Nequi, PSE, tarjeta u otros medios
          habilitados, a través de proveedores de pago externos.
        </li>
        <li>
          La facturación es mensual (o según la periodicidad elegida) y puedes cancelar tu plan pago en
          cualquier momento; la cancelación aplicará a partir del siguiente ciclo de facturación, salvo
          que se indique lo contrario al momento de la compra.
        </li>
        <li>
          Los precios pueden cambiar con aviso previo razonable a través de la Plataforma o por correo
          electrónico.
        </li>
      </ul>

      <h2>4. Uso aceptable</h2>
      <p>Al usar Ventex, te comprometes a no:</p>
      <ul>
        <li>Usar la Plataforma para actividades ilegales o fraudulentas.</li>
        <li>Intentar acceder sin autorización a cuentas, datos o sistemas de otros usuarios.</li>
        <li>
          Interferir con el funcionamiento normal del Servicio (por ejemplo, mediante ingeniería inversa o
          ataques de denegación de servicio).
        </li>
        <li>Revender o sublicenciar el Servicio sin autorización expresa de Ventex.</li>
      </ul>

      <h2>5. Propiedad de tus datos</h2>
      <p>
        Los datos de tu negocio (inventario, ventas, información financiera y de tus clientes) te
        pertenecen. Ventex únicamente los procesa y almacena para prestarte el Servicio, conforme a nuestra{" "}
        <Link href="/privacidad">Política de Privacidad</Link>. Si cancelas tu cuenta, podrás solicitar la
        exportación o eliminación de tus datos según los plazos indicados en esa política.
      </p>

      <h2>6. Disponibilidad del servicio</h2>
      <p>
        Nos esforzamos por mantener Ventex disponible de forma continua, pero no garantizamos que el
        Servicio esté libre de interrupciones, errores o fallas. Podemos realizar mantenimientos
        programados o no programados con o sin previo aviso.
      </p>

      <h2>7. Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley, Ventex no será responsable por daños indirectos, incidentales o
        consecuentes derivados del uso o la imposibilidad de uso del Servicio, incluyendo pérdida de
        ganancias, datos o interrupciones del negocio. El Servicio se ofrece &quot;tal cual&quot; y
        &quot;según disponibilidad&quot;.
      </p>

      <h2>8. Terminación</h2>
      <p>
        Puedes dejar de usar Ventex y cerrar tu cuenta en cualquier momento. Nosotros podemos suspender o
        terminar tu acceso al Servicio si incumples estos Términos, sin perjuicio de cualquier obligación
        de pago pendiente.
      </p>

      <h2>9. Cambios a estos términos</h2>
      <p>
        Podemos actualizar estos Términos de tiempo en tiempo. Si los cambios son significativos, te lo
        notificaremos por la Plataforma o por correo electrónico antes de que entren en vigor.
      </p>

      <h2>10. Ley aplicable</h2>
      <p>
        Estos Términos se rigen por las leyes de la República de Colombia, sin perjuicio de las normas de
        protección al consumidor u otras normas de orden público que resulten aplicables en tu país de
        residencia.
      </p>

      <h2>11. Contacto</h2>
      <p>
        Si tienes preguntas sobre estos Términos, escríbenos a{" "}
        <a href="mailto:hola@ventex.app">hola@ventex.app</a>.
      </p>

      <hr className="border-none border-t border-outline-variant/20 mt-12 mb-8" />
      <p className="text-sm">
        ¿Buscabas la{" "}
        <Link href="/privacidad" className="text-primary underline underline-offset-2 hover:text-primary-dim">
          Política de Privacidad
        </Link>
        ?
      </p>
    </LegalDoc>
  );
}

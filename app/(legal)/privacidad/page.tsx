import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, LegalNotice } from "../components/LegalDoc";

export const metadata: Metadata = {
  title: "Política de Privacidad — Ventex",
  description:
    "Qué información recopila Ventex, cómo la usamos, con quién la compartimos y qué derechos tienes sobre ella.",
};

/**
 * El texto es el del documento original, sin reescribir: es material legal y
 * cambiarle la redacción al portarlo cambiaría lo que el negocio se compromete
 * a cumplir. Lo único que se movió es la presentación.
 */
export default function PrivacidadPage() {
  return (
    <LegalDoc title="Política de Privacidad" updatedAt="24 de agosto de 2026">
      <LegalNotice>
        Este documento es una plantilla base pensada para agilizar la publicación de Ventex. Antes de
        dejarla como versión definitiva, te recomendamos que la revise un abogado, en particular en lo
        referente a la Ley 1581 de 2012 de protección de datos personales en Colombia y a cualquier
        jurisdicción adicional donde tengas usuarios.
      </LegalNotice>

      <p>
        En Ventex (&quot;nosotros&quot;, &quot;nuestro&quot; o &quot;la Plataforma&quot;) nos tomamos en
        serio la privacidad de las personas que usan nuestro producto de punto de venta, inventario y
        finanzas. Esta Política de Privacidad explica qué información recopilamos, cómo la usamos, con
        quién la compartimos y qué derechos tienes sobre ella.
      </p>

      <h2>1. Información que recopilamos</h2>
      <h3>1.1 Información de la cuenta</h3>
      <p>
        Cuando creas una cuenta en Ventex recopilamos datos como tu nombre, correo electrónico y, si
        eliges iniciar sesión con Google, la información básica de perfil que Google comparte con
        nosotros (nombre, correo y foto de perfil), a través de nuestro proveedor de autenticación.
      </p>
      <h3>1.2 Información del negocio</h3>
      <p>
        Para prestar el servicio, almacenamos la información que tú y tus colaboradores ingresan en la
        Plataforma: productos, inventario, ventas, transacciones, datos financieros (ingresos, gastos,
        beneficio neto) y datos de tus propios clientes que decidas registrar (por ejemplo, para
        facturación o fidelización).
      </p>
      <h3>1.3 Información de pagos</h3>
      <p>
        Si contratas un plan pago, procesamos tu pago a través de pasarelas de pago externas (por ejemplo
        Nequi, PSE o procesadores de tarjeta). Ventex no almacena los números completos de tu tarjeta; esa
        información es manejada directamente por el proveedor de pagos correspondiente.
      </p>
      <h3>1.4 Información técnica y de uso</h3>
      <p>
        Recopilamos automáticamente cierta información sobre cómo usas la Plataforma, como dirección IP,
        tipo de dispositivo y navegador, páginas visitadas y acciones realizadas, con el fin de mantener
        la seguridad y mejorar el producto.
      </p>

      <h2>2. Cómo usamos tu información</h2>
      <ul>
        <li>Para crear y administrar tu cuenta y la de tus colaboradores.</li>
        <li>Para operar las funciones de punto de venta, inventario y finanzas que ofrece la Plataforma.</li>
        <li>Para procesar pagos y gestionar tu suscripción.</li>
        <li>Para comunicarnos contigo sobre cambios en el servicio, soporte técnico o novedades.</li>
        <li>Para prevenir fraude, abuso o accesos no autorizados.</li>
        <li>Para cumplir con obligaciones legales aplicables.</li>
      </ul>

      <h2>3. Con quién compartimos tu información</h2>
      <p>No vendemos tu información personal. La compartimos únicamente con:</p>
      <ul>
        <li>
          <strong>Proveedores de infraestructura y autenticación</strong> que almacenan y procesan los
          datos en nuestro nombre bajo acuerdos de confidencialidad.
        </li>
        <li>
          <strong>Proveedores de pago</strong>, únicamente la información necesaria para procesar tu
          transacción.
        </li>
        <li>
          <strong>Autoridades</strong>, cuando la ley lo exija o para proteger nuestros derechos legales.
        </li>
      </ul>

      <h2>4. Aislamiento y separación de datos</h2>
      <p>
        Los datos de cada cuenta de negocio se mantienen lógicamente separados de los de otras cuentas.
        Tus colaboradores solo pueden acceder a la información de tu negocio conforme a los permisos que
        les asignes.
      </p>

      <h2>5. Conservación de datos</h2>
      <p>
        Conservamos tu información mientras tu cuenta esté activa. Si cierras tu cuenta, conservaremos
        cierta información durante el tiempo necesario para cumplir obligaciones legales, contables o
        fiscales, o para resolver disputas.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        De acuerdo con la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia (habeas data), tienes
        derecho a conocer, actualizar, rectificar y suprimir tu información personal, así como a revocar
        la autorización otorgada para su tratamiento. Puedes ejercer estos derechos escribiéndonos a{" "}
        <a href="mailto:hola@ventex.app">hola@ventex.app</a>.
      </p>
      <p>
        Si tienes usuarios o resides fuera de Colombia, es posible que existan derechos adicionales
        aplicables según tu jurisdicción (por ejemplo, normativa de protección de datos de tu país);
        contáctanos para más información.
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas razonables para proteger tu información, incluyendo
        cifrado en tránsito y controles de acceso. Ningún sistema es 100% infalible, por lo que no podemos
        garantizar seguridad absoluta.
      </p>

      <h2>8. Menores de edad</h2>
      <p>
        Ventex no está dirigido a menores de edad y no recopilamos intencionalmente información de
        personas menores de 18 años.
      </p>

      <h2>9. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta Política de Privacidad de tiempo en tiempo. Publicaremos cualquier cambio
        en esta misma página junto con la fecha de la última actualización.
      </p>

      <h2>10. Contacto</h2>
      <p>
        Si tienes preguntas sobre esta Política de Privacidad o sobre el tratamiento de tus datos,
        escríbenos a <a href="mailto:hola@ventex.app">hola@ventex.app</a>.
      </p>

      <hr className="border-none border-t border-outline-variant/20 mt-12 mb-8" />
      <p className="text-sm">
        ¿Buscabas los{" "}
        <Link href="/terminos" className="text-primary underline underline-offset-2 hover:text-primary-dim">
          Términos de Servicio
        </Link>
        ?
      </p>
    </LegalDoc>
  );
}

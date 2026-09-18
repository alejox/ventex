import type { Plan } from "@/services/subscription.service";
import { SITE_URL, absoluteUrl } from "@/lib/site";

/**
 * Datos estructurados de la landing (JSON-LD).
 *
 * Sirven para dos cosas distintas y conviene no confundirlas: `SoftwareApplication`
 * es lo que puede darle a Google el bloque de precios y categoría en el
 * resultado; `Organization` es lo que alimenta el panel de marca.
 *
 * Los precios salen de la MISMA tabla `plans` que pinta la sección de precios.
 * No es comodidad: si el schema dice un número y la página muestra otro, Google
 * lo trata como marcado engañoso y puede quitar el resultado enriquecido del
 * sitio entero. Un precio hardcodeado acá se desincroniza en el primer cambio
 * de tarifa y nadie se entera.
 *
 * Tampoco se declara `aggregateRating`: inventar reseñas que no existen es
 * exactamente el caso que la documentación de Google marca como penalizable, y
 * los testimonios de la landing no son reseñas verificables.
 */
export function LandingJsonLd({ plans }: { plans: Plan[] }) {
  const dePago = plans
    .map((p) => Number(p.price))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const hayGratis = plans.some((p) => Number(p.price) === 0);

  const aplicacion = {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: "Ventex",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Point of Sale",
    operatingSystem: "Web, iOS, Android",
    url: SITE_URL,
    inLanguage: "es",
    description:
      "Sistema POS con punto de venta, inventario, facturación, clientes y finanzas para tiendas, salones, lava-autos y servicios profesionales.",
    featureList: [
      "Punto de venta con lectura de códigos de barras",
      "Inventario con alertas de stock bajo",
      "Facturación y comprobantes de venta",
      "Control de ingresos, gastos y beneficio neto",
      "Clientes, créditos y seguimiento",
      "Turnos de caja y arqueo",
      "Citas y agenda",
      "Comisiones por empleado",
    ],
    // `offers` solo si hay precios de verdad: un catálogo vacío marcado como
    // oferta es marcado inválido, no una oferta gratis.
    ...(dePago.length > 0
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "COP",
            // El mínimo es 0 cuando existe plan gratuito: es el precio real de
            // entrada y es lo que el usuario ve en la página.
            lowPrice: hayGratis ? 0 : dePago[0],
            highPrice: dePago[dePago.length - 1],
            offerCount: plans.length,
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };

  const organizacion = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organizacion`,
    name: "Ventex",
    url: SITE_URL,
    logo: absoluteUrl("/assets/vertex-h.svg"),
    description:
      "Plataforma de gestión de negocios: punto de venta, inventario, facturación y finanzas.",
  };

  const sitio = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#sitio`,
    url: SITE_URL,
    name: "Ventex",
    inLanguage: "es",
    publisher: { "@id": `${SITE_URL}/#organizacion` },
  };

  // Un solo bloque con @graph en vez de tres <script> sueltos: así las
  // entidades se referencian entre sí por @id y Google las lee como un mismo
  // grafo, no como tres afirmaciones inconexas sobre cosas distintas.
  const grafo = {
    "@context": "https://schema.org",
    "@graph": [aplicacion, organizacion, sitio],
  };

  return (
    <script
      type="application/ld+json"
      // El contenido es nuestro y se serializa con JSON.stringify, que escapa
      // comillas; se cortan los `<` por si alguna descripción de plan trajera
      // un `</script>` desde la base.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(grafo).replace(/</g, "\\u003c"),
      }}
    />
  );
}

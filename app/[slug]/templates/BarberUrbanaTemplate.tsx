import Image from "next/image";
import { Roboto, Roboto_Condensed } from "next/font/google";
import { Scissors, ArrowUpRight, MapPin, Phone } from "lucide-react";
import type { PublicSite } from "@/services/public-site.types";
import { WEEKDAY_LABELS, textoDelSitio } from "@/services/public-site.types";
import { socialLinksOf } from "@/lib/socialLinks";
import { BrandIcon } from "@/app/assets/icons/BrandIcons";
import { BookServiceLink } from "../BookServiceLink";
import { BookingWidget } from "../BookingWidget";
import { BusinessStatus } from "./BusinessStatus";
import { ContactSection, ProductsSection, SiteFooter } from "./SiteSections";
import { formatCOP, whatsappHref, SITE_PALETTES } from "./theme";
import styles from "./BarberUrbanaTemplate.module.css";

/**
 * Tercera plantilla de barbería: verde, condensada y directa.
 *
 * Lo que la separa de sus dos hermanas no es la paleta: es que el teléfono y la
 * dirección van ARRIBA DE TODO, antes que cualquier foto. Quien busca una
 * barbería de barrio quiere saber dónde queda y a qué número escribir; la
 * editorial y la artesanal abren con una imagen a sangre porque venden otra
 * cosa.
 *
 * Las fuentes se cargan acá adentro con `next/font/google`, así su CSS viaja
 * solo en las páginas que rendericen esta plantilla.
 */

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-roboto",
});

const condensada = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-roboto-condensed",
});

const iniciales = (nombre: string) =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();

export function BarberUrbanaTemplate({ site }: { site: PublicSite }) {
  const redes = socialLinksOf(site);
  const hayContacto = Boolean(site.address || site.whatsapp || redes.length);
  const heroDeMuestra = !site.heroImageUrl;
  const heroSrc = site.heroImageUrl || "/sites/moderno/barber-hero.webp";
  const hoy = new Date().getDay();

  return (
    <div
      className={`${styles.site} ${roboto.variable} ${condensada.variable} site-public`}
      style={SITE_PALETTES["barberia-urbana"]}
      data-template="barberia-urbana"
    >
      {(hayContacto || redes.length > 0) && (
        <div className={styles.topbar}>
          <div className={styles.topbarInner}>
            {site.whatsapp && (
              <a href={whatsappHref(site.whatsapp, `Hola ${site.businessName}, quiero pedir un turno.`)} target="_blank" rel="noreferrer">
                <Phone size={13} aria-hidden="true" />
                {site.whatsapp}
              </a>
            )}
            {site.address && (
              <span>
                <MapPin size={13} aria-hidden="true" />
                {site.address}
              </span>
            )}
            {redes.length > 0 && (
              <div className={styles.topbarSocial}>
                {redes.map((red) => (
                  <a key={red.network} href={red.href} target="_blank" rel="noreferrer" aria-label={red.label}>
                    <BrandIcon name={red.network} className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#inicio">
            {site.logoUrl ? (
              <Image src={site.logoUrl} alt="" width={38} height={38} />
            ) : (
              <Scissors size={24} strokeWidth={1.6} aria-hidden="true" />
            )}
            <span>{site.businessName}</span>
          </a>
          <nav className={styles.navLinks} aria-label="Principal">
            {site.services.length > 0 && <a href="#servicios">Servicios</a>}
            {site.services.length > 0 && <a href="#precios">Precios</a>}
            {site.about && <a href="#nosotros">La barbería</a>}
            {site.staff.length > 0 && <a href="#equipo">Barberos</a>}
            {(site.hours.length > 0 || hayContacto) && <a href="#horarios">Horarios</a>}
          </nav>
          {site.bookingEnabled && (
            <a href="#reservar" className={styles.navCta}>
              Pedir turno <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      <section id="inicio" className={styles.hero}>
        <Image src={heroSrc} alt="" fill priority sizes="100vw" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={styles.heroBody}>
          <h1 className={styles.heroTitle}>{site.headline || site.businessName}</h1>
          <p className={styles.heroKicker}>
            {site.headline ? site.businessName : textoDelSitio(site, "heroKicker")}
          </p>
          <div className={styles.heroActions}>
            {site.bookingEnabled && (
              <a href="#reservar" className={styles.primary}>
                Pedir turno <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
            {site.services.length > 0 && (
              <a href="#precios" className={styles.secondary}>
                Ver precios
              </a>
            )}
          </div>
          {site.hours.length > 0 && (
            <div className={styles.heroStatus}>
              <BusinessStatus site={site} />
            </div>
          )}
        </div>
        {heroDeMuestra && <span className={styles.sample}>Imagen de referencia</span>}
      </section>

      {site.services.length > 0 && (
        <section id="servicios" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{textoDelSitio(site, "servicesTitle")}</h2>
            <p>{textoDelSitio(site, "servicesSubtitle")}</p>
          </div>
          <ul className={styles.serviceGrid}>
            {site.services.map((servicio) => (
              <li key={servicio.id} className={styles.serviceCard}>
                <h3>{servicio.name}</h3>
                {servicio.description && <p>{servicio.description}</p>}
                <div className={styles.serviceFoot}>
                  <strong>{formatCOP(servicio.price)}</strong>
                  <span className={styles.duration}>{servicio.durationMinutes} min</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {site.services.length > 0 && (
        <section id="precios" className={styles.band}>
          <div className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{textoDelSitio(site, "pricesTitle")}</h2>
            <p>{textoDelSitio(site, "pricesSubtitle")}</p>
          </div>
          <ul className={styles.priceList}>
            {site.services.map((servicio) => (
              <li key={servicio.id} className={styles.priceRow}>
                <h3>{servicio.name}</h3>
                <span className={styles.priceLeader} aria-hidden="true" />
                <strong>{formatCOP(servicio.price)}</strong>
                {site.bookingEnabled && (
                  <BookServiceLink serviceId={servicio.id} className={styles.priceLink}>
                    Pedir
                  </BookServiceLink>
                )}
              </li>
            ))}
            </ul>
          </div>
        </section>
      )}

      {site.about && (
        <section id="nosotros" className={styles.section}>
          <div className={styles.about}>
            <div className={styles.aboutImage}>
              <Image
                src={site.heroImageUrl || "/sites/moderno/barber-detail.webp"}
                alt={site.heroImageUrl ? site.businessName : "Detalle ilustrativo de herramientas de barbería"}
                fill
                sizes="(max-width: 1000px) 100vw, 50vw"
              />
            </div>
            <div className={styles.aboutCopy}>
              <div className={styles.sectionHead}>
                <h2>{textoDelSitio(site, "aboutTitle")}</h2>
              </div>
              <p>{site.about}</p>
            </div>
          </div>
        </section>
      )}

      {site.staff.length > 0 && (
        <section id="equipo" className={styles.band}>
          <div className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{textoDelSitio(site, "teamTitle")}</h2>
            <p>{textoDelSitio(site, "teamSubtitle")}</p>
          </div>
          <ul className={styles.teamGrid}>
            {site.staff.map((persona) => (
              <li key={persona.id} className={styles.teamCard}>
                {/* La foto la sube el dueño en /dashboard/staff. Sin foto quedan
                    las iniciales, que son el diseño y no un hueco. */}
                <div className={styles.teamAvatar} aria-hidden="true">
                  {persona.photoUrl ? (
                    <Image
                      src={persona.photoUrl}
                      alt=""
                      fill
                      sizes="(max-width: 760px) 50vw, 240px"
                      className={styles.teamPhoto}
                    />
                  ) : (
                    <span>{iniciales(persona.fullName)}</span>
                  )}
                </div>
                <h3>{persona.fullName}</h3>
                {persona.role && <p>{persona.role}</p>}
              </li>
            ))}
            </ul>
          </div>
        </section>
      )}

      {site.products.length > 0 && (
        <div className={styles.products}>
          <ProductsSection site={site} variant="minimal" />
        </div>
      )}

      {site.bookingEnabled && (
        <section id="reservar" className={styles.section}>
          <div className={styles.bookingBanner}>
            <h2>{textoDelSitio(site, "bookingTitle")}</h2>
            <p>{textoDelSitio(site, "bookingSubtitle")}</p>
          </div>
          <div className={styles.widget}>
            <BookingWidget site={site} />
          </div>
          <p className={styles.bookingNote}>
            Tu solicitud queda pendiente de confirmación por el negocio
          </p>
        </section>
      )}

      {(site.hours.length > 0 || hayContacto) && (
        <section id="horarios" className={styles.band}>
          <div className={`${styles.section} ${styles.visit}`}>
            {site.hours.length > 0 && (
              <div className={styles.hours}>
                <div className={styles.sectionHead}>
                  <h2>Horarios</h2>
                </div>
                <ul>
                  {site.hours.map((hora) => (
                    // El día de hoy se marca: en una barbería de barrio la
                    // pregunta casi siempre es "¿están abiertos AHORA?".
                    <li key={hora.weekday} className={hora.weekday === hoy ? styles.hoy : undefined}>
                      <span>{WEEKDAY_LABELS[hora.weekday]}</span>
                      <span>{hora.isOpen ? `${hora.opensAt} – ${hora.closesAt}` : "Cerrado"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hayContacto && <ContactSection site={site} variant="minimal" />}
          </div>
        </section>
      )}

      <SiteFooter site={site} />

      {site.bookingEnabled && (
        <a href="#reservar" className={styles.mobileBooking}>
          Pedir mi turno <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

import Image from "next/image";
import { Lora, Homemade_Apple } from "next/font/google";
import { Scissors, ArrowUpRight } from "lucide-react";
import type { PublicSite } from "@/services/public-site.types";
import { WEEKDAY_LABELS } from "@/services/public-site.types";
import { socialLinksOf } from "@/lib/socialLinks";
import { BookServiceLink } from "../BookServiceLink";
import { BookingWidget } from "../BookingWidget";
import { BusinessStatus } from "./BusinessStatus";
import { ContactSection, ProductsSection, SiteFooter } from "./SiteSections";
import { formatCOP, SITE_PALETTES } from "./theme";
import styles from "./BarberArtesanalTemplate.module.css";

/**
 * Segunda plantilla de barbería: clara, cálida y manuscrita.
 *
 * No es una variante de color de `BarberModernTemplate`. Aquella es oscura,
 * dorada y editorial; esta es de papel, con cobre, titulares a mano y los
 * servicios en círculos. Comparten los datos y nada más, y por eso son dos
 * componentes en vez de un `variant`: un condicional por cada decisión visual
 * termina siendo ilegible mucho antes de quedar completo.
 *
 * Las fuentes se cargan con `next/font/google` DENTRO de este archivo, así su
 * CSS viaja solo en las páginas que rendericen esta plantilla. Declararlas en el
 * layout raíz las habría mandado también al panel y a la landing, que no las
 * usan.
 */

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-lora",
});

/**
 * Homemade Apple no tiene bold ni versalitas y solo trae un peso. Es
 * exactamente por eso que se usa como GESTO —titular del hero, nombre del
 * servicio, firma— y nunca para texto corrido.
 */
const manuscrita = Homemade_Apple({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-manuscrita",
});

/** Iniciales del nombre, como en la plantilla hermana: no tenemos fotos del equipo. */
const iniciales = (nombre: string) =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();

export function BarberArtesanalTemplate({ site }: { site: PublicSite }) {
  const hayContacto = Boolean(site.address || site.whatsapp || socialLinksOf(site).length);
  const heroDeMuestra = !site.heroImageUrl;
  const heroSrc = site.heroImageUrl || "/sites/moderno/barber-hero.webp";

  return (
    <div
      className={`${styles.site} ${lora.variable} ${manuscrita.variable} site-public`}
      style={SITE_PALETTES["barberia-artesanal"]}
      data-template="barberia-artesanal"
    >
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#inicio">
            {site.logoUrl ? (
              <Image src={site.logoUrl} alt="" width={36} height={36} />
            ) : (
              <Scissors size={22} strokeWidth={1.4} aria-hidden="true" />
            )}
            <span>{site.businessName}</span>
          </a>
          <nav className={styles.navLinks} aria-label="Principal">
            {site.services.length > 0 && <a href="#servicios">Servicios</a>}
            {site.about && <a href="#nosotros">Nosotros</a>}
            {site.services.length > 0 && <a href="#precios">Precios</a>}
            {site.staff.length > 0 && <a href="#equipo">Equipo</a>}
            {(site.hours.length > 0 || hayContacto) && <a href="#horarios">Visitanos</a>}
          </nav>
          {site.bookingEnabled && (
            <a href="#reservar" className={styles.navCta}>
              Reservar cita <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      <section id="inicio" className={styles.hero}>
        <Image src={heroSrc} alt="" fill priority sizes="100vw" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={styles.heroBody}>
          <h1 className={`${styles.manuscrita} ${styles.heroTitle}`}>
            {site.headline || site.businessName}
          </h1>
          <p className={styles.heroKicker}>
            {site.headline ? site.businessName : "Cortes · Barba · Cuidado"}
          </p>
          <div className={styles.heroActions}>
            {site.bookingEnabled && (
              <a href="#reservar" className={styles.primary}>
                Reservar cita <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
            {site.services.length > 0 && (
              <a href="#servicios" className={styles.secondary}>
                Ver servicios
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
            <h2>Nuestros servicios</h2>
            <p>Cada visita, con el tiempo que merece.</p>
          </div>
          {/*
            * Los círculos son la firma visual de esta plantilla. Llevan el
            * nombre y el precio y nada más: el detalle largo vive en la lista
            * de precios de abajo, porque un párrafo curvado dentro de un
            * círculo no se lee.
            */}
          <ul className={styles.circles}>
            {site.services.map((servicio) => {
              const contenido = (
                <>
                  <span className={styles.circleName}>{servicio.name}</span>
                  <span className={styles.circlePrice}>Desde {formatCOP(servicio.price)}</span>
                  <span className={styles.circleMeta}>{servicio.durationMinutes} min</span>
                </>
              );
              return (
                <li key={servicio.id} className={styles.circleWrap}>
                  {site.bookingEnabled ? (
                    <BookServiceLink serviceId={servicio.id} className={styles.circle}>
                      {contenido}
                    </BookServiceLink>
                  ) : (
                    <div className={styles.circle}>{contenido}</div>
                  )}
                </li>
              );
            })}
            {site.bookingEnabled && (
              <li className={styles.circleWrap}>
                <a href="#reservar" className={`${styles.circle} ${styles.circleCta}`}>
                  <span className={styles.circleName}>Reservá tu cita</span>
                  <span className={styles.circleMeta}>Agenda online</span>
                </a>
              </li>
            )}
          </ul>
        </section>
      )}

      {site.about && (
        <section id="nosotros" className={`${styles.about} ${styles.divider}`}>
          <div className={styles.aboutImage}>
            <Image
              src={site.heroImageUrl || "/sites/moderno/barber-detail.webp"}
              alt={site.heroImageUrl ? site.businessName : "Detalle ilustrativo de herramientas de barbería"}
              fill
              sizes="(max-width: 1000px) 100vw, 50vw"
            />
          </div>
          <div className={styles.aboutCopy}>
            <h2>Sobre nosotros</h2>
            <p>{site.about}</p>
            <span className={styles.firma}>{site.businessName}</span>
          </div>
        </section>
      )}

      {site.services.length > 0 && (
        <section id="precios" className={`${styles.section} ${styles.divider}`}>
          <div className={styles.sectionHead}>
            <h2>Precios</h2>
            <p>Sin sorpresas al final.</p>
          </div>
          <ul className={styles.priceList}>
            {site.services.map((servicio) => (
              <li key={servicio.id} className={styles.priceRow}>
                <h3>{servicio.name}</h3>
                <span className={styles.priceLeader} aria-hidden="true" />
                <strong>{formatCOP(servicio.price)}</strong>
                <div className={styles.priceMeta}>
                  <span>{servicio.durationMinutes} minutos</span>
                  {site.bookingEnabled && (
                    <BookServiceLink serviceId={servicio.id} className={styles.priceLink}>
                      Reservar
                    </BookServiceLink>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {site.staff.length > 0 && (
        <section id="equipo" className={`${styles.section} ${styles.divider}`}>
          <div className={styles.sectionHead}>
            <h2>El equipo</h2>
            <p>Quienes te reciben.</p>
          </div>
          <ul className={styles.teamGrid}>
            {site.staff.map((persona) => (
              <li key={persona.id} className={styles.teamCard}>
                <div className={styles.teamAvatar} aria-hidden="true">
                  <Scissors size={22} strokeWidth={1.2} />
                  <span>{iniciales(persona.fullName)}</span>
                </div>
                <h3>{persona.fullName}</h3>
                {persona.role && <p>{persona.role}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {site.products.length > 0 && (
        <div className={styles.products}>
          <ProductsSection site={site} variant="clasico" />
        </div>
      )}

      {site.bookingEnabled && (
        <section id="reservar" className={styles.booking}>
          <Image
            src={heroSrc}
            alt=""
            fill
            sizes="100vw"
            className={styles.bookingImage}
          />
          <div className={styles.bookingShade} />
          <div className={styles.bookingHead}>
            <p className={styles.manuscrita}>Reservá tu cita</p>
            <p>Elegí el servicio, el profesional y el horario que mejor te venga.</p>
            <p className={styles.bookingNote}>
              Tu solicitud queda pendiente de confirmación por el negocio
            </p>
          </div>
          <div className={styles.widget}>
            <BookingWidget site={site} />
          </div>
        </section>
      )}

      {(site.hours.length > 0 || hayContacto) && (
        <div className={styles.visit}>
          {site.hours.length > 0 && (
            <section id="horarios" className={styles.hours}>
              <h2>Horarios</h2>
              <ul>
                {site.hours.map((hora) => (
                  <li key={hora.weekday}>
                    <span>{WEEKDAY_LABELS[hora.weekday]}</span>
                    <span>{hora.isOpen ? `${hora.opensAt} – ${hora.closesAt}` : "Cerrado"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <ContactSection site={site} variant="clasico" />
        </div>
      )}

      <SiteFooter site={site} />

      {site.bookingEnabled && (
        <a href="#reservar" className={styles.mobileBooking}>
          Reservar mi cita <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

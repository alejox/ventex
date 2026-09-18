import Image from "next/image";
import { Scissors, ArrowUpRight, MapPin } from "lucide-react";
import type { PublicSite } from "@/services/public-site.types";
import { WEEKDAY_LABELS } from "@/services/public-site.types";
import { socialLinksOf } from "@/lib/socialLinks";
import { BookServiceLink } from "../BookServiceLink";
import { BookingWidget } from "../BookingWidget";
import { BusinessStatus } from "./BusinessStatus";
import { ContactSection, ProductsSection, SiteFooter } from "./SiteSections";
import { formatCOP, SITE_PALETTES } from "./theme";
import styles from "./BarberModernTemplate.module.css";

/** Editorial barber presentation; all catalog and booking data remain tenant-owned. */
export function BarberModernTemplate({ site }: { site: PublicSite }) {
  const hasContact = Boolean(site.address || site.whatsapp || socialLinksOf(site).length);
  const sampleHero = !site.heroImageUrl;

  return (
    <div className={`${styles.site} site-public`} style={SITE_PALETTES.barberia} data-template="barberia">
      <header id="inicio" className={styles.hero}>
        <Image src={site.heroImageUrl || "/sites/moderno/barber-hero.webp"} alt="" fill priority sizes="100vw" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={styles.headerContent}>
          {(site.address || site.hours.length > 0) && <div className={styles.topbar}>
            {site.address ? <span><MapPin size={12} aria-hidden="true" />{site.address}</span> : <span>Un espacio para tu estilo</span>}
            <BusinessStatus site={site} />
          </div>}
          <nav className={styles.nav} aria-label="Principal">
            <a className={styles.brand} href="#inicio">
              {site.logoUrl ? <Image src={site.logoUrl} alt="" width={42} height={42} className={styles.logo} /> : <Scissors size={30} strokeWidth={1.3} aria-hidden="true" />}
              <span>{site.businessName}</span>
            </a>
            <div className={styles.navLinks}>
              {site.services.length > 0 && <a href="#servicios">Servicios</a>}
              {site.about && <a href="#nosotros">Nosotros</a>}
              {site.staff.length > 0 && <a href="#equipo">El equipo</a>}
              {hasContact && <a href="#contacto">Contacto</a>}
            </div>
            {site.bookingEnabled && <a href="#reservar" className={styles.navCta}>Reservar cita <ArrowUpRight size={15} aria-hidden="true" /></a>}
          </nav>
          <div className={styles.heroBody}>
            <p className={styles.eyebrow}><span />El arte del buen estilo</p>
            <h1>{site.headline || site.businessName}</h1>
            <p className={styles.heroIntro}>{site.headline ? site.businessName : "Un espacio para tu estilo. Un momento para ti."}</p>
            <div className={styles.actions}>
              {site.bookingEnabled && <a href="#reservar" className={styles.primary}>Reserva tu cita <ArrowUpRight size={18} aria-hidden="true" /></a>}
              {site.services.length > 0 && <a href="#servicios" className={styles.secondary}>Nuestros servicios</a>}
            </div>
          </div>
          <div className={styles.heroFoot}>
            <span>Estilo propio. Atención a tu medida.</span>
            {sampleHero && <span className={styles.sample}>Imagen de referencia</span>}
            {site.services.length > 0 && <a href="#servicios" aria-label="Descubrir servicios">Descubre más <span aria-hidden="true">↓</span></a>}
          </div>
        </div>
      </header>

      {site.services.length > 0 && <section id="servicios" className={`${styles.section} ${styles.services}`}>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Nuestro oficio</p><h2>Tu estilo, en buenas manos.</h2></div>
          <a href="#precios" className={styles.textLink}>Ver todos los precios <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
        <ul className={styles.serviceGrid}>
          {site.services.map((service, index) => <li key={service.id} className={styles.serviceCard}>
            <div className={styles.serviceTop}><Scissors size={30} strokeWidth={1} aria-hidden="true" /><span>{String(index + 1).padStart(2, "0")}</span></div>
            <h3>{service.name}</h3>
            {service.description && <p>{service.description}</p>}
            <span className={styles.duration}>{service.durationMinutes} minutos</span>
            <div className={styles.serviceBottom}><strong>{formatCOP(service.price)}</strong>{site.bookingEnabled && <BookServiceLink serviceId={service.id} className={styles.textLink}>Reservar <ArrowUpRight size={15} aria-hidden="true" /></BookServiceLink>}</div>
          </li>)}
        </ul>
      </section>}

      {site.about && <section id="nosotros" className={styles.about}>
        <div className={styles.aboutImage}>
          <Image src={site.heroImageUrl || "/sites/moderno/barber-detail.webp"} alt={site.heroImageUrl ? site.businessName : "Detalle ilustrativo de herramientas de barbería"} fill sizes="(max-width: 760px) 100vw, 50vw" className={styles.detailImage} />
          {!site.heroImageUrl && <span className={styles.imageCaption}>Imagen de referencia</span>}
        </div>
        <div className={styles.aboutCopy}>
          <p className={styles.eyebrow}>Más que un corte</p><h2>Los detalles<br /><em>hablan por ti.</em></h2>
          <p className={styles.bodyCopy}>{site.about}</p>
          <span className={styles.signature}>{site.businessName}</span>
          {site.bookingEnabled && <a href="#reservar" className={styles.textLink}>Encuentra tu próximo horario <ArrowUpRight size={16} aria-hidden="true" /></a>}
        </div>
      </section>}

      {site.services.length > 0 && <section id="precios" className={`${styles.section} ${styles.pricing}`}>
        <div className={styles.pricingIntro}><p className={styles.eyebrow}>Sin sorpresas</p><h2>Buen estilo.<br /><em>Precios claros.</em></h2><p className={styles.bodyCopy}>Elige tu servicio y dedica un momento a cuidarte.</p>{site.bookingEnabled && <a href="#reservar" className={styles.primary}>Agenda tu visita <ArrowUpRight size={18} aria-hidden="true" /></a>}</div>
        <ul className={styles.priceList}>{site.services.map((service) => <li key={service.id}>
          <div className={styles.priceName}><h3>{service.name}</h3><span /><strong>{formatCOP(service.price)}</strong></div>
          <div className={styles.priceMeta}><span>{service.durationMinutes} minutos</span>{site.bookingEnabled && <BookServiceLink serviceId={service.id} className={styles.textLink}>Reservar <ArrowUpRight size={14} aria-hidden="true" /></BookServiceLink>}</div>
        </li>)}</ul>
      </section>}

      {site.staff.length > 0 && <section id="equipo" className={`${styles.section} ${styles.team}`}>
        <p className={styles.eyebrow}>Personas detrás del oficio</p><h2>Conoce a tu equipo.</h2>
        <ul className={styles.teamGrid}>{site.staff.map((member) => <li key={member.id}>
          <div className={styles.monogram} aria-hidden="true"><Scissors size={25} strokeWidth={1} /><span>{member.fullName.trim().split(/\s+/).slice(0, 2).map((name) => name[0]).join("")}</span><span className={styles.monogramRule} /></div>
          <h3>{member.fullName}</h3>{member.role && <p>{member.role}</p>}
        </li>)}</ul>
      </section>}

      {site.products.length > 0 && <div className={styles.products}><ProductsSection site={site} variant="clasico" /></div>}

      {site.bookingEnabled && <section id="reservar" className={`${styles.section} ${styles.booking}`}>
        <div><p className={styles.eyebrow}>Agenda online</p><h2>Tu próximo<br /><em>buen momento.</em></h2><p className={styles.bodyCopy}>Elige el servicio, el profesional y el horario que mejor te venga.</p><p className={styles.bookingNote}>Tu solicitud queda pendiente de confirmación por el negocio.</p></div>
        <div className={styles.widget}><BookingWidget site={site} /></div>
      </section>}

      {(site.hours.length > 0 || hasContact) && <div className={styles.visit}>
        {site.hours.length > 0 && <section id="horarios" className={styles.hours}><p className={styles.eyebrow}>Te esperamos</p><h2>Haznos una visita.</h2><ul>{site.hours.map((hour) => <li key={hour.weekday}><span>{WEEKDAY_LABELS[hour.weekday]}</span><span>{hour.isOpen ? `${hour.opensAt} – ${hour.closesAt}` : "Cerrado"}</span></li>)}</ul></section>}
        {hasContact && <ContactSection site={site} variant="moderno" />}
      </div>}
      <SiteFooter site={site} />
      {site.bookingEnabled && <a href="#reservar" className={styles.mobileBooking}>Reservar mi cita <ArrowUpRight size={18} aria-hidden="true" /></a>}
    </div>
  );
}

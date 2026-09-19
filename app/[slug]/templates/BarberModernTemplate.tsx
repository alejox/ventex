import Image from "next/image";
import { ArrowUpRight, MapPin, Scissors } from "lucide-react";
import type { PublicSite } from "@/services/public-site.types";
import { DEFAULT_SITE_IMAGES } from "@/services/public-site.types";
import { BusinessStatus } from "./BusinessStatus";
import { ConfigurableSections, SiteFooter } from "./SiteSections";
import { paletteFor } from "./theme";
import baseStyles from "./templates.module.css";
import styles from "./BarberModernTemplate.module.css";

export function BarberModernTemplate({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  const hero = site.config.hero;
  return (
    <div className={`${styles.site} ${baseStyles.template} site-public`} style={paletteFor(site.config)} data-template="barberia">
      <header id="inicio" className={styles.hero}>
        <Image src={hero.imageUrl ?? DEFAULT_SITE_IMAGES.barberia} alt="" fill preload={!preview} sizes="100vw" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={styles.headerContent}>
          <div className={styles.topbar}>{site.address ? <span><MapPin size={12} aria-hidden="true" />{site.address}</span> : <span>Un espacio para tu estilo</span>}<BusinessStatus site={site} /></div>
          <nav className={styles.nav} aria-label="Principal">
            <a className={styles.brand} href="#inicio">{site.logoUrl ? <Image src={site.logoUrl} alt="" width={42} height={42} className={styles.logo} /> : <Scissors size={30} strokeWidth={1.3} aria-hidden="true" />}<span>{site.businessName}</span></a>
            <div className={styles.navLinks}><a href="#servicios">Servicios</a><a href="#equipo">Equipo</a><a href="#contacto">Contacto</a></div>
            {site.bookingEnabled ? <a href="#reservar" className={styles.navCta}>Reservar cita <ArrowUpRight size={15} aria-hidden="true" /></a> : null}
          </nav>
          <div className={styles.heroBody}>
            <p className={styles.eyebrow}><span />{hero.eyebrow}</p>
            <h1>{hero.title ?? site.businessName}</h1>
            {hero.description ? <p className={styles.heroIntro}>{hero.description}</p> : null}
            <div className={styles.actions}>{site.bookingEnabled ? <a href="#reservar" className={styles.primary}>Reservá tu cita <ArrowUpRight size={18} aria-hidden="true" /></a> : null}<a href="#servicios" className={styles.secondary}>Nuestros servicios</a></div>
          </div>
          <div className={styles.heroFoot}><span>Estilo propio. Atención a tu medida.</span>{!hero.imageUrl ? <span className={styles.sample}>Imagen de referencia</span> : null}<a href="#servicios">Descubrí más <span aria-hidden="true">↓</span></a></div>
        </div>
      </header>
      <ConfigurableSections site={site} preview={preview} />
      <SiteFooter site={site} />
    </div>
  );
}

import Image from "next/image";
import { ArrowUpRight, MapPin, Phone, Scissors } from "lucide-react";
import type { PublicSite } from "@/services/public-site.types";
import { DEFAULT_SITE_IMAGES } from "@/services/public-site.types";
import { BusinessStatus } from "./BusinessStatus";
import { ConfigurableSections, SiteFooter } from "./SiteSections";
import { paletteFor, whatsappHref } from "./theme";
import baseStyles from "./templates.module.css";
import styles from "./BarberUrbanaTemplate.module.css";

export function BarberUrbanaTemplate({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  const hero = site.config.hero;
  return (
    <div className={`${styles.site} ${baseStyles.template} site-public`} style={paletteFor(site.config)} data-template="barberia-urbana">
      {site.whatsapp || site.address ? <div className={styles.topbar}><div className={styles.topbarInner}>{site.whatsapp ? <a href={whatsappHref(site.whatsapp, `Hola ${site.businessName}, quiero pedir un turno.`)} target="_blank" rel="noreferrer"><Phone size={13} aria-hidden="true" />{site.whatsapp}</a> : null}{site.address ? <span><MapPin size={13} aria-hidden="true" />{site.address}</span> : null}</div></div> : null}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#inicio">{site.logoUrl ? <Image src={site.logoUrl} alt="" width={38} height={38} /> : <Scissors size={24} aria-hidden="true" />}<span>{site.businessName}</span></a>
          <nav className={styles.navLinks} aria-label="Principal"><a href="#servicios">Servicios</a><a href="#equipo">Equipo</a><a href="#contacto">Contacto</a></nav>
          {site.bookingEnabled ? <a className={styles.navCta} href="#reservar">Reservar <ArrowUpRight size={14} aria-hidden="true" /></a> : null}
        </div>
      </header>
      <section id="inicio" className={styles.hero}>
        <Image src={hero.imageUrl ?? DEFAULT_SITE_IMAGES["barberia-urbana"]} alt="" fill preload={!preview} sizes="100vw" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={styles.heroBody}>
          <h1 className={styles.heroTitle}>{hero.title ?? site.businessName}</h1>
          <p className={styles.heroKicker}>{hero.eyebrow}</p>
          {hero.description ? <p className="mt-5 max-w-2xl text-sm leading-7 text-[#cfd8d2]">{hero.description}</p> : null}
          <div className={styles.heroActions}>{site.bookingEnabled ? <a className={styles.primary} href="#reservar">Reservá ahora <ArrowUpRight size={16} aria-hidden="true" /></a> : null}<a className={styles.secondary} href="#servicios">Ver servicios</a></div>
          <div className={styles.heroStatus}><BusinessStatus site={site} /></div>
        </div>
        {!hero.imageUrl ? <span className={styles.sample}>Imagen de referencia</span> : null}
      </section>
      <ConfigurableSections site={site} preview={preview} />
      <SiteFooter site={site} />
    </div>
  );
}

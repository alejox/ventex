import Image from "next/image";
import { ArrowUpRight, Scissors } from "lucide-react";
import type { PublicSite } from "@/services/public-site.types";
import { DEFAULT_SITE_IMAGES } from "@/services/public-site.types";
import { BusinessStatus } from "./BusinessStatus";
import { ConfigurableSections, SiteFooter } from "./SiteSections";
import { paletteFor } from "./theme";
import baseStyles from "./templates.module.css";
import styles from "./BarberArtesanalTemplate.module.css";

export function BarberArtesanalTemplate({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  const hero = site.config.hero;
  return (
    <div className={`${styles.site} ${baseStyles.template} site-public`} style={paletteFor(site.config)} data-template="barberia-artesanal">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#inicio">{site.logoUrl ? <Image src={site.logoUrl} alt="" width={36} height={36} /> : <Scissors size={22} strokeWidth={1.4} aria-hidden="true" />}<span>{site.businessName}</span></a>
          <nav className={styles.navLinks} aria-label="Principal"><a href="#servicios">Servicios</a><a href="#equipo">Equipo</a><a href="#contacto">Contacto</a></nav>
          {site.bookingEnabled ? <a className={styles.navCta} href="#reservar">Reservar <ArrowUpRight size={14} aria-hidden="true" /></a> : null}
        </div>
      </header>
      <section id="inicio" className={styles.hero}>
        <Image src={hero.imageUrl ?? DEFAULT_SITE_IMAGES["barberia-artesanal"]} alt="" fill preload={!preview} sizes="100vw" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={styles.heroBody}>
          <h1 className={`${styles.heroTitle} ${styles.manuscrita}`}>{hero.title ?? site.businessName}</h1>
          <p className={styles.heroKicker}>{hero.eyebrow}</p>
          {hero.description ? <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#ecd9cd]">{hero.description}</p> : null}
          <div className={styles.heroActions}>{site.bookingEnabled ? <a className={styles.primary} href="#reservar">Reservá tu turno <ArrowUpRight size={16} aria-hidden="true" /></a> : null}<a className={styles.secondary} href="#servicios">Ver servicios</a></div>
          <div className={styles.heroStatus}><BusinessStatus site={site} /></div>
        </div>
        {!hero.imageUrl ? <span className={styles.sample}>Imagen de referencia</span> : null}
      </section>
      <ConfigurableSections site={site} preview={preview} />
      <SiteFooter site={site} />
    </div>
  );
}

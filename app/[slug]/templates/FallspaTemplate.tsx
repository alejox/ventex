import Image from "next/image";
import type { PublicSite } from "@/services/public-site.types";
import { DEFAULT_SITE_IMAGES } from "@/services/public-site.types";
import { BusinessStatus } from "./BusinessStatus";
import { ConfigurableSections, SiteFooter } from "./SiteSections";
import { paletteFor } from "./theme";
import styles from "./templates.module.css";

export function FallspaTemplate({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  const hero = site.config.hero;
  return (
    <div style={paletteFor(site.config)} className={`site-public min-h-screen scroll-smooth ${styles.template} ${styles.fallspa}`}>
      <header id="inicio" className={styles.fallspaHeader}>
        <nav aria-label="Principal" className={styles.nav}>
          <a href="#inicio" className={styles.brand}>{site.logoUrl ? <Image src={site.logoUrl} alt="" width={48} height={48} className={styles.logo} /> : <span className={styles.brandMark}>❀</span>}<span>{site.businessName}</span></a>
          <div className={styles.navLinks}><a href="#servicios">Servicios</a><a href="#productos">Productos</a><a href="#contacto">Contacto</a>{site.bookingEnabled ? <a href="#reservar" className={styles.navCta}>Reservar cita</a> : null}</div>
        </nav>
        <div className={styles.fallspaHero}>
          <div className={styles.fallspaHeroInner}>
          <div className={`${styles.heroCopy} site-enter`}>
            <span className={styles.eyebrow}>{hero.eyebrow}</span>
            <h1 className={styles.heroTitle}>{hero.title ?? site.businessName}</h1>
            {hero.description ? <p className={styles.heroDescription}>{hero.description}</p> : null}
            <BusinessStatus site={site} className="mt-5 text-[var(--site-muted)]" />
            <div className={styles.heroActions}><a href="#servicios" className={`${styles.heroCta} site-action`}>Descubrir más</a>{site.bookingEnabled ? <a href="#reservar" className={`${styles.heroCta} site-action`}>Reservar ahora</a> : null}</div>
          </div>
          <div className={`${styles.heroImage} site-enter site-enter-delay-2`}>
            <Image src={hero.imageUrl ?? DEFAULT_SITE_IMAGES.fallspa} alt="" fill preload={!preview} sizes="(max-width: 1024px) 100vw, 50vw" />
          </div>
          </div>
        </div>
      </header>
      <ConfigurableSections site={site} preview={preview} />
      <SiteFooter site={site} />
    </div>
  );
}

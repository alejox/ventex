import Image from "next/image";
import type { PublicSite } from "@/services/public-site.types";
import { DEFAULT_SITE_IMAGES } from "@/services/public-site.types";
import { BusinessStatus } from "./BusinessStatus";
import { ConfigurableSections, SiteFooter } from "./SiteSections";
import { paletteFor } from "./theme";
import styles from "./templates.module.css";

export function RasmTemplate({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  const hero = site.config.hero;
  return (
    <div style={paletteFor(site.config)} className={`site-public min-h-screen scroll-smooth ${styles.template} ${styles.rasm}`}>
      <header id="inicio" className={styles.rasmHeader}>
        <nav aria-label="Principal" className={styles.nav}>
          <a href="#inicio" className={styles.brand}>
            {site.logoUrl ? <Image src={site.logoUrl} alt="" width={48} height={48} className={styles.logo} /> : <span className={styles.brandMark}>✦</span>}
            <span>{site.businessName}</span>
          </a>
          <div className={styles.navLinks}>
            <a href="#servicios">Servicios</a><a href="#equipo">Equipo</a><a href="#contacto">Contacto</a>
            {site.bookingEnabled ? <a href="#reservar" className={styles.navCta}>Reservar</a> : null}
          </div>
        </nav>
        <div className={styles.rasmHero}>
          <div className={`${styles.heroCopy} site-enter`}>
            <span className={styles.eyebrow}>{hero.eyebrow}</span>
            <h1 className={styles.heroTitle}>{hero.title ?? site.businessName}</h1>
            {hero.description ? <p className={styles.heroDescription}>{hero.description}</p> : null}
            <BusinessStatus site={site} className="mt-5 text-[var(--site-muted)]" />
            <div className={styles.heroActions}>{site.bookingEnabled ? <a href="#reservar" className={`${styles.heroCta} site-action`}>Reservar turno →</a> : null}<a href="#servicios" className={styles.textLink}>Ver servicios</a></div>
          </div>
          <div className={`${styles.heroImage} site-enter site-enter-delay-2`}>
            <Image src={hero.imageUrl ?? DEFAULT_SITE_IMAGES.rasm} alt="" fill preload={!preview} sizes="(max-width: 1024px) 100vw, 42vw" className="object-cover" />
          </div>
        </div>
      </header>
      <ConfigurableSections site={site} preview={preview} />
      <SiteFooter site={site} />
    </div>
  );
}

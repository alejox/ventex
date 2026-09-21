import Image from "next/image";
import type { PublicSite } from "@/services/public-site.types";
import { DEFAULT_SITE_DETAIL_IMAGES, DEFAULT_SITE_IMAGES } from "@/services/public-site.types";
import { BusinessStatus } from "./BusinessStatus";
import { ConfigurableSections, SiteFooter } from "./SiteSections";
import { paletteFor } from "./theme";
import { socialLinksOf } from "@/lib/socialLinks";
import styles from "./templates.module.css";

export function QutterTemplate({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  const hero = site.config.hero;
  const socials = socialLinksOf(site).slice(0, 4);
  return (
    <div style={paletteFor(site.config)} className={`site-public min-h-screen scroll-smooth ${styles.template} ${styles.qutter}`}>
      <header id="inicio" className={styles.qutterHeader}>
        <nav aria-label="Principal" className={styles.nav}>
          <a href="#inicio" className={styles.brand}>{site.logoUrl ? <Image src={site.logoUrl} alt="" width={48} height={48} className={styles.logo} /> : <span className={styles.brandMark}>✂</span>}<span>{site.businessName}</span></a>
          <div className={styles.navLinks}><a href="#servicios">Servicios</a><a href="#galeria">Galería</a><a href="#contacto">Contacto</a>{site.bookingEnabled ? <a href="#reservar" className={styles.navCta}>Agendar →</a> : null}</div>
        </nav>
        <div className={styles.qutterHero}>
          <div className={styles.qutterSideImage}><Image src={DEFAULT_SITE_DETAIL_IMAGES.qutterSide} alt="" fill sizes="12vw" /></div>
          <div className={styles.qutterMainImage}><Image src={hero.imageUrl ?? DEFAULT_SITE_IMAGES.qutter} alt="" fill preload={!preview} sizes="(max-width: 1024px) 100vw, 73vw" /></div>
          {socials.length ? <div className={styles.socialRail}>{socials.map((social) => <a key={social.network} href={social.href} target="_blank" rel="noopener noreferrer">{social.label}</a>)}</div> : null}
          <div className={`${styles.heroCopy} site-enter`}>
            <span className={styles.eyebrow}>{hero.eyebrow}</span>
            <h1 className={styles.heroTitle}>{hero.title ?? site.businessName}</h1>
            {hero.description ? <p className={styles.heroDescription}>{hero.description}</p> : null}
            <BusinessStatus site={site} className="mt-5 text-[var(--site-on-surface-muted)]" />
            <div className={styles.heroActions}>{site.bookingEnabled ? <a href="#reservar" className={`${styles.heroCta} site-action`}>Reservar turno →</a> : null}<a href="#servicios" className={styles.textLink}>Explorar servicios</a></div>
          </div>
        </div>
      </header>
      <ConfigurableSections site={site} preview={preview} />
      <SiteFooter site={site} />
    </div>
  );
}

import Image from "next/image";
import { esImagenAjena } from "@/lib/remoteImage";
import type { PublicSite } from "@/services/public-site.types";
import { DEFAULT_SITE_IMAGES } from "@/services/public-site.types";
import { BusinessStatus } from "./BusinessStatus";
import { ConfigurableSections, SiteFooter } from "./SiteSections";
import { paletteFor } from "./theme";
import baseStyles from "./templates.module.css";
import styles from "./SalonTemplate.module.css";

export type SalonVariant = "luxia" | "lezar" | "zen";

const MARKS: Record<SalonVariant, string> = { luxia: "✿", lezar: "❋", zen: "☾" };

/**
 * Los tres diseños de salón/spa comparten estructura (barra, portada, secciones
 * configurables) y se distinguen por paleta, tipografía y composición de la
 * portada: eso vive en el CSS de cada variante, no en el marcado.
 */
export function SalonTemplate({ site, preview = false, variant }: { site: PublicSite; preview?: boolean; variant: SalonVariant }) {
  const hero = site.config.hero;
  const image = hero.imageUrl ?? DEFAULT_SITE_IMAGES[variant];
  return (
    <div style={paletteFor(site.config)} className={`site-public min-h-screen scroll-smooth ${baseStyles.template} ${styles.root} ${styles[variant]}`} data-template={variant}>
      <header id="inicio" className={styles.header}>
        <nav aria-label="Principal" className={`${baseStyles.nav} ${styles.nav}`}>
          <a href="#inicio" className={baseStyles.brand}>{site.logoUrl ? <Image src={site.logoUrl} unoptimized={esImagenAjena(site.logoUrl)} alt="" width={48} height={48} className={baseStyles.logo} /> : <span className={styles.mark} aria-hidden="true">{MARKS[variant]}</span>}<span>{site.businessName}</span></a>
          <div className={`${baseStyles.navLinks} ${styles.links}`}><a href="#servicios">Servicios</a><a href="#productos">Productos</a><a href="#contacto">Contacto</a>{site.bookingEnabled ? <a href="#reservar" className={`${baseStyles.navCta} ${styles.cta}`}>Reservar cita</a> : null}</div>
        </nav>
        <div className={styles.hero}>
          <div className={`${styles.copy} site-enter`}>
            <span className={styles.eyebrow}>{hero.eyebrow}</span>
            <h1 className={styles.title}>{hero.title ?? site.businessName}</h1>
            {hero.description ? <p className={styles.description}>{hero.description}</p> : null}
            <BusinessStatus site={site} className="mt-5 text-[var(--site-muted)]" />
            <div className={styles.actions}>{site.bookingEnabled ? <a href="#reservar" className={`${styles.primary} site-action`}>Reservar ahora</a> : null}<a href="#servicios" className={`${styles.secondary} site-action`}>Ver servicios</a></div>
          </div>
          <div className={`${styles.frame} site-enter site-enter-delay-2`}>
            <Image src={image} unoptimized={esImagenAjena(image)} alt="" fill preload={!preview} sizes="(max-width: 900px) 100vw, 46vw" className={styles.photo} />
          </div>
        </div>
      </header>
      <ConfigurableSections site={site} preview={preview} />
      <SiteFooter site={site} />
    </div>
  );
}

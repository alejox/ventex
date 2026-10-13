import Image from "next/image";
import Link from "next/link";
import { Itim, Outfit } from "next/font/google";
import { esImagenAjena } from "@/lib/remoteImage";
import { socialLinksOf } from "@/lib/socialLinks";
import { orderWhatsappLink } from "@/lib/site-order";
import { BrandIcon } from "@/app/assets/icons/BrandIcons";
import type { PublicSite } from "@/services/public-site.types";
import { BusinessStatus } from "./BusinessStatus";
import { ConfigurableSections, SectionHeading } from "./SiteSections";
import { StoreCatalog } from "./StoreCatalog";
import { paletteFor, whatsappHref } from "./theme";
import baseStyles from "./templates.module.css";
import styles from "./OrganicoTemplate.module.css";

// Publicadas como variables: la paleta (`--site-heading-font`) las nombra
// primero, así un cambio de tipografía sigue pasando por el tema.
const headingFont = Itim({ subsets: ["latin"], weight: "400", variable: "--font-organico-heading", display: "swap" });
const bodyFont = Outfit({ subsets: ["latin"], variable: "--font-organico-body", display: "swap" });

/**
 * Plantilla de tienda natural: fondos crema, naranja de marca, verde de apoyo
 * y tarjetas muy redondeadas. Inspirada en el lenguaje de los temas de tiendas
 * orgánicas; ni código ni imágenes de ningún paquete viajan con ella — las
 * formas de la portada son CSS y la foto, opcional, la sube el negocio.
 *
 * Igual que Mercado, el catálogo va justo después de la portada: la sección de
 * productos sale del orden configurable para no aparecer dos veces.
 */
export function OrganicoTemplate({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  const hero = site.config.hero;
  const products = site.config.sections.find((section) => section.id === "products");
  const showCatalog = Boolean(products?.visible) && site.products.length > 0;
  const canOrder = orderWhatsappLink(site.whatsapp, "") !== null;
  const rest: PublicSite = {
    ...site,
    config: { ...site.config, sections: site.config.sections.filter((section) => section.id !== "products") },
  };
  const socials = socialLinksOf(site);
  const contactHref = site.whatsapp ? whatsappHref(site.whatsapp, `Hola ${site.businessName}, quiero consultar.`) : null;

  return (
    <div
      style={paletteFor(site.config)}
      className={`site-public min-h-screen scroll-smooth ${baseStyles.template} ${styles.root} ${headingFont.variable} ${bodyFont.variable}`}
      data-template="organico"
    >
      <header id="inicio" className={styles.header}>
        <div className={styles.headerInner}>
          <a href="#inicio" className={styles.brand}>
            {site.logoUrl ? (
              <Image src={site.logoUrl} unoptimized={esImagenAjena(site.logoUrl)} alt="" width={44} height={44} className={styles.logo} />
            ) : (
              <span className={styles.mark} aria-hidden="true">{site.businessName.slice(0, 1).toUpperCase()}</span>
            )}
            <span className={styles.brandName}>{site.businessName}</span>
          </a>
          {contactHref ? (
            <a href={contactHref} target="_blank" rel="noopener noreferrer" className={styles.headerCta}>
              <BrandIcon name="whatsapp" className="h-4 w-4" />
              <span className={styles.headerCtaText}>{canOrder ? "Pide por WhatsApp" : "Escríbenos"}</span>
            </a>
          ) : null}
        </div>
      </header>

      <section className={styles.hero} aria-label="Portada">
        <span className={`${styles.shape} ${styles.shapeOrange}`} aria-hidden="true" />
        <span className={`${styles.shape} ${styles.shapeGreen}`} aria-hidden="true" />
        <span className={`${styles.shape} ${styles.shapeDots}`} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={`${styles.heroCopy} site-enter`}>
            {hero.eyebrow ? <span className={styles.eyebrow}>{hero.eyebrow}</span> : null}
            <h1 className={styles.title}>{hero.title ?? site.businessName}</h1>
            {hero.description ? <p className={styles.description}>{hero.description}</p> : null}
            <BusinessStatus site={site} className={styles.status} />
            <div className={styles.actions}>
              {showCatalog ? <a href="#productos" className={`${styles.cta} site-action`}>Ver productos</a> : null}
              {showCatalog && canOrder ? <span className={styles.hint}>Arma tu pedido y envíalo por WhatsApp.</span> : null}
            </div>
          </div>
          {hero.imageUrl ? (
            <div className={`${styles.heroImage} site-enter site-enter-delay-2`}>
              <Image src={hero.imageUrl} unoptimized={esImagenAjena(hero.imageUrl)} alt="" fill preload={!preview} sizes="(max-width: 900px) 100vw, 40vw" className={styles.photo} />
            </div>
          ) : null}
        </div>
      </section>

      {showCatalog ? (
        <div className={styles.catalogBand}>
          <StoreCatalog site={site} variant="organico" heading={products ? <SectionHeading section={products} /> : null} />
        </div>
      ) : null}

      <ConfigurableSections site={rest} preview={preview} />

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <p className={styles.footerName}>{site.businessName}</p>
            {site.address ? <p className={styles.footerMuted}>{site.address}</p> : null}
          </div>
          {socials.length ? (
            <ul className={styles.footerLinks}>
              {socials.map((social) => (
                <li key={social.network}>
                  <a href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label}><BrandIcon name={social.network} className="h-4 w-4" /></a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className={styles.footerBottom}>
          <p>© {new Date().getFullYear()} {site.businessName}</p>
          <p>Sitio hecho con <Link href="/" className="underline">Ventex</Link></p>
        </div>
      </footer>
    </div>
  );
}

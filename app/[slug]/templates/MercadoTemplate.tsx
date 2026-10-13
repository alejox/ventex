import Image from "next/image";
import Link from "next/link";
import { Lato, Quicksand } from "next/font/google";
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
import styles from "./MercadoTemplate.module.css";

// Publicadas como variables: la paleta (`--site-heading-font`) las nombra
// primero, así un cambio de tipografía sigue pasando por el tema.
const headingFont = Quicksand({ subsets: ["latin"], variable: "--font-mercado-heading", display: "swap" });
const bodyFont = Lato({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-mercado-body", display: "swap" });

/**
 * Plantilla de tienda: barra verde, cabecera con buscador, portada en paneles
 * pastel y el catálogo arriba de todo. Inspirada en el lenguaje de los temas
 * de supermercado; ni código ni imágenes de ningún paquete viajan con ella.
 *
 * El catálogo va primero SIEMPRE: el buscador de la cabecera y el del catálogo
 * son el mismo estado (`StoreCatalog variant="mercado"` arma los dos), así que
 * la sección de productos sale del orden configurable y el resto sigue igual.
 */
export function MercadoTemplate({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  const hero = site.config.hero;
  const products = site.config.sections.find((section) => section.id === "products");
  const showCatalog = Boolean(products?.visible) && site.products.length > 0;
  const canOrder = orderWhatsappLink(site.whatsapp, "") !== null;
  const rest: PublicSite = {
    ...site,
    config: { ...site.config, sections: site.config.sections.filter((section) => section.id !== "products") },
  };
  const socials = socialLinksOf(site);

  // Las piezas que se le pasan a StoreCatalog (componente de cliente) llevan
  // `key`: al cruzar la frontera servidor→cliente React las valida como hijos
  // de una lista y, sin key, avisa en desarrollo.
  const topBar = site.whatsapp || site.address ? (
    <div key="top-bar" className={styles.topBar}>
      <div className={styles.topBarInner}>
        {site.address ? <span className={styles.topBarItem}>{site.address}</span> : <span />}
        {site.whatsapp ? (
          <a href={whatsappHref(site.whatsapp, `Hola ${site.businessName}, quiero consultar.`)} target="_blank" rel="noopener noreferrer" className={styles.topBarItem}>
            <BrandIcon name="whatsapp" className="h-3.5 w-3.5" />
            {canOrder ? "Pide por WhatsApp" : "Escríbenos"}
          </a>
        ) : null}
      </div>
    </div>
  ) : null;

  const brand = (
    <a key="brand" href="#inicio" className={styles.brand}>
      {site.logoUrl ? (
        <Image src={site.logoUrl} unoptimized={esImagenAjena(site.logoUrl)} alt="" width={44} height={44} className={styles.logo} />
      ) : (
        <span className={styles.mark} aria-hidden="true">{site.businessName.slice(0, 1).toUpperCase()}</span>
      )}
      <span className={styles.brandName}>{site.businessName}</span>
    </a>
  );

  const heroBlock = (
    <section key="hero" className={styles.hero} aria-label="Portada">
      <div className={`${styles.mainPanel} site-enter`}>
        <div className={styles.mainCopy}>
          <span className={styles.eyebrow}>{hero.eyebrow}</span>
          <h1 className={styles.title}>{hero.title ?? site.businessName}</h1>
          {hero.description ? <p className={styles.description}>{hero.description}</p> : null}
          <BusinessStatus site={site} className={styles.status} />
          {showCatalog ? <a href="#productos" className={`${styles.cta} site-action`}>Ver productos</a> : null}
        </div>
        {hero.imageUrl ? (
          <div className={styles.heroImage}>
            <Image src={hero.imageUrl} unoptimized={esImagenAjena(hero.imageUrl)} alt="" fill preload={!preview} sizes="(max-width: 900px) 100vw, 40vw" className={styles.photo} />
          </div>
        ) : null}
      </div>
      <div className={styles.sidePanels}>
        {showCatalog && canOrder ? (
          <div className={`${styles.panel} ${styles.amberPanel} site-enter site-enter-delay-2`}>
            <strong className={styles.panelTitle}>Pide en minutos</strong>
            <p>Elige tus productos, arma tu pedido y envíalo por WhatsApp.</p>
          </div>
        ) : null}
        {site.address ? (
          <div className={`${styles.panel} ${styles.peachPanel} site-enter site-enter-delay-2`}>
            <strong className={styles.panelTitle}>Visítanos</strong>
            <p>{site.address}</p>
          </div>
        ) : null}
      </div>
    </section>
  );

  return (
    <div
      style={paletteFor(site.config)}
      className={`site-public min-h-screen scroll-smooth ${baseStyles.template} ${styles.root} ${headingFont.variable} ${bodyFont.variable}`}
      data-template="mercado"
    >
      <StoreCatalog
        site={site}
        variant="mercado"
        showCatalog={showCatalog}
        topBar={topBar}
        brand={brand}
        hero={heroBlock}
        heading={products ? <SectionHeading key="heading" section={products} /> : null}
      />
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

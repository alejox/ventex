import Image from "next/image";
import Link from "next/link";
import { Barlow } from "next/font/google";
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
import styles from "./DespensaTemplate.module.css";

// Publicada como variable: la paleta (`--site-heading-font`/`--site-body-font`)
// la nombra primero, así un cambio de tipografía sigue pasando por el tema.
const font = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-despensa", display: "swap" });

/**
 * Plantilla de tienda tipo supermercado: cabecera blanca con buscador ancho,
 * barra oscura de categorías, portada compacta en una banda oscura y el
 * catálogo con columna lateral de categorías. Inspirada en el lenguaje de los
 * temas de supermercado; ni código ni imágenes de ningún paquete viajan con ella.
 *
 * Como en Mercado, el buscador de la cabecera y el del catálogo son el mismo
 * estado (`StoreCatalog variant="despensa"`), así que la sección de productos
 * sale del orden configurable y el resto sigue igual.
 */
export function DespensaTemplate({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
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

  const navEnd = site.whatsapp ? (
    <a
      key="nav-end"
      href={whatsappHref(site.whatsapp, `Hola ${site.businessName}, quiero consultar.`)}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.navWhatsapp}
      aria-label={canOrder ? "Pide por WhatsApp" : "Escríbenos por WhatsApp"}
    >
      <BrandIcon name="whatsapp" className="h-4 w-4" />
      <span className={styles.navWhatsappText}>{canOrder ? "Pide por WhatsApp" : "Escríbenos"}</span>
    </a>
  ) : null;

  const heroBlock = (
    <section key="hero" className={styles.hero} aria-label="Portada">
      <div className={`${styles.heroInner} site-enter`}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{hero.eyebrow}</span>
          <h1 className={styles.title}>{hero.title ?? site.businessName}</h1>
          {hero.description ? <p className={styles.description}>{hero.description}</p> : null}
          {/* Bloques propios: el estado y el botón nunca comparten renglón. */}
          <div className={styles.statusRow}><BusinessStatus site={site} className={styles.status} /></div>
          {showCatalog ? <a href="#productos" className={`${styles.cta} site-action`}>Ver productos</a> : null}
        </div>
        {hero.imageUrl ? (
          <div className={styles.heroImage}>
            <Image src={hero.imageUrl} unoptimized={esImagenAjena(hero.imageUrl)} alt="" fill preload={!preview} sizes="(max-width: 900px) 100vw, 36vw" className={styles.photo} />
          </div>
        ) : null}
      </div>
      {(showCatalog && canOrder) || site.address ? (
        <ul className={styles.perks}>
          {showCatalog && canOrder ? (
            <li className={styles.perk}>
              <strong>Pide en minutos</strong>
              <span>Arma tu pedido y envíalo por WhatsApp.</span>
            </li>
          ) : null}
          {site.address ? (
            <li className={styles.perk}>
              <strong>Visítanos</strong>
              <span>{site.address}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );

  return (
    <div
      style={paletteFor(site.config)}
      className={`site-public min-h-screen scroll-smooth ${baseStyles.template} ${styles.root} ${font.variable}`}
      data-template="despensa"
    >
      <StoreCatalog
        site={site}
        variant="despensa"
        showCatalog={showCatalog}
        brand={brand}
        navEnd={navEnd}
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

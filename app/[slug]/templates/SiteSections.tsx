import Image from "next/image";
import Link from "next/link";
import type {
  PublicSite,
  SiteSectionConfig,
} from "@/services/public-site.types";
import { WEEKDAY_LABELS } from "@/services/public-site.types";
import { socialLinksOf } from "@/lib/socialLinks";
import { BrandIcon } from "@/app/assets/icons/BrandIcons";
import { BookServiceLink } from "../BookServiceLink";
import { BookingWidget } from "../BookingWidget";
import { formatCOP, whatsappHref } from "./theme";

function SectionHeading({ section }: { section: SiteSectionConfig }) {
  return (
    <div className="site-section-heading">
      <p className="site-section-kicker">
        {section.subtitle}
      </p>
      <h2
        className="site-section-title"
        style={{ fontFamily: "var(--site-heading-font)" }}
      >
        {section.title}
      </h2>
    </div>
  );
}

function ServicesSection({ site, section }: SectionProps) {
  if (!site.services.length) return null;
  return (
    <section id="servicios" className="site-section site-services-section site-reveal">
      <SectionHeading section={section} />
      <ul className="site-grid site-services-grid">
        {site.services.map((service, index) => (
          <li key={service.id} className="site-card site-service-card flex flex-col justify-between">
            <div>
              {service.imageUrl ? (
                <div className="site-service-image">
                  <Image src={service.imageUrl} alt={service.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
                </div>
              ) : null}
              <span className="site-service-index block text-xs">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="site-service-title">{service.name}</h3>
              {service.description ? <p className="site-service-description">{service.description}</p> : null}
              <p className="site-service-duration">{service.durationMinutes} minutos</p>
            </div>
            <div className="site-service-footer gap-4">
              <strong className="text-[var(--site-on-surface)]">{formatCOP(service.price)}</strong>
              {site.bookingEnabled ? (
                <BookServiceLink serviceId={service.id} href="#reservar" className="site-action inline-flex min-h-11 items-center bg-[var(--site-accent)] px-4 text-xs font-bold text-[var(--site-on-accent)]">
                  Reservar
                </BookServiceLink>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AboutSection({ site, section }: SectionProps) {
  if (!site.config.about.description) return null;
  const image = site.config.about.imageUrl;
  return (
    <section className="site-section site-about-section site-reveal">
      <div className="site-about-grid">
        <div className={image ? "" : "lg:col-span-2 lg:max-w-4xl"}>
          <SectionHeading section={section} />
          <p className="site-about-copy">{site.config.about.description}</p>
        </div>
        {image ? (
          <div className="site-about-image overflow-hidden bg-[var(--site-surface-alt)]">
            <Image src={image} alt={site.config.about.title} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProductsSection({ site, section }: SectionProps) {
  if (!site.products.length) return null;
  return (
    <section id="productos" className="site-section site-products-section site-reveal">
      <SectionHeading section={section} />
      <ul className="site-grid site-products-grid">
        {site.products.map((product) => (
          <li key={product.id} className="site-card site-product-card">
            <div className="site-product-image">
              {product.imageUrl ? <Image src={product.imageUrl} alt={product.name} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" /> : <span className="grid h-full place-items-center text-3xl text-[var(--site-on-surface-muted)]" aria-hidden="true">{product.icon ?? "+"}</span>}
            </div>
            <div className="site-product-copy"><h3 className="text-sm font-semibold text-[var(--site-on-surface)]">{product.name}</h3><p className="mt-2 text-sm font-bold text-[color-mix(in_srgb,var(--site-accent)_62%,currentColor)]">{formatCOP(product.price)}</p></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamSection({ site, section }: SectionProps) {
  if (!site.staff.length) return null;
  return (
    <section id="equipo" className="site-section site-team-section site-reveal">
      <SectionHeading section={section} />
      <ul className="site-grid site-team-grid">
        {site.staff.map((member) => (
          <li key={member.id} className="site-card site-team-card flex items-center gap-4">
            <span className="site-team-avatar shrink-0" aria-hidden="true">
              {member.photoUrl ? <Image src={member.photoUrl} alt="" fill sizes="72px" className="object-cover" /> : member.fullName.slice(0, 1).toUpperCase()}
            </span>
            <span><strong className="block text-[var(--site-text)]">{member.fullName}</strong>{member.role ? <span className="mt-1 block text-xs text-[var(--site-muted)]">{member.role}</span> : null}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GallerySection({ site, section }: SectionProps) {
  if (!site.config.gallery.images.length) return null;
  return (
    <section id="galeria" className="site-section site-gallery-section site-reveal">
      <SectionHeading section={section} />
      <div className="site-gallery-grid">
        {site.config.gallery.images.map((image, index) => (
          <div key={image.id} className={`site-gallery-image overflow-hidden bg-[var(--site-surface-alt)] ${index % 5 === 0 ? "col-span-2 row-span-2" : ""}`}>
            <Image src={image.url} alt={image.alt} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}

function BookingSection({ site, section, preview }: SectionProps & { preview: boolean }) {
  if (!site.bookingEnabled) return null;
  return (
    <section id="reservar" className="site-booking-section site-reveal">
      <div className="site-booking-inner">
        <div><SectionHeading section={section} /><p className="mt-5 leading-relaxed text-[var(--site-muted)]">Elegí el servicio, profesional y horario que mejor te quede.</p></div>
        <div className="site-booking-panel min-w-0 shadow-[var(--site-shadow)]">
          {preview ? <div className="grid min-h-64 place-items-center border border-dashed border-[var(--site-on-surface-border)] p-8 text-center text-sm text-[var(--site-on-surface-muted)]">La agenda real aparecerá aquí cuando publiques.</div> : <BookingWidget site={site} />}
        </div>
      </div>
    </section>
  );
}

function businessWeekday(timezone: string): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
}

function HoursSection({ site, section }: SectionProps) {
  if (!site.hours.length) return null;
  const today = businessWeekday(site.timezone);
  return (
    <section id="horarios" className="site-section site-hours-section site-reveal">
      <div className="site-hours-grid">
        <SectionHeading section={section} />
        <ul className="site-hours-list">
          {site.hours.map((hour) => <li key={hour.weekday} className="site-hour gap-4 text-sm"><span className="text-[var(--site-text)]">{WEEKDAY_LABELS[hour.weekday]}{hour.weekday === today ? " · hoy" : ""}</span><span className={hour.weekday === today ? "font-bold text-[color-mix(in_srgb,var(--site-accent)_62%,currentColor)]" : "text-[var(--site-muted)]"}>{hour.isOpen ? `${hour.opensAt} – ${hour.closesAt}` : "Cerrado"}</span></li>)}
        </ul>
      </div>
    </section>
  );
}

function ContactSection({ site, section }: SectionProps) {
  const socials = socialLinksOf(site);
  if (!site.whatsapp && !site.address && !socials.length) return null;
  return (
    <section id="contacto" className="site-section site-contact-section site-reveal">
      <div className="site-contact-panel">
        <SectionHeading section={section} />
        {site.address ? <p className="mt-7 max-w-xl text-lg">{site.address}</p> : null}
        <div className="mt-7 flex flex-wrap gap-3">
          {site.whatsapp ? <a href={whatsappHref(site.whatsapp, `Hola ${site.businessName}, quiero consultar.`)} target="_blank" rel="noopener noreferrer" className="site-action inline-flex min-h-12 items-center gap-2 bg-[var(--site-accent)] px-5 font-bold text-[var(--site-on-accent)]"><BrandIcon name="whatsapp" className="h-4 w-4" />WhatsApp</a> : null}
          {socials.map((social) => <a key={social.network} href={social.href} target="_blank" rel="noopener noreferrer" className="site-action inline-flex min-h-12 items-center gap-2 border border-current px-5 font-semibold"><BrandIcon name={social.network} className="h-4 w-4" />{social.label}</a>)}
        </div>
      </div>
    </section>
  );
}

interface SectionProps { site: PublicSite; section: SiteSectionConfig }

export function ConfigurableSections({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  return site.config.sections.map((section) => {
    if (!section.visible) return null;
    switch (section.id) {
      case "services": return <ServicesSection key={section.id} site={site} section={section} />;
      case "about": return <AboutSection key={section.id} site={site} section={section} />;
      case "products": return <ProductsSection key={section.id} site={site} section={section} />;
      case "team": return <TeamSection key={section.id} site={site} section={section} />;
      case "gallery": return <GallerySection key={section.id} site={site} section={section} />;
      case "booking": return <BookingSection key={section.id} site={site} section={section} preview={preview} />;
      case "hours": return <HoursSection key={section.id} site={site} section={section} />;
      case "contact": return <ContactSection key={section.id} site={site} section={section} />;
    }
  });
}

export function SiteFooter({ site }: { site: PublicSite }) {
  return <footer className="border-t border-[var(--site-border)] px-5 py-10 text-xs text-[var(--site-muted)]"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 sm:flex-row"><p>© {new Date().getFullYear()} {site.businessName}</p><p>Sitio hecho con <Link href="/" className="underline">Ventex</Link></p></div></footer>;
}

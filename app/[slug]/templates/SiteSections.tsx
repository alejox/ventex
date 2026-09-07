import Image from "next/image";
import Link from "next/link";
import type { PublicSite, SiteTemplate } from "@/services/public-site.types";
import { WEEKDAY_LABELS } from "@/services/public-site.types";
import { socialLinksOf } from "@/lib/socialLinks";
import { BrandIcon } from "@/app/assets/icons/BrandIcons";
import { BookServiceLink } from "../BookServiceLink";
import { formatCOP, whatsappHref } from "./theme";

/**
 * Sections shared by all three templates.
 *
 * The templates differ in palette, typography and arrangement — not in what
 * they can show. Keeping the sections here is what makes "pick another design"
 * a one-field change instead of three drifting copies of the same page.
 *
 * Everything styles itself from the `--site-*` variables the template wrapper
 * publishes, so these components never need to know which design is active.
 */

const sectionClass: Record<SiteTemplate, string> = {
  clasico: "mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24",
  moderno: "mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-24",
  minimal: "mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24",
};

export function SectionTitle({
  children,
  variant = "clasico",
}: {
  children: React.ReactNode;
  variant?: SiteTemplate;
}) {
  return (
    <h2
      className={
        variant === "clasico"
          ? "max-w-2xl text-4xl leading-none font-normal tracking-tight text-[var(--site-text)] sm:text-5xl"
          : variant === "moderno"
            ? "max-w-3xl text-4xl leading-none font-extrabold tracking-[-0.04em] text-[var(--site-text)] sm:text-6xl"
            : "max-w-3xl text-4xl leading-[1.02] font-semibold tracking-[-0.045em] text-[var(--site-text)] sm:text-5xl"
      }
      style={{ fontFamily: "var(--site-heading-font)" }}
    >
      {children}
    </h2>
  );
}

export function ServicesSection({
  site,
  onBookHref = "#reservar",
  variant = "clasico",
}: {
  site: PublicSite;
  onBookHref?: string;
  variant?: SiteTemplate;
}) {
  if (!site.services.length) return null;

  return (
    <section id="servicios" className={`${sectionClass[variant]} site-reveal`}>
      <div>
        <p className="mb-3 text-xs font-bold tracking-[0.16em] text-[var(--site-accent)] uppercase">Lo que hacemos</p>
        <SectionTitle variant={variant}>Servicios</SectionTitle>
      </div>
      <ul className={variant === "clasico" ? "mt-10 grid gap-x-10 md:grid-cols-2" : variant === "moderno" ? "mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "mt-10 grid gap-4 md:grid-cols-2"}>
        {site.services.map((service) => (
          <li
            key={service.id}
            className={`${variant === "clasico" ? "flex items-start justify-between gap-5 border-b border-[var(--site-border)] py-6" : variant === "moderno" ? "group flex min-h-56 flex-col justify-between rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6" : "flex flex-col items-start justify-between gap-5 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6 shadow-[var(--site-shadow)] sm:flex-row"} site-card`}
          >
            <div className="min-w-0">
              {variant === "moderno" ? <span aria-hidden="true" className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--site-accent)] font-bold text-[var(--site-on-accent)]">{service.icon ?? "+"}</span> : null}
              {variant === "minimal" && service.icon ? <span aria-hidden="true" className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--site-surface-alt)]">{service.icon}</span> : null}
              <h3 className={variant === "clasico" ? "text-xl font-normal text-[var(--site-text)]" : variant === "moderno" ? "text-lg font-bold text-[var(--site-text)]" : "text-xl font-bold tracking-tight text-[var(--site-text)]"} style={variant === "clasico" ? { fontFamily: "var(--site-heading-font)" } : undefined}>{service.name}</h3>
              {service.description ? (
                <p className="mt-2 text-sm leading-relaxed text-[var(--site-muted)]">{service.description}</p>
              ) : null}
              <p className="mt-3 text-xs font-medium text-[var(--site-muted)]">
                {service.durationMinutes} minutos
              </p>
            </div>
            <div className={variant === "moderno" ? "mt-7 flex items-end justify-between gap-4" : variant === "minimal" ? "flex w-full shrink-0 items-center justify-between gap-4 text-right sm:block sm:w-auto" : "shrink-0 text-right"}>
              {/* break-words: real COP totals overflow a narrow column otherwise. */}
              <p className="font-bold break-words text-[var(--site-text)]">
                {formatCOP(service.price)}
              </p>
              {site.bookingEnabled ? (
                <BookServiceLink
                  serviceId={service.id}
                  href={onBookHref}
                  className={`${variant === "minimal" ? "mt-2 inline-flex min-h-12 items-center text-xs font-bold text-[var(--site-accent)] underline underline-offset-4" : "mt-3 inline-flex min-h-12 items-center rounded-full bg-[var(--site-accent)] px-4 text-xs font-bold text-[var(--site-on-accent)]"} site-action`}
                >
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

export function ProductsSection({ site, variant = "clasico" }: { site: PublicSite; variant?: SiteTemplate }) {
  if (!site.products.length) return null;

  return (
    <section id="productos" className={`${sectionClass[variant]} site-reveal`}>
      <p className="mb-3 text-xs font-bold tracking-[0.16em] text-[var(--site-accent)] uppercase">Para llevar</p>
      <SectionTitle variant={variant}>Productos</SectionTitle>
      <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {site.products.map((product) => (
          <li
            key={product.id}
            className={`${variant === "minimal" ? "group overflow-hidden rounded-[var(--site-radius)] bg-[var(--site-surface)] shadow-[var(--site-shadow)]" : variant === "moderno" ? "group overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)]" : "overflow-hidden rounded-[var(--site-radius)] bg-[var(--site-surface)] shadow-[var(--site-shadow)]"} site-card`}
          >
            <div className={variant === "clasico" ? "relative aspect-[4/5] bg-[var(--site-surface-alt)]" : "relative aspect-square overflow-hidden bg-[var(--site-surface-alt)]"}>
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-3xl" aria-hidden="true">
                  {product.icon ?? "🛍️"}
                </span>
              )}
            </div>
            <div className="p-4">
              <h3 className="line-clamp-2 text-sm font-medium text-[var(--site-text)]">
                {product.name}
              </h3>
              <p className="mt-1 text-sm font-bold break-words text-[var(--site-text)]">
                {formatCOP(product.price)}
              </p>
              {!product.inStock ? (
                <p className="mt-1 text-xs text-[var(--site-muted)]">Sin stock</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StaffSection({ site, variant = "clasico" }: { site: PublicSite; variant?: SiteTemplate }) {
  if (!site.staff.length) return null;

  return (
    <section id="equipo" className={`${sectionClass[variant]} site-reveal ${variant === "moderno" ? "border-y border-[var(--site-border)] bg-[var(--site-surface-alt)]" : ""}`}>
      <p className="mb-3 text-xs font-bold tracking-[0.16em] text-[var(--site-accent)] uppercase">Quienes te reciben</p>
      <SectionTitle variant={variant}>El equipo</SectionTitle>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {site.staff.map((member) => (
          <li
            key={member.id}
            className={`${variant === "minimal" ? "flex min-h-24 items-center gap-4 rounded-[var(--site-radius)] bg-[var(--site-surface)] p-5 shadow-[var(--site-shadow)]" : variant === "moderno" ? "flex items-center gap-4 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5" : "flex items-center gap-4 border-b border-[var(--site-border)] py-5"} site-card`}
          >
            <span
              aria-hidden="true"
              className={variant === "minimal" ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--site-surface-alt)] text-sm font-bold text-[var(--site-accent)]" : "flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--site-accent)] text-lg font-bold text-[var(--site-on-accent)]"}
            >
              {member.fullName.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-left"><span className="block font-semibold text-[var(--site-text)]">{member.fullName}</span>{member.role ? <span className="mt-1 block text-xs text-[var(--site-muted)]">{member.role}</span> : null}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HoursSection({ site, variant = "clasico" }: { site: PublicSite; variant?: SiteTemplate }) {
  if (!site.hours.length) return null;

  const today = new Date().getDay();

  return (
    <section id="horarios" className={`${sectionClass[variant]} site-reveal`}>
      <div className="grid gap-10 md:grid-cols-[.8fr_1.2fr] md:gap-16">
      <div><p className="mb-3 text-xs font-bold tracking-[0.16em] text-[var(--site-accent)] uppercase">Planificá tu visita</p><SectionTitle variant={variant}>Horarios</SectionTitle></div>
      <ul className="border-t border-[var(--site-text)]">
        {site.hours.map((hour) => (
          <li
            key={hour.weekday}
            className={`flex min-h-14 items-center justify-between gap-4 border-b border-[var(--site-border)] py-3 text-sm ${
              hour.weekday === today ? "font-bold text-[var(--site-accent)]" : ""
            }`}
          >
            <span className="text-[var(--site-text)]">
              {WEEKDAY_LABELS[hour.weekday]}
              {hour.weekday === today ? " · hoy" : ""}
            </span>
            <span className="text-[var(--site-muted)]">
              {hour.isOpen ? `${hour.opensAt} – ${hour.closesAt}` : "Cerrado"}
            </span>
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}

export function ContactSection({ site, variant = "clasico" }: { site: PublicSite; variant?: SiteTemplate }) {
  // El enlace lo arma `socialLinksOf`, que descarta lo que no sea http(s): el
  // valor lo escribió el dueño y acá termina en un href público.
  const socials = socialLinksOf(site);
  const hasContact = site.whatsapp || site.address || socials.length > 0;
  if (!hasContact) return null;

  return (
    <section id="contacto" className={`${sectionClass[variant]} site-reveal ${variant === "moderno" ? "border-t border-[var(--site-border)]" : ""}`}>
      <div className={variant === "clasico" ? "rounded-[var(--site-radius)] bg-[var(--site-text)] p-7 text-[var(--site-bg)] shadow-[var(--site-shadow)] [&_h2]:!text-[var(--site-bg)] sm:p-12" : variant === "minimal" ? "rounded-[var(--site-radius)] bg-[var(--site-surface)] p-7 shadow-[var(--site-shadow)] sm:p-12" : ""}>
      <p className={`mb-3 text-xs font-bold tracking-[0.16em] uppercase ${variant === "clasico" ? "text-[var(--site-bg)] opacity-60" : "text-[var(--site-accent)]"}`}>Hablemos</p>
      <SectionTitle variant={variant}>Dónde estamos</SectionTitle>
      <div className="mt-8 space-y-5 text-sm text-[var(--site-muted)]">
        {site.address ? <p className={variant === "clasico" ? "max-w-xl text-lg text-[var(--site-bg)]" : "max-w-xl text-lg text-[var(--site-text)]"}>{site.address}</p> : null}
        <div className="flex flex-wrap gap-3">
          {site.whatsapp ? (
            <a
              href={whatsappHref(site.whatsapp, `Hola ${site.businessName}, quiero consultar.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="site-action inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--site-accent)] px-5 font-bold text-[var(--site-on-accent)]"
            >
              <BrandIcon name="whatsapp" className="h-4 w-4 shrink-0" />
              Escribir por WhatsApp
            </a>
          ) : null}
          {socials.map((social) => (
            <a
              key={social.network}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`site-action inline-flex min-h-12 items-center gap-2 rounded-full border px-5 font-semibold ${variant === "clasico" ? "border-[var(--site-muted)] text-[var(--site-bg)]" : "border-[var(--site-border)] text-[var(--site-text)]"}`}
            >
              {/* Sin `colored`: el logo toma el color del texto de la plantilla,
                  que es la que manda la paleta. */}
              <BrandIcon name={social.network} className="h-4 w-4 shrink-0" />
              {social.label}
            </a>
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}

export function SiteFooter({ site }: { site: PublicSite }) {
  return (
    <footer className="border-t border-[var(--site-border)] px-5 py-10 text-xs text-[var(--site-muted)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <p>
        © {new Date().getFullYear()} {site.businessName}
      </p>
      <p>
        Sitio hecho con{" "}
        <Link href="/" className="underline">
          Ventex
        </Link>
      </p>
      </div>
    </footer>
  );
}

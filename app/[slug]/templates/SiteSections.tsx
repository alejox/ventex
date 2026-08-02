import Image from "next/image";
import Link from "next/link";
import type { PublicSite } from "@/services/public-site.types";
import { WEEKDAY_LABELS } from "@/services/public-site.types";
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

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-2xl font-bold text-[var(--site-text)] sm:text-3xl"
      style={{ fontFamily: "var(--site-heading-font)" }}
    >
      {children}
    </h2>
  );
}

export function ServicesSection({
  site,
  onBookHref = "#reservar",
}: {
  site: PublicSite;
  onBookHref?: string;
}) {
  if (!site.services.length) return null;

  return (
    <section id="servicios" className="mx-auto w-full max-w-5xl px-5 py-14">
      <SectionTitle>Servicios</SectionTitle>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {site.services.map((service) => (
          <li
            key={service.id}
            className="flex items-start justify-between gap-4 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5"
          >
            <div className="min-w-0">
              <h3 className="font-semibold text-[var(--site-text)]">{service.name}</h3>
              {service.description ? (
                <p className="mt-1 text-sm text-[var(--site-muted)]">{service.description}</p>
              ) : null}
              <p className="mt-2 text-xs text-[var(--site-muted)]">
                {service.durationMinutes} minutos
              </p>
            </div>
            <div className="shrink-0 text-right">
              {/* break-words: real COP totals overflow a narrow column otherwise. */}
              <p className="font-bold break-words text-[var(--site-text)]">
                {formatCOP(service.price)}
              </p>
              {site.bookingEnabled ? (
                <a
                  href={onBookHref}
                  className="mt-2 inline-block rounded-[var(--site-radius)] bg-[var(--site-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--site-on-accent)]"
                >
                  Reservar
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProductsSection({ site }: { site: PublicSite }) {
  if (!site.products.length) return null;

  return (
    <section id="productos" className="mx-auto w-full max-w-5xl px-5 py-14">
      <SectionTitle>Productos</SectionTitle>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {site.products.map((product) => (
          <li
            key={product.id}
            className="overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)]"
          >
            <div className="relative aspect-square bg-[var(--site-surface-alt)]">
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-3xl" aria-hidden="true">
                  {product.icon ?? "🛍️"}
                </span>
              )}
            </div>
            <div className="p-3">
              <h3 className="truncate text-sm font-medium text-[var(--site-text)]">
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

export function StaffSection({ site }: { site: PublicSite }) {
  if (!site.staff.length) return null;

  return (
    <section id="equipo" className="mx-auto w-full max-w-5xl px-5 py-14">
      <SectionTitle>El equipo</SectionTitle>
      <ul className="mt-6 flex flex-wrap gap-4">
        {site.staff.map((member) => (
          <li
            key={member.id}
            className="flex min-w-[9rem] flex-1 flex-col items-center gap-2 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5 text-center"
          >
            <span
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--site-accent)] text-lg font-bold text-[var(--site-on-accent)]"
            >
              {member.fullName.slice(0, 1).toUpperCase()}
            </span>
            <span className="font-medium text-[var(--site-text)]">{member.fullName}</span>
            {member.role ? (
              <span className="text-xs text-[var(--site-muted)]">{member.role}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HoursSection({ site }: { site: PublicSite }) {
  if (!site.hours.length) return null;

  const today = new Date().getDay();

  return (
    <section id="horarios" className="mx-auto w-full max-w-5xl px-5 py-14">
      <SectionTitle>Horarios</SectionTitle>
      <ul className="mt-6 max-w-md">
        {site.hours.map((hour) => (
          <li
            key={hour.weekday}
            className={`flex items-center justify-between border-b border-[var(--site-border)] py-2.5 text-sm ${
              hour.weekday === today ? "font-semibold" : ""
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
    </section>
  );
}

export function ContactSection({ site }: { site: PublicSite }) {
  const hasContact = site.whatsapp || site.address || site.instagram;
  if (!hasContact) return null;

  return (
    <section id="contacto" className="mx-auto w-full max-w-5xl px-5 py-14">
      <SectionTitle>Dónde estamos</SectionTitle>
      <div className="mt-6 space-y-3 text-sm text-[var(--site-muted)]">
        {site.address ? <p className="text-[var(--site-text)]">{site.address}</p> : null}
        <div className="flex flex-wrap gap-3">
          {site.whatsapp ? (
            <a
              href={whatsappHref(site.whatsapp, `Hola ${site.businessName}, quiero consultar.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[var(--site-radius)] bg-[var(--site-accent)] px-4 py-2.5 font-semibold text-[var(--site-on-accent)]"
            >
              Escribir por WhatsApp
            </a>
          ) : null}
          {site.instagram ? (
            <a
              href={`https://instagram.com/${site.instagram.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[var(--site-radius)] border border-[var(--site-border)] px-4 py-2.5 font-medium text-[var(--site-text)]"
            >
              Instagram
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function SiteFooter({ site }: { site: PublicSite }) {
  return (
    <footer className="border-t border-[var(--site-border)] px-5 py-8 text-center text-xs text-[var(--site-muted)]">
      <p>
        © {new Date().getFullYear()} {site.businessName}
      </p>
      <p className="mt-1">
        Sitio hecho con{" "}
        <Link href="/" className="underline">
          Ventex
        </Link>
      </p>
    </footer>
  );
}

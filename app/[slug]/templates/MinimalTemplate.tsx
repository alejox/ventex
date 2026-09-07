import Image from "next/image";
import type { PublicSite } from "@/services/public-site.types";
import { BookingWidget } from "../BookingWidget";
import {
  ServicesSection,
  ProductsSection,
  StaffSection,
  HoursSection,
  ContactSection,
  SiteFooter,
  SectionTitle,
} from "./SiteSections";
import { SITE_PALETTES } from "./theme";
import { BusinessStatus } from "./BusinessStatus";

/** Soft premium minimalism: warm whites, generous imagery and quiet details. */
export function MinimalTemplate({ site }: { site: PublicSite }) {
  return (
    <div
      style={SITE_PALETTES.minimal}
      className="site-public min-h-screen scroll-smooth bg-[var(--site-bg)] text-[var(--site-text)] [font-family:var(--site-body-font)] selection:bg-[var(--site-accent)] selection:text-[var(--site-on-accent)]"
    >
      <header id="inicio" className="overflow-hidden bg-[var(--site-surface)]">
        <nav
          aria-label="Principal"
          className="mx-auto flex min-h-20 w-full max-w-6xl items-center justify-between px-5 sm:px-8"
        >
          <a href="#inicio" className="flex min-h-12 items-center gap-3">
            {site.logoUrl ? (
              <Image
                src={site.logoUrl}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--site-accent)]" />
            )}
            <span className="max-w-52 truncate text-sm font-semibold tracking-tight">
              {site.businessName}
            </span>
          </a>
          {site.bookingEnabled ? (
            <a
              href="#reservar"
              className="inline-flex min-h-12 items-center rounded-full bg-[var(--site-accent)] px-5 text-sm font-semibold text-[var(--site-on-accent)]"
            >
              Reservar
            </a>
          ) : null}
        </nav>

        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 pt-8 pb-16 sm:px-8 sm:pb-24 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:gap-16">
          <div className="site-enter">
            <p className="mb-5 text-xs font-semibold tracking-[0.18em] text-[var(--site-accent)] uppercase">
              Bienvenidos
            </p>
            <h1
              className="text-5xl leading-[0.98] font-semibold tracking-[-0.055em] sm:text-7xl"
              style={{ fontFamily: "var(--site-heading-font)" }}
            >
              {site.businessName}
            </h1>
            {site.headline ? (
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[var(--site-muted)]">
                {site.headline}
              </p>
            ) : null}
            <BusinessStatus site={site} className="mt-5 text-[var(--site-muted)]" />
            <div className="mt-8 flex flex-wrap gap-3">
              {site.bookingEnabled ? (
                <a
                  href="#reservar"
                  className="site-action inline-flex min-h-12 items-center rounded-full bg-[var(--site-accent)] px-6 text-sm font-semibold text-[var(--site-on-accent)] shadow-[var(--site-shadow)]"
                >
                  Encontrar un horario
                </a>
              ) : null}
              {site.services.length ? (
                <a
                  href="#servicios"
                  className="site-action inline-flex min-h-12 items-center rounded-full border border-[var(--site-border)] px-6 text-sm font-semibold"
                >
                  Ver servicios
                </a>
              ) : null}
            </div>
          </div>
          <div className="relative aspect-[4/5] max-h-[38rem] overflow-hidden rounded-[2.5rem] bg-[var(--site-surface-alt)] shadow-[var(--site-shadow)] site-enter site-enter-delay-2">
            {site.heroImageUrl ? (
              <Image
                src={site.heroImageUrl}
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 52vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-8xl font-light text-[var(--site-accent)]">
                  {site.businessName.slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {site.about ? (
        <section className="site-reveal mx-auto w-full max-w-4xl px-5 py-16 text-center sm:px-8 sm:py-24">
          <p className="mb-5 text-xs font-semibold tracking-[0.16em] text-[var(--site-accent)] uppercase">
            Nuestra esencia
          </p>
          <p className="text-2xl leading-relaxed tracking-tight sm:text-3xl">{site.about}</p>
        </section>
      ) : null}

      <ServicesSection site={site} variant="minimal" />
      <ProductsSection site={site} variant="minimal" />
      <StaffSection site={site} variant="minimal" />

      {site.bookingEnabled ? (
        <section id="reservar" className="site-reveal bg-[var(--site-surface-alt)] py-16 sm:py-24">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
            <div>
              <p className="mb-4 text-xs font-semibold tracking-[0.16em] text-[var(--site-accent)] uppercase">
                Reserva online
              </p>
              <SectionTitle variant="minimal">Un tiempo para vos.</SectionTitle>
              <p className="mt-5 max-w-sm leading-relaxed text-[var(--site-muted)]">
                Elegí con tranquilidad el servicio, el día y la hora.
              </p>
            </div>
            <div className="min-w-0 rounded-[var(--site-radius)] bg-[var(--site-surface)] p-5 shadow-[var(--site-shadow)] sm:p-8">
              <BookingWidget site={site} />
            </div>
          </div>
        </section>
      ) : null}

      <HoursSection site={site} variant="minimal" />
      <ContactSection site={site} variant="minimal" />
      <SiteFooter site={site} />
    </div>
  );
}

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

/** Editorial hospitality: warm paper, wine red and an image framed like a portrait. */
export function ClasicoTemplate({ site }: { site: PublicSite }) {
  return (
    <div
      style={SITE_PALETTES.clasico}
      className="site-public min-h-screen scroll-smooth bg-[var(--site-bg)] text-[var(--site-text)] [font-family:var(--site-body-font)] selection:bg-[var(--site-accent)] selection:text-[var(--site-on-accent)]"
    >
      <header className="overflow-hidden border-b border-[var(--site-border)] bg-[var(--site-surface)]">
        <nav aria-label="Principal" className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <a href="#inicio" className="flex min-h-12 items-center gap-3 font-semibold">
            {site.logoUrl ? (
              <Image src={site.logoUrl} alt="" width={44} height={44} className="h-11 w-11 rounded-full border border-[var(--site-border)] object-cover" />
            ) : (
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[var(--site-accent)]" />
            )}
            <span className="max-w-48 truncate">{site.businessName}</span>
          </a>
          <div className="hidden items-center gap-7 text-sm text-[var(--site-muted)] sm:flex">
            {site.services.length ? <a href="#servicios" className="py-3 hover:text-[var(--site-text)]">Servicios</a> : null}
            <a href="#horarios" className="py-3 hover:text-[var(--site-text)]">Horarios</a>
            <a href="#contacto" className="py-3 hover:text-[var(--site-text)]">Contacto</a>
          </div>
        </nav>

        <div id="inicio" className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pt-8 pb-16 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:py-20">
          <div className="relative z-10 site-enter">
            <p className="mb-5 text-xs font-bold tracking-[0.24em] text-[var(--site-accent)] uppercase">Un momento para vos</p>
            <h1 className="max-w-3xl text-5xl leading-[0.96] font-normal tracking-[-0.045em] sm:text-7xl lg:text-[5.5rem]" style={{ fontFamily: "var(--site-heading-font)" }}>
              {site.businessName}
            </h1>
            {site.headline ? <p className="mt-7 max-w-xl text-lg leading-relaxed text-[var(--site-muted)] sm:text-xl">{site.headline}</p> : null}
            <BusinessStatus site={site} className="mt-5 text-[var(--site-muted)]" />
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {site.bookingEnabled ? <a href="#reservar" className="site-action inline-flex min-h-12 items-center rounded-full bg-[var(--site-accent)] px-6 text-sm font-bold text-[var(--site-on-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]">Reservar turno</a> : null}
              {site.services.length ? <a href="#servicios" className="site-action inline-flex min-h-12 items-center rounded-full border border-[var(--site-border)] px-6 text-sm font-semibold hover:bg-[var(--site-surface-alt)]">Ver servicios</a> : null}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md site-enter site-enter-delay-2 lg:mx-0 lg:ml-auto">
            <div aria-hidden="true" className="absolute -top-6 -right-8 h-32 w-32 rounded-full border border-[var(--site-border)]" />
            <div className="relative aspect-[4/5] overflow-hidden rounded-t-[12rem] rounded-b-[var(--site-radius)] bg-[var(--site-surface-alt)] shadow-[var(--site-shadow)]">
              {site.heroImageUrl ? <Image src={site.heroImageUrl} alt="" fill priority sizes="(max-width: 1024px) 100vw, 42vw" className="object-cover" /> : (
                <div className="flex h-full items-center justify-center p-12 text-center">
                  <span className="text-8xl text-[var(--site-accent)]" style={{ fontFamily: "var(--site-heading-font)" }}>{site.businessName.slice(0, 1).toUpperCase()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {site.about ? (
        <section className="site-reveal mx-auto grid w-full max-w-6xl gap-5 px-5 py-16 sm:px-8 md:grid-cols-[.4fr_1fr] md:py-24">
          <p className="text-xs font-bold tracking-[0.2em] text-[var(--site-accent)] uppercase">Nuestra esencia</p>
          <p className="max-w-3xl text-2xl leading-snug text-[var(--site-text)] sm:text-3xl" style={{ fontFamily: "var(--site-heading-font)" }}>{site.about}</p>
        </section>
      ) : null}

      <ServicesSection site={site} variant="clasico" />
      <StaffSection site={site} variant="clasico" />
      <ProductsSection site={site} variant="clasico" />

      {site.bookingEnabled ? (
        <section id="reservar" className="site-reveal border-y border-[var(--site-border)] bg-[var(--site-surface-alt)] py-16 sm:py-24">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:gap-16">
            <div>
              <p className="mb-4 text-xs font-bold tracking-[0.2em] text-[var(--site-accent)] uppercase">Tu próxima visita</p>
              <SectionTitle variant="clasico">Reservá con calma, vení a disfrutar.</SectionTitle>
              <p className="mt-5 max-w-sm leading-relaxed text-[var(--site-muted)]">Elegí el servicio y el horario que mejor te quede. Confirmaremos tu turno por celular.</p>
            </div>
            <div className="min-w-0 rounded-[var(--site-radius)] bg-[var(--site-surface)] p-5 shadow-[var(--site-shadow)] sm:p-8">
              <BookingWidget site={site} />
            </div>
          </div>
        </section>
      ) : null}

      <HoursSection site={site} variant="clasico" />
      <ContactSection site={site} variant="clasico" />
      <SiteFooter site={site} />
    </div>
  );
}

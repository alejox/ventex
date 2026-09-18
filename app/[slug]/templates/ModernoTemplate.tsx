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

/** Digital and energetic: bold type, cobalt depth and coral actions. */
export function ModernoTemplate({ site }: { site: PublicSite }) {
  return (
    <div
      style={SITE_PALETTES.moderno}
      className="site-public min-h-screen scroll-smooth bg-[var(--site-bg)] text-[var(--site-text)] [font-family:var(--site-body-font)] selection:bg-[var(--site-accent)] selection:text-[var(--site-on-accent)]"
    >
      <header className="relative overflow-hidden border-b border-[var(--site-border)]">
        <div aria-hidden="true" className="absolute -top-48 left-1/2 h-[34rem] w-[34rem] rounded-full bg-[var(--site-accent)] opacity-[0.12] blur-3xl" />
        <nav aria-label="Principal" className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <a href="#inicio" className="flex min-h-12 items-center gap-3 font-bold tracking-tight">
            {site.logoUrl ? <Image src={site.logoUrl} alt="" width={44} height={44} className="h-11 w-11 rounded-xl object-cover" /> : <span aria-hidden="true" className="h-3 w-3 rotate-45 bg-[var(--site-accent)]" />}
            <span className="max-w-52 truncate">{site.businessName}</span>
          </a>
          {site.bookingEnabled ? <a href="#reservar" className="inline-flex min-h-12 items-center rounded-full border border-[var(--site-border)] px-5 text-sm font-bold transition-colors hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]">Reservar</a> : null}
        </nav>

        <div id="inicio" className="relative mx-auto grid w-full max-w-7xl gap-8 px-5 pt-8 pb-16 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:items-end lg:py-20">
          <div className="site-enter">
            <div className="mb-8 flex items-center gap-3 text-xs font-bold tracking-[0.18em] text-[var(--site-accent)] uppercase"><span className="h-px w-10 bg-current" />Atención con reserva</div>
            <h1 className="max-w-4xl text-5xl leading-[0.92] font-extrabold tracking-[-0.065em] sm:text-7xl lg:text-[6.5rem]" style={{ fontFamily: "var(--site-heading-font)" }}>{site.businessName}</h1>
            {site.headline ? <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[var(--site-muted)] sm:text-xl">{site.headline}</p> : null}
            <BusinessStatus site={site} className="mt-5 text-[var(--site-muted)]" />
            <div className="mt-8 flex flex-wrap gap-3">
              {site.bookingEnabled ? <a href="#reservar" className="site-action inline-flex min-h-12 items-center rounded-full bg-[var(--site-accent)] px-6 text-sm font-extrabold text-[var(--site-on-accent)]">Elegir un horario</a> : null}
              {site.services.length ? <a href="#servicios" className="site-action inline-flex min-h-12 items-center rounded-full bg-[var(--site-surface)] px-6 text-sm font-bold">Explorar servicios</a> : null}
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-2 border-t border-[var(--site-border)] pt-5">
              <div><dt className="text-xs text-[var(--site-muted)]">Servicios</dt><dd className="mt-1 text-2xl font-extrabold">{site.services.length}</dd></div>
              <div className="border-l border-[var(--site-border)] pl-5"><dt className="text-xs text-[var(--site-muted)]">Profesionales</dt><dd className="mt-1 text-2xl font-extrabold">{site.staff.length}</dd></div>
            </dl>
          </div>
          <div className="relative min-h-80 overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] shadow-[var(--site-shadow)] site-enter site-enter-delay-2 sm:min-h-[34rem]">
            {site.heroImageUrl ? <Image src={site.heroImageUrl} alt="" fill priority sizes="(max-width: 1024px) 100vw, 46vw" className="object-cover" /> : <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,var(--site-surface),var(--site-surface-alt))]"><span className="text-[11rem] font-black leading-none text-[var(--site-accent)] opacity-90">{site.businessName.slice(0, 1).toUpperCase()}</span></div>}
            <div className="absolute right-4 bottom-4 left-4 rounded-2xl border border-white/15 bg-[var(--site-bg)]/85 p-4 text-sm text-white backdrop-blur-md sm:right-auto sm:w-72">
              <p className="font-bold">Tu turno, sin llamadas.</p><p className="mt-1 text-white/70">Elegí servicio, profesional y hora en pocos pasos.</p>
            </div>
          </div>
        </div>
      </header>

      {site.about ? <section className="site-reveal mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-24"><p className="max-w-4xl text-2xl leading-snug font-semibold tracking-tight sm:text-4xl">{site.about}</p></section> : null}
      <ServicesSection site={site} variant="moderno" />
      <StaffSection site={site} variant="moderno" />
      <ProductsSection site={site} variant="moderno" />

      {site.bookingEnabled ? <section id="reservar" className="site-reveal border-y border-[var(--site-border)] bg-[var(--site-surface-alt)] py-16 sm:py-24"><div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[.7fr_1.3fr] lg:gap-16"><div><p className="mb-4 text-xs font-bold tracking-[0.18em] text-[var(--site-accent)] uppercase">Agenda online</p><SectionTitle variant="moderno">Elegí tu próximo turno.</SectionTitle><p className="mt-5 max-w-sm leading-relaxed text-[var(--site-muted)]">Disponibilidad real para que reserves cuando quieras.</p></div><div className="min-w-0 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-bg)] p-5 shadow-[var(--site-shadow)] sm:p-8"><BookingWidget site={site} /></div></div></section> : null}

      <HoursSection site={site} variant="moderno" />
      <ContactSection site={site} variant="moderno" />
      <SiteFooter site={site} />

      {site.bookingEnabled ? (
        <a
          href="#reservar"
          className="site-action fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 rounded-full bg-[var(--site-accent)] px-6 py-3.5 text-center text-sm font-bold text-[var(--site-on-accent)] shadow-lg lg:hidden"
        >
          Reservar turno
        </a>
      ) : null}
    </div>
  );
}

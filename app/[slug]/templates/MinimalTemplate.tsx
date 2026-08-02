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

/** White, square edges, a lot of air: left-aligned type and nothing else. */
export function MinimalTemplate({ site }: { site: PublicSite }) {
  return (
    <div
      style={SITE_PALETTES.minimal}
      className="min-h-screen bg-[var(--site-bg)] text-[var(--site-text)]"
    >
      <header className="mx-auto w-full max-w-3xl px-5 pt-20 pb-10">
        {site.logoUrl ? (
          <Image
            src={site.logoUrl}
            alt={site.businessName}
            width={56}
            height={56}
            className="mb-8 h-14 w-14 object-contain"
          />
        ) : null}
        <h1
          className="text-3xl font-medium tracking-tight sm:text-4xl"
          style={{ fontFamily: "var(--site-heading-font)" }}
        >
          {site.businessName}
        </h1>
        {site.headline ? (
          <p className="mt-4 max-w-xl text-base text-[var(--site-muted)]">{site.headline}</p>
        ) : null}
        {site.about ? (
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-[var(--site-muted)]">
            {site.about}
          </p>
        ) : null}

        <nav className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {site.services.length ? (
            <a href="#servicios" className="text-[var(--site-muted)] underline underline-offset-4">
              Servicios
            </a>
          ) : null}
          {site.products.length ? (
            <a href="#productos" className="text-[var(--site-muted)] underline underline-offset-4">
              Productos
            </a>
          ) : null}
          <a href="#horarios" className="text-[var(--site-muted)] underline underline-offset-4">
            Horarios
          </a>
          {site.bookingEnabled ? (
            <a href="#reservar" className="font-medium text-[var(--site-text)] underline underline-offset-4">
              Reservar
            </a>
          ) : null}
        </nav>
      </header>

      <div className="mx-auto w-full max-w-3xl border-t border-[var(--site-border)]" />

      <ServicesSection site={site} />
      <ProductsSection site={site} />
      <StaffSection site={site} />

      {site.bookingEnabled ? (
        <section id="reservar" className="mx-auto w-full max-w-xl px-5 py-14">
          <SectionTitle>Reservar</SectionTitle>
          <div className="mt-6">
            <BookingWidget site={site} />
          </div>
        </section>
      ) : null}

      <HoursSection site={site} />
      <ContactSection site={site} />
      <SiteFooter site={site} />
    </div>
  );
}

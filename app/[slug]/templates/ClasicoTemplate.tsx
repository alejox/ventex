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

/** Warm, traditional: serif headings, earth tones, centered hero. */
export function ClasicoTemplate({ site }: { site: PublicSite }) {
  return (
    <div
      style={SITE_PALETTES.clasico}
      className="min-h-screen bg-[var(--site-bg)] text-[var(--site-text)]"
    >
      <header className="border-b border-[var(--site-border)] bg-[var(--site-surface)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-5 py-14 text-center">
          {site.logoUrl ? (
            <Image
              src={site.logoUrl}
              alt={site.businessName}
              width={80}
              height={80}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : null}
          <h1
            className="text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ fontFamily: "var(--site-heading-font)" }}
          >
            {site.businessName}
          </h1>
          {site.headline ? (
            <p className="max-w-xl text-base text-[var(--site-muted)]">{site.headline}</p>
          ) : null}
          {site.bookingEnabled ? (
            <a
              href="#reservar"
              className="mt-2 rounded-[var(--site-radius)] bg-[var(--site-accent)] px-6 py-3 text-sm font-semibold text-[var(--site-on-accent)]"
            >
              Reservar turno
            </a>
          ) : null}
        </div>
      </header>

      {site.about ? (
        <section className="mx-auto w-full max-w-3xl px-5 py-14 text-center">
          <p className="text-lg leading-relaxed text-[var(--site-muted)]">{site.about}</p>
        </section>
      ) : null}

      <ServicesSection site={site} />
      <StaffSection site={site} />
      <ProductsSection site={site} />

      {site.bookingEnabled ? (
        <section id="reservar" className="bg-[var(--site-surface-alt)] py-14">
          <div className="mx-auto w-full max-w-xl px-5">
            <SectionTitle>Reservá tu turno</SectionTitle>
            <div className="mt-6">
              <BookingWidget site={site} />
            </div>
          </div>
        </section>
      ) : null}

      <HoursSection site={site} />
      <ContactSection site={site} />
      <SiteFooter site={site} />
    </div>
  );
}

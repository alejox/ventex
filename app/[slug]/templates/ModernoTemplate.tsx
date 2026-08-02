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
} from "./SiteSections";
import { SITE_PALETTES } from "./theme";

/** Dark, high contrast, lime accent: split hero with the booking form up front. */
export function ModernoTemplate({ site }: { site: PublicSite }) {
  return (
    <div
      style={SITE_PALETTES.moderno}
      className="min-h-screen bg-[var(--site-bg)] text-[var(--site-text)]"
    >
      <header className="relative overflow-hidden border-b border-[var(--site-border)]">
        {site.heroImageUrl ? (
          <Image
            src={site.heroImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-25"
          />
        ) : null}

        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="flex flex-col justify-center">
            {site.logoUrl ? (
              <Image
                src={site.logoUrl}
                alt={site.businessName}
                width={64}
                height={64}
                className="mb-5 h-16 w-16 rounded-2xl object-cover"
              />
            ) : null}
            <h1
              className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl"
              style={{ fontFamily: "var(--site-heading-font)" }}
            >
              {site.businessName}
            </h1>
            {site.headline ? (
              <p className="mt-5 max-w-lg text-lg text-[var(--site-muted)]">{site.headline}</p>
            ) : null}
            {site.about ? (
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--site-muted)]">
                {site.about}
              </p>
            ) : null}
          </div>

          {site.bookingEnabled ? (
            <div
              id="reservar"
              // min-w-0: un hijo de grid arranca con `min-width: auto`, así que
              // la tira de días —que debe scrollear— estiraba la columna entera
              // y sacaba el formulario fuera de pantalla en vez de desbordarse
              // ella sola.
              className="min-w-0 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6"
            >
              <h2 className="mb-5 text-lg font-bold">Reservá tu turno</h2>
              <BookingWidget site={site} />
            </div>
          ) : null}
        </div>
      </header>

      <ServicesSection site={site} />
      <StaffSection site={site} />
      <ProductsSection site={site} />
      <HoursSection site={site} />
      <ContactSection site={site} />
      <SiteFooter site={site} />

      {/* The form sits at the very top here, so the mobile CTA scrolls back up. */}
      {site.bookingEnabled ? (
        <a
          href="#reservar"
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 rounded-full bg-[var(--site-accent)] px-6 py-3.5 text-center text-sm font-bold text-[var(--site-on-accent)] shadow-lg lg:hidden"
        >
          Reservar turno
        </a>
      ) : null}
    </div>
  );
}

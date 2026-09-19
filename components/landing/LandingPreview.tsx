"use client";

import type { CSSProperties } from "react";
import type { BusinessHour } from "@/services/business-site.service";
import type { LandingConfig, PublicSite } from "@/services/public-site.types";
import { SiteTemplateRenderer } from "@/app/[slug]/templates/registry";

const SAMPLE_SERVICES = [
  { id: "preview-1", name: "Servicio insignia", description: "Una experiencia creada alrededor de vos.", price: 45000, durationMinutes: 45, icon: null },
  { id: "preview-2", name: "Cuidado completo", description: "Atención profesional y resultados visibles.", price: 70000, durationMinutes: 60, icon: null },
  { id: "preview-3", name: "Ritual express", description: "El toque justo cuando tenés poco tiempo.", price: 30000, durationMinutes: 30, icon: null },
];

export function LandingPreview({
  config,
  hours,
  businessName,
  logoUrl,
  bookingEnabled,
  device,
}: {
  config: LandingConfig;
  hours: BusinessHour[];
  businessName: string;
  logoUrl: string | null;
  bookingEnabled: boolean;
  device: "desktop" | "mobile";
}) {
  const site: PublicSite = {
    slug: "vista-previa",
    template: config.template,
    businessName: businessName || "Tu negocio",
    businessType: null,
    headline: config.hero.description,
    about: config.about.description,
    heroImageUrl: config.hero.imageUrl,
    logoUrl,
    ...config.contact,
    bookingEnabled,
    timezone: "America/Bogota",
    hours: hours.map((hour) => ({ weekday: hour.weekday, isOpen: hour.is_open, opensAt: hour.opens_at, closesAt: hour.closes_at })),
    services: SAMPLE_SERVICES,
    products: [
      { id: "product-1", name: "Producto recomendado", price: 35000, imageUrl: null, icon: "✦", unit: "Unidad", inStock: true },
      { id: "product-2", name: "Cuidado en casa", price: 52000, imageUrl: null, icon: "✦", unit: "Unidad", inStock: true },
    ],
    staff: [
      { id: "staff-1", fullName: "Andrea", role: "Especialista" },
      { id: "staff-2", fullName: "Camilo", role: "Profesional" },
    ],
    config,
  };
  const width = device === "mobile" ? 390 : 1280;
  const zoom = device === "mobile" ? 0.82 : 0.56;

  return (
    <div className="h-full min-h-[640px] overflow-auto bg-surface-container-low p-4 sm:p-6">
      <div className="mx-auto overflow-hidden rounded-2xl border border-outline-variant/30 bg-white shadow-xl" style={{ width: width * zoom }}>
        <div style={{ width, zoom } as CSSProperties}>
          <SiteTemplateRenderer site={site} preview />
        </div>
      </div>
    </div>
  );
}

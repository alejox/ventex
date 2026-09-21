"use client";

import type { BusinessHour } from "@/services/business-site.service";
import type { LandingConfig, PublicSite } from "@/services/public-site.types";
import { SiteTemplateRenderer } from "@/app/[slug]/templates/registry";
import { PreviewFrame } from "./PreviewFrame";

const SAMPLE_SERVICES = [
  { id: "preview-1", name: "Servicio insignia", description: "Una experiencia creada alrededor de vos.", price: 45000, durationMinutes: 45, icon: null, imageUrl: null },
  { id: "preview-2", name: "Cuidado completo", description: "Atención profesional y resultados visibles.", price: 70000, durationMinutes: 60, icon: null, imageUrl: null },
  { id: "preview-3", name: "Ritual express", description: "El toque justo cuando tenés poco tiempo.", price: 30000, durationMinutes: 30, icon: null, imageUrl: null },
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
      { id: "staff-1", fullName: "Andrea", role: "Especialista", photoUrl: null },
      { id: "staff-2", fullName: "Camilo", role: "Profesional", photoUrl: null },
    ],
    config,
  };
  const width = device === "mobile" ? 390 : 1280;
  const scale = device === "mobile" ? 0.82 : 0.56;

  return (
    <div className="h-full bg-surface-container-low">
      {/*
        * `key` por dispositivo: al cambiar de móvil a escritorio se monta un
        * iframe nuevo en vez de reusar el anterior. Un viewport no se
        * redimensiona a medias — el documento de adentro tiene que volver a
        * evaluar sus media queries desde cero.
        */}
      <PreviewFrame
        key={device}
        width={width}
        scale={scale}
        title={`Vista previa ${device === "mobile" ? "móvil" : "de escritorio"}`}
      >
        <SiteTemplateRenderer site={site} preview />
      </PreviewFrame>
    </div>
  );
}

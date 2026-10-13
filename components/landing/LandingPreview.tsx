"use client";

import type { BusinessHour } from "@/services/business-site.service";
import type { LandingConfig, PublicSite } from "@/services/public-site.types";
import { SiteTemplateRenderer } from "@/app/[slug]/templates/registry";
import { PreviewFrame } from "./PreviewFrame";
import { useSettingsStore } from "@/stores/settings.store";
import { useEffect } from "react";

const SAMPLE_SERVICES = [
  { id: "preview-1", name: "Servicio insignia", description: "Una experiencia creada alrededor de ti.", price: 45000, durationMinutes: 45, icon: null, imageUrl: null },
  { id: "preview-2", name: "Cuidado completo", description: "Atención profesional y resultados visibles.", price: 70000, durationMinutes: 60, icon: null, imageUrl: null },
  { id: "preview-3", name: "Ritual express", description: "El toque justo cuando tienes poco tiempo.", price: 30000, durationMinutes: 30, icon: null, imageUrl: null },
];

/**
 * Catálogo de muestra de una tienda: con categorías, un agotado y un WhatsApp
 * de ejemplo, para que la vista previa enseñe los filtros y el botón de pedido
 * aunque el dueño todavía no haya cargado nada.
 */
const SAMPLE_STORE_CATEGORIES = [
  { id: "preview-cat-1", name: "Despensa" },
  { id: "preview-cat-2", name: "Bebidas" },
  { id: "preview-cat-3", name: "Aseo" },
];
const SAMPLE_STORE_PRODUCTS = [
  { id: "product-1", name: "Arroz premium 1 kg", price: 5200, imageUrl: null, icon: "🍚", unit: "Unidad", categoryId: "preview-cat-1", inStock: true },
  { id: "product-2", name: "Café molido 500 g", price: 18900, imageUrl: null, icon: "☕", unit: "Unidad", categoryId: "preview-cat-1", inStock: true },
  { id: "product-3", name: "Jugo de naranja", price: 6500, imageUrl: null, icon: "🧃", unit: "Unidad", categoryId: "preview-cat-2", inStock: true },
  { id: "product-4", name: "Agua con gas", price: 2800, imageUrl: null, icon: "💧", unit: "Unidad", categoryId: "preview-cat-2", inStock: false },
  { id: "product-5", name: "Jabón de loza", price: 4300, imageUrl: null, icon: "🧽", unit: "Unidad", categoryId: "preview-cat-3", inStock: true },
  { id: "product-6", name: "Papel higiénico x4", price: 9800, imageUrl: null, icon: "🧻", unit: "Unidad", categoryId: "preview-cat-3", inStock: true },
];
const SAMPLE_WHATSAPP = "3001234567";

export function LandingPreview({
  config,
  hours,
  businessName,
  businessType = null,
  logoUrl,
  bookingEnabled,
  device,
}: {
  config: LandingConfig;
  hours: BusinessHour[];
  businessName: string;
  businessType?: string | null;
  logoUrl: string | null;
  bookingEnabled: boolean;
  device: "desktop" | "mobile";
}) {
  const timeFormat = useSettingsStore((s) => s.settings?.time_format ?? "12");
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  useEffect(() => { void fetchSettings(); }, [fetchSettings]);
  const isStore = businessType === "tienda";
  const site: PublicSite = {
    timeFormat,
    slug: "vista-previa",
    template: config.template,
    businessName: businessName || "Tu negocio",
    businessType,
    headline: config.hero.description,
    about: config.about.description,
    heroImageUrl: config.hero.imageUrl,
    logoUrl,
    ...config.contact,
    // Una tienda sin WhatsApp no ofrece pedir: la muestra usa uno de ejemplo.
    whatsapp: isStore ? config.contact.whatsapp ?? SAMPLE_WHATSAPP : config.contact.whatsapp,
    bookingEnabled,
    timezone: "America/Bogota",
    hours: hours.map((hour) => ({ weekday: hour.weekday, isOpen: hour.is_open, opensAt: hour.opens_at, closesAt: hour.closes_at })),
    services: SAMPLE_SERVICES,
    products: isStore ? SAMPLE_STORE_PRODUCTS : [
      { id: "product-1", name: "Producto recomendado", price: 35000, imageUrl: null, icon: "✦", unit: "Unidad", categoryId: null, inStock: true },
      { id: "product-2", name: "Cuidado en casa", price: 52000, imageUrl: null, icon: "✦", unit: "Unidad", categoryId: null, inStock: true },
    ],
    categories: isStore ? SAMPLE_STORE_CATEGORIES : [],
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

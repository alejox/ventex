"use client";

import { useEffect } from "react";
import { useBusinessSiteStore } from "@/stores/business-site.store";
import { useSettingsStore } from "@/stores/settings.store";
import { emptySiteInput, slugify, toSiteInput } from "@/services/business-site.service";
import { LandingEditor } from "@/components/landing/LandingEditor";

export default function LandingPage() {
  const site = useBusinessSiteStore((state) => state.site);
  const hours = useBusinessSiteStore((state) => state.hours);
  const loaded = useBusinessSiteStore((state) => state.loaded);
  const fetchConfig = useBusinessSiteStore((state) => state.fetchConfig);
  const settings = useSettingsStore((state) => state.settings);
  const fetchSettings = useSettingsStore((state) => state.fetchSettings);

  useEffect(() => {
    void fetchConfig();
    void fetchSettings();
  }, [fetchConfig, fetchSettings]);

  if (!loaded) return <div className="grid min-h-64 place-items-center text-sm text-on-surface-variant">Cargando editor…</div>;

  const businessName = settings?.business_profile?.businessName?.trim() || "Tu negocio";
  const initial = site ? toSiteInput(site) : { ...emptySiteInput(), slug: slugify(businessName) };

  return (
    <LandingEditor
      key={site?.id ?? "new-landing"}
      initial={initial}
      initialHours={hours}
      initialPublished={site?.published ?? false}
      currentSlug={site?.slug}
      businessName={businessName}
      logoUrl={settings?.business_profile?.logoUrl ?? null}
    />
  );
}

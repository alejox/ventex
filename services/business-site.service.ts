import { createClient } from "@/utils/supabase/client";
import { getSelectedWorkspaceId } from "@/services/workspace.service";
import type { Json } from "@/utils/supabase/database.types";
import {
  defaultLandingConfig,
  normalizeLandingConfig,
} from "@/services/public-site.types";
import type { LandingConfig } from "@/services/public-site.types";

export interface BusinessSite {
  id: string;
  slug: string;
  published: boolean;
  booking_enabled: boolean;
  timezone: string;
  slot_interval_minutes: number;
  draft_config: LandingConfig;
  published_config: LandingConfig | null;
}

export interface BusinessHour {
  weekday: number;
  is_open: boolean;
  /** "HH:MM"; PostgREST returns time columns with seconds. */
  opens_at: string;
  closes_at: string;
}

export interface SiteConfig {
  site: BusinessSite | null;
  hours: BusinessHour[];
}

export interface SiteInput {
  slug: string;
  booking_enabled: boolean;
  timezone: string;
  slot_interval_minutes: number;
  draft_config: LandingConfig;
}

const SITE_SELECT =
  "id, slug, published, booking_enabled, timezone, slot_interval_minutes, draft_config, published_config";
const SITE_IMAGES_BUCKET = "site-images";

export function defaultHours(): BusinessHour[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    is_open: weekday !== 0,
    opens_at: "09:00",
    closes_at: "19:00",
  }));
}

export function emptySiteInput(): SiteInput {
  return {
    slug: "",
    booking_enabled: true,
    timezone: "America/Bogota",
    slot_interval_minutes: 30,
    draft_config: defaultLandingConfig(),
  };
}

export function toSiteInput(site: BusinessSite): SiteInput {
  return {
    slug: site.slug,
    booking_enabled: site.booking_enabled,
    timezone: site.timezone,
    slot_interval_minutes: site.slot_interval_minutes,
    draft_config: site.draft_config,
  };
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function mapSite(raw: Record<string, unknown>): BusinessSite {
  return {
    id: raw.id as string,
    slug: raw.slug as string,
    published: raw.published as boolean,
    booking_enabled: raw.booking_enabled as boolean,
    timezone: raw.timezone as string,
    slot_interval_minutes: raw.slot_interval_minutes as number,
    draft_config: normalizeLandingConfig(raw.draft_config),
    published_config: raw.published_config
      ? normalizeLandingConfig(raw.published_config)
      : null,
  };
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const supabase = createClient();
  const [siteResult, hoursResult] = await Promise.all([
    supabase.from("business_sites").select(SITE_SELECT).maybeSingle(),
    supabase
      .from("business_hours")
      .select("weekday, is_open, opens_at, closes_at")
      .order("weekday"),
  ]);
  if (siteResult.error) throw siteResult.error;
  if (hoursResult.error) throw hoursResult.error;

  const hours = (hoursResult.data ?? []).map((hour) => ({
    ...hour,
    opens_at: hour.opens_at.slice(0, 5),
    closes_at: hour.closes_at.slice(0, 5),
  })) as BusinessHour[];
  return {
    site: siteResult.data
      ? mapSite(siteResult.data as unknown as Record<string, unknown>)
      : null,
    hours: hours.length ? hours : defaultHours(),
  };
}

export async function saveSite(input: SiteInput): Promise<BusinessSite> {
  const supabase = createClient();
  const payload = {
    slug: slugify(input.slug),
    booking_enabled: input.booking_enabled,
    timezone: input.timezone,
    slot_interval_minutes: input.slot_interval_minutes,
    draft_config: normalizeLandingConfig(input.draft_config) as unknown as Json,
  };
  const { data, error } = await supabase
    .from("business_sites")
    .upsert(payload, { onConflict: "user_id" })
    .select(SITE_SELECT)
    .single();
  if (error) throw error;
  return mapSite(data as unknown as Record<string, unknown>);
}

export async function saveHours(hours: BusinessHour[]): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("business_hours")
    .upsert(hours, { onConflict: "user_id,weekday" });
  if (error) throw error;
}

export async function setSitePublished(published: boolean): Promise<BusinessSite> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("set_business_site_published", {
    p_published: published,
  });
  if (error) throw error;
  return mapSite(data as unknown as Record<string, unknown>);
}

export async function isSlugAvailable(slug: string, currentSlug?: string): Promise<boolean> {
  if (currentSlug && slug.toLowerCase() === currentSlug.toLowerCase()) return true;
  const supabase = createClient();
  const { data, error } = await supabase.rpc("public_site_slug_taken", {
    p_slug: slug,
  });
  if (error) throw error;
  return data === false;
}

export async function uploadSiteImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Elegí un archivo de imagen.");
  if (file.size > 8 * 1024 * 1024) throw new Error("La imagen no puede superar 8 MB.");

  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  if (!allowed.has(file.type)) throw new Error("Usá una imagen JPG, PNG, WebP o AVIF.");

  const supabase = createClient();
  const workspaceId = await getSelectedWorkspaceId();
  const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
  const path = `${workspaceId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(SITE_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from(SITE_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

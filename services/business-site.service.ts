import { createClient } from "@/utils/supabase/client";
import type { SiteTemplate } from "@/services/public-site.types";

/** Owner-side configuration of the public micro-site. RLS scopes every row. */

export interface BusinessSite {
  id: string;
  slug: string;
  template: SiteTemplate;
  published: boolean;
  booking_enabled: boolean;
  headline: string | null;
  about: string | null;
  hero_image_url: string | null;
  whatsapp: string | null;
  address: string | null;
  /**
   * Social handles are stored exactly as typed (`@shop`, a full URL, …). The
   * link is built at render time by `lib/socialLinks.ts`.
   */
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  twitter: string | null;
  linkedin: string | null;
  telegram: string | null;
  website: string | null;
  timezone: string;
  slot_interval_minutes: number;
}

export interface BusinessHour {
  weekday: number;
  is_open: boolean;
  /** "HH:MM" — the column is `time`, PostgREST hands it back as "HH:MM:SS". */
  opens_at: string;
  closes_at: string;
}

export interface SiteConfig {
  site: BusinessSite | null;
  hours: BusinessHour[];
}

export type SiteInput = Omit<BusinessSite, "id">;

/** Drops the server-owned `id` so a stored row can be fed back into a form. */
export function toSiteInput(site: BusinessSite): SiteInput {
  return {
    slug: site.slug,
    template: site.template,
    published: site.published,
    booking_enabled: site.booking_enabled,
    headline: site.headline,
    about: site.about,
    hero_image_url: site.hero_image_url,
    whatsapp: site.whatsapp,
    address: site.address,
    instagram: site.instagram,
    facebook: site.facebook,
    tiktok: site.tiktok,
    youtube: site.youtube,
    twitter: site.twitter,
    linkedin: site.linkedin,
    telegram: site.telegram,
    website: site.website,
    timezone: site.timezone,
    slot_interval_minutes: site.slot_interval_minutes,
  };
}

const SITE_SELECT =
  "id, slug, template, published, booking_enabled, headline, about, hero_image_url, whatsapp, address, instagram, facebook, tiktok, youtube, twitter, linkedin, telegram, website, timezone, slot_interval_minutes";

/** Mon–Sat open 09–19, Sunday closed: the shape most shops start from. */
export function defaultHours(): BusinessHour[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    is_open: weekday !== 0,
    opens_at: "09:00",
    closes_at: "19:00",
  }));
}

/** "Barbería  Lebarb!" -> "barberia-lebarb", the shape the CHECK constraint wants. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    // NFD split the accents off; drop them. Uses the Unicode property escape
    // rather than a combining-marks character class, because those code points
    // are invisible in an editor and read like a typo.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function toHhMm(value: string): string {
  return value.slice(0, 5);
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

  const hours = (hoursResult.data ?? []).map((h) => ({
    ...h,
    opens_at: toHhMm(h.opens_at),
    closes_at: toHhMm(h.closes_at),
  })) as BusinessHour[];

  return {
    site: (siteResult.data as BusinessSite | null) ?? null,
    hours: hours.length ? hours : defaultHours(),
  };
}

/**
 * Creates or updates the tenant's site row.
 *
 * `user_id` is deliberately absent: the column defaults to
 * `get_effective_user_id()` and the RLS policy re-checks it, so the tenant can
 * never be forged from the client.
 */
export async function saveSite(input: SiteInput): Promise<BusinessSite> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("business_sites")
    .upsert({ ...input, slug: input.slug.toLowerCase() }, { onConflict: "user_id" })
    .select(SITE_SELECT)
    .single();

  if (error) throw error;
  return data as BusinessSite;
}

export async function saveHours(hours: BusinessHour[]): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("business_hours")
    .upsert(hours, { onConflict: "user_id,weekday" });

  if (error) throw error;
}

/**
 * Whether a slug is free.
 *
 * Uses `public_site_slug_taken` and not a SELECT: RLS only shows the tenant its
 * own row, so a slug already claimed by another business — published or not —
 * would look free from here and only fail against the unique index on save.
 *
 * That index stays the real authority; this call exists so the owner finds out
 * before pressing save rather than after.
 */
export async function isSlugAvailable(slug: string, currentSlug?: string): Promise<boolean> {
  if (currentSlug && slug.toLowerCase() === currentSlug.toLowerCase()) return true;

  const supabase = createClient();

  const { data, error } = await supabase.rpc("public_site_slug_taken", { p_slug: slug });
  if (error) throw error;

  return data === false;
}

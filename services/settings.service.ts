import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de ajustes (config por cuenta) ----
export interface BusinessProfile {
  logoUrl?: string;
  personType?: "natural" | "juridica";
  identificationType?: string;
  identificationNumber?: string;
  dv?: string;
  nationalityType?: string;
  firstName?: string;
  secondName?: string;
  lastName?: string;
  businessName?: string;
  taxResponsibility?: string;
  municipality?: string;
  address?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
  website?: string;
  sector?: string;
  decimalPrecision?: string;
  decimalSeparator?: string;
}

export interface Settings {
  id: string | null;
  tax_rate: number;
  currency: string;
  business_profile: BusinessProfile;
}

export interface SettingsInput {
  tax_rate: number;
  currency: string;
  business_profile?: BusinessProfile;
}

const DEFAULTS: Settings = {
  id: null,
  tax_rate: 0.19,
  currency: "COP",
  business_profile: {},
};

const BUSINESS_LOGOS_BUCKET = "business-logos";

/**
 * Sube el logo del negocio al bucket `business-logos` bajo la carpeta del usuario
 * (`${user_id}/...`, exigido por las políticas RLS) y devuelve su URL pública.
 */
export async function uploadBusinessLogo(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión activa");

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUSINESS_LOGOS_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUSINESS_LOGOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Devuelve la llave de la tienda (business_key) del dueño autenticado, o null si aún no tiene. */
export async function fetchBusinessKey(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión activa");

  const { data, error } = await supabase
    .from("profiles")
    .select("business_key")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.business_key ?? null;
}

/** Formato aceptado para una llave personalizada: 4–20 caracteres, letras y números. */
export const BUSINESS_KEY_PATTERN = /^[A-Z0-9]{4,20}$/;

/** Normaliza una llave a la forma canónica almacenada (mayúsculas, sin espacios). */
export function normalizeBusinessKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Guarda una llave de la tienda escrita por el dueño. Valida el formato y respeta el
 * índice único: si la llave ya la usa otro negocio, lanza un error legible.
 * Devuelve la llave normalizada guardada.
 */
export async function setBusinessKey(raw: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión activa");

  const key = normalizeBusinessKey(raw);
  if (!BUSINESS_KEY_PATTERN.test(key)) {
    throw new Error("La llave debe tener entre 4 y 20 caracteres, solo letras y números (sin espacios).");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ business_key: key })
    .eq("id", user.id);
  if (error) {
    if (error.code === "23505") {
      throw new Error("Esa llave ya está en uso por otro negocio. Elige una diferente.");
    }
    throw error;
  }

  return key;
}

/**
 * Genera una nueva llave de la tienda (vía `generate_business_key()`), la guarda en el
 * perfil del dueño y devuelve el valor nuevo. Invalida cualquier llave anterior.
 */
export async function regenerateBusinessKey(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión activa");

  const { data: key, error: genErr } = await supabase.rpc("generate_business_key");
  if (genErr) throw genErr;
  if (!key) throw new Error("No se pudo generar la llave");

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ business_key: key })
    .eq("id", user.id);
  if (updErr) throw updErr;

  return key;
}

/** Devuelve los ajustes de la cuenta (o valores por defecto si aún no existe la fila). */
export async function fetchSettings(): Promise<Settings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("id, tax_rate, currency, business_profile")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULTS, business_profile: {} };
  return {
    id: data.id,
    tax_rate: data.tax_rate,
    currency: data.currency,
    business_profile: (data.business_profile ?? {}) as BusinessProfile,
  };
}

/** Crea o actualiza la (única) fila de ajustes del usuario. */
export async function saveSettings(input: SettingsInput): Promise<Settings> {
  const supabase = createClient();
  const { data: existing, error: readErr } = await supabase
    .from("settings")
    .select("id")
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing?.id) {
    const { data, error } = await supabase
      .from("settings")
      .update({
        tax_rate: input.tax_rate,
        currency: input.currency,
        ...(input.business_profile ? { business_profile: input.business_profile as never } : {}),
      } as never)
      .eq("id", existing.id)
      .select("id, tax_rate, currency, business_profile")
      .single();
    if (error) throw error;
    return data as unknown as Settings;
  }

  const { data, error } = await supabase
    .from("settings")
    .insert({
      tax_rate: input.tax_rate,
      currency: input.currency,
      ...(input.business_profile ? { business_profile: input.business_profile as never } : {}),
    } as never)
    .select("id, tax_rate, currency, business_profile")
    .single();
  if (error) throw error;
  return data as unknown as Settings;
}

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

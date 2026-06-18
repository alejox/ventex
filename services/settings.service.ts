import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de ajustes (config por cuenta) ----
export interface Settings {
  id: string | null;
  tax_rate: number; // tasa, ej. 0.16 = 16%
  currency: string;
}

export interface SettingsInput {
  tax_rate: number; // tasa, ej. 0.16
  currency: string;
}

const DEFAULTS: Settings = { id: null, tax_rate: 0.16, currency: "MXN" };

/** Devuelve los ajustes de la cuenta (o valores por defecto si aún no existe la fila). */
export async function fetchSettings(): Promise<Settings> {
  const supabase = createClient();
  const { data, error } = await supabase.from("settings").select("id, tax_rate, currency").maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULTS };
  return { id: data.id, tax_rate: data.tax_rate, currency: data.currency };
}

/** Crea o actualiza la (única) fila de ajustes del usuario. */
export async function saveSettings(input: SettingsInput): Promise<Settings> {
  const supabase = createClient();
  const { data: existing, error: readErr } = await supabase.from("settings").select("id").maybeSingle();
  if (readErr) throw readErr;

  if (existing?.id) {
    const { data, error } = await supabase
      .from("settings")
      .update({ tax_rate: input.tax_rate, currency: input.currency })
      .eq("id", existing.id)
      .select("id, tax_rate, currency")
      .single();
    if (error) throw error;
    return data as Settings;
  }

  // Sin fila previa: insert (user_id lo asigna el trigger set_settings_user_id).
  const { data, error } = await supabase
    .from("settings")
    .insert({ tax_rate: input.tax_rate, currency: input.currency })
    .select("id, tax_rate, currency")
    .single();
  if (error) throw error;
  return data as Settings;
}

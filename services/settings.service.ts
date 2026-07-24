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
  /** Si el negocio desglosa IVA (responsable de IVA). */
  include_tax: boolean;
  /** Si el POS puede cobrar más unidades de las que hay en stock. */
  allow_oversell: boolean;
  /** Si el negocio cobra con tarjeta. false = ni siquiera se ofrece el medio. */
  accepts_card: boolean;
  /** Si el negocio cobra por transferencia. false = ni siquiera se ofrece. */
  accepts_transfer: boolean;
  currency: string;
  transfer_methods_enabled: string[];
  /** Medios de tarjeta habilitados (Bold, Credibanco, Redeban…). */
  card_methods_enabled: string[];
  business_profile: BusinessProfile;
}

export interface SettingsInput {
  tax_rate: number;
  include_tax: boolean;
  allow_oversell: boolean;
  accepts_card?: boolean;
  accepts_transfer?: boolean;
  currency: string;
  transfer_methods_enabled?: string[];
  card_methods_enabled?: string[];
  business_profile?: BusinessProfile;
}

const DEFAULTS: Settings = {
  id: null,
  tax_rate: 0.19,
  include_tax: true,
  allow_oversell: true,
  accepts_card: true,
  accepts_transfer: true,
  currency: "COP",
  transfer_methods_enabled: ["nequi", "daviplata", "bancolombia"],
  card_methods_enabled: ["bold", "credibanco", "redeban"],
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

/** Una sola lista de columnas para respuestas de persisencia. */
const SETTINGS_SELECT = "*";

/**
 * Fila cruda de `settings` -> `Settings`.
 *
 * Una sola copia: el mapeo estaba repetido en `fetchSettings` y en las dos ramas
 * de `saveSettings`, así que agregar una columna obligaba a acordarse de tres
 * lugares, y olvidarse de uno devolvía el valor por defecto en silencio.
 */
function mapSettings(raw: Record<string, unknown>): Settings {
  return {
    id: (raw.id as string) ?? null,
    tax_rate: (raw.tax_rate as number) ?? DEFAULTS.tax_rate,
    include_tax: (raw.include_tax as boolean) ?? true,
    allow_oversell: (raw.allow_oversell as boolean) ?? true,
    accepts_card: (raw.accepts_card as boolean) ?? true,
    accepts_transfer: (raw.accepts_transfer as boolean) ?? true,
    currency: (raw.currency as string) ?? "COP",
    transfer_methods_enabled:
      (raw.transfer_methods_enabled as string[]) ?? DEFAULTS.transfer_methods_enabled,
    card_methods_enabled: (raw.card_methods_enabled as string[]) ?? DEFAULTS.card_methods_enabled,
    business_profile: (raw.business_profile ?? {}) as BusinessProfile,
  };
}

/** Devuelve los ajustes de la cuenta (o valores por defecto si aún no existe la fila). */
export async function fetchSettings(): Promise<Settings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...DEFAULTS, business_profile: {} };

  return mapSettings(data as Record<string, unknown>);
}

/**
 * Persiste solo el desglose de IVA.
 *
 * Vive aparte de `saveSettings` porque el POS únicamente conoce este campo:
 * mandar el objeto completo pisaría la tasa, la moneda o el perfil del negocio
 * que el dueño haya cambiado desde otra pestaña.
 *
 * La RLS de `settings` solo deja escribir al dueño o al empleado con el permiso
 * `settings`, así que un empleado sin permiso recibe 0 filas afectadas. Eso NO
 * es un error de red: se devuelve `false` para que el llamador revierta.
 */
export async function updateIncludeTax(includeTax: boolean): Promise<boolean> {
  const supabase = createClient();
  const { data: existing, error: readErr } = await supabase
    .from("settings")
    .select("id")
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing?.id) {
    const { data, error } = await supabase
      .from("settings")
      .update({ include_tax: includeTax } as never)
      .eq("id", existing.id)
      .select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  // Todavía no hay fila de ajustes: se crea con los valores por defecto.
  const { data, error } = await supabase
    .from("settings")
    .insert({
      tax_rate: DEFAULTS.tax_rate,
      include_tax: includeTax,
      allow_oversell: DEFAULTS.allow_oversell,
      currency: DEFAULTS.currency,
    } as never)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Crea o actualiza la (única) fila de ajustes del usuario. */
export async function saveSettings(input: SettingsInput): Promise<Settings> {
  const supabase = createClient();
  const { data: existing, error: readErr } = await supabase
    .from("settings")
    .select("id")
    .maybeSingle();
  if (readErr) throw readErr;

  // Los medios (transferencia y tarjeta) solo viajan si el llamador los trae:
  // la pantalla de ajustes manda todo, pero otros llamadores mandan un subconjunto
  // y no tienen por qué pisar listas que no editaron.
  const payload: Record<string, unknown> = {
    tax_rate: input.tax_rate,
    include_tax: input.include_tax,
    allow_oversell: input.allow_oversell,
    ...(input.accepts_card !== undefined ? { accepts_card: input.accepts_card } : {}),
    ...(input.accepts_transfer !== undefined ? { accepts_transfer: input.accepts_transfer } : {}),
    currency: input.currency,
    ...(input.transfer_methods_enabled ? { transfer_methods_enabled: input.transfer_methods_enabled } : {}),
    ...(input.card_methods_enabled ? { card_methods_enabled: input.card_methods_enabled } : {}),
    ...(input.business_profile ? { business_profile: input.business_profile } : {}),
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("settings")
      .update(payload as never)
      .eq("id", existing.id)
      .select(SETTINGS_SELECT)
      .single();
    if (error) throw error;
    return mapSettings(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("settings")
    .insert(payload as never)
    .select(SETTINGS_SELECT)
    .single();
  if (error) throw error;
  return mapSettings(data as Record<string, unknown>);
}

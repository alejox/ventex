import { createClient } from "@/utils/supabase/client";
import type { Json } from "@/utils/supabase/database.types";

// ---- Tipos del dominio de la escuela ----

/** Política de créditos y reprogramación. Se CONGELA en cada matrícula. */
export interface SchoolPolicy {
  /** Cuántas horas antes de una clase hay que reprogramarla. */
  min_advance_hours: number;
  /** Cuántas reprogramaciones aguanta una matrícula. */
  max_reschedules: number;
  /** Si una falta injustificada consume crédito (false = queda pendiente). */
  consume_on_unjustified_absence: boolean;
  /** Días que se agregan al vencimiento con cada reprogramación (0 = no cambia). */
  expiry_extension_days: number;
}

export interface SchoolSettings {
  id: string | null;
  /** Instrumentos que puede enseñar el negocio. */
  instruments: string[];
  /** Salas / aulas que se pueden asignar a una clase. */
  rooms: string[];
  policy: SchoolPolicy;
  /** Plantillas de mensaje por propósito (las llena la fase de comunicación). */
  message_templates: Record<string, string>;
  /** Cuota de almacenamiento del negocio para material (bytes). */
  storage_quota_bytes: number;
}

export interface SchoolSettingsInput {
  instruments: string[];
  rooms: string[];
  policy: SchoolPolicy;
  message_templates?: Record<string, string>;
  storage_quota_bytes?: number;
}

export const SCHOOL_DEFAULT_POLICY: SchoolPolicy = {
  min_advance_hours: 24,
  max_reschedules: 2,
  consume_on_unjustified_absence: false,
  expiry_extension_days: 0,
};

export const SCHOOL_DEFAULTS: SchoolSettings = {
  id: null,
  instruments: [],
  rooms: [],
  policy: SCHOOL_DEFAULT_POLICY,
  message_templates: {},
  storage_quota_bytes: 104_857_600,
};

const SCHOOL_SETTINGS_SELECT = "*";

/**
 * Fila cruda de `school_settings` -> `SchoolSettings`.
 *
 * Una sola copia del mapeo: la usan `fetchSchoolSettings` y las dos ramas de
 * `saveSchoolSettings`, para que agregar una columna no obligue a acordarse de
 * tres lugares.
 */
function mapSchoolSettings(raw: Record<string, unknown>): SchoolSettings {
  const policy = (raw.policy ?? {}) as Record<string, unknown>;
  return {
    id: (raw.id as string) ?? null,
    instruments: (raw.instruments as string[]) ?? [],
    rooms: (raw.rooms as string[]) ?? [],
    policy: {
      min_advance_hours:
        (policy.min_advance_hours as number) ?? SCHOOL_DEFAULT_POLICY.min_advance_hours,
      max_reschedules:
        (policy.max_reschedules as number) ?? SCHOOL_DEFAULT_POLICY.max_reschedules,
      consume_on_unjustified_absence:
        (policy.consume_on_unjustified_absence as boolean) ??
        SCHOOL_DEFAULT_POLICY.consume_on_unjustified_absence,
      expiry_extension_days:
        (policy.expiry_extension_days as number) ?? SCHOOL_DEFAULT_POLICY.expiry_extension_days,
    },
    message_templates: (raw.message_templates ?? {}) as Record<string, string>,
    storage_quota_bytes:
      (raw.storage_quota_bytes as number) ?? SCHOOL_DEFAULTS.storage_quota_bytes,
  };
}

/**
 * Devuelve la configuración de la escuela, o los valores por defecto si el
 * negocio nunca abrió la pantalla (la fila se crea PEREZOSAMENTE en la base).
 */
export async function fetchSchoolSettings(): Promise<SchoolSettings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_settings")
    .select(SCHOOL_SETTINGS_SELECT)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...SCHOOL_DEFAULTS };

  return mapSchoolSettings(data as unknown as Record<string, unknown>);
}

/**
 * Crea o actualiza la (única) fila de configuración de la escuela, en el
 * estilo de `saveSettings`: lee, si existe actualiza, si no inserta.
 *
 * `school_settings` tiene `UNIQUE(user_id)` y la RLS filtra por el tenant
 * efectivo, así que `.maybeSingle()` alcanza para encontrar la fila propia.
 */
export async function saveSchoolSettings(input: SchoolSettingsInput): Promise<SchoolSettings> {
  const supabase = createClient();
  const { data: existing, error: readErr } = await supabase
    .from("school_settings")
    .select("id")
    .maybeSingle();
  if (readErr) throw readErr;

  const payload = {
    instruments: input.instruments,
    rooms: input.rooms,
    policy: input.policy as unknown as Json,
    ...(input.message_templates
      ? { message_templates: input.message_templates as unknown as Json }
      : {}),
    ...(input.storage_quota_bytes !== undefined
      ? { storage_quota_bytes: input.storage_quota_bytes }
      : {}),
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("school_settings")
      .update(payload)
      .eq("id", existing.id)
      .select(SCHOOL_SETTINGS_SELECT)
      .single();
    if (error) throw error;
    return mapSchoolSettings(data as unknown as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("school_settings")
    .insert(payload)
    .select(SCHOOL_SETTINGS_SELECT)
    .single();
  if (error) throw error;
  return mapSchoolSettings(data as unknown as Record<string, unknown>);
}
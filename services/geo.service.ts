import { createClient } from "@/utils/supabase/client";

export interface ColombiaCity {
  department: string;
  city: string;
}

/**
 * Todas las ciudades de Colombia (data de referencia estática, no de tenant).
 *
 * Cacheada en memoria a nivel de módulo: es el mismo listado para cualquier
 * negocio y no cambia en la sesión, así que una sola consulta alcanza para
 * toda la vida de la pestaña — no hace falta un store de Zustand para esto.
 */
let cache: ColombiaCity[] | null = null;

export async function fetchColombiaCities(): Promise<ColombiaCity[]> {
  if (cache) return cache;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("co_cities")
    .select("department, city")
    .order("department")
    .order("city");
  if (error) throw error;

  cache = (data ?? []) as ColombiaCity[];
  return cache;
}

import { createClient } from "@/utils/supabase/client";

/**
 * `services` es la ÚNICA tabla donde vive un servicio.
 *
 * Antes convivía con un gemelo en `products` (`unit = 'Servicio'`) emparejado
 * por nombre. Esa copia se retiró: era unidireccional, se sincronizaba con
 * `catch {}` vacíos y en producción no había un solo par completo. Manda esta
 * tabla porque es la que el dominio necesita — tiene duración y descripción, y
 * le apuntan `appointments.service_id`, `sale_items.service_id` y el sitio
 * público. Ver `supabase/migrations/20260815000000_services_single_source_of_truth.sql`.
 */

// ---- Tipos del dominio de servicios (catálogo de salón / barbería) ----
export interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  status: string;
  has_commission: boolean;
  commission_type: string | null;
  commission_value: number | null;
  category_id: string | null;
  created_at: string;
  categories: { name: string } | null;
}

export interface NewServiceInput {
  name: string;
  description: string;
  price: string;
  duration_minutes: string;
  status: string;
  has_commission: boolean;
  commission_type: string;
  commission_value: string;
  category_id?: string;
}

const SERVICE_COLUMNS =
  "id, name, description, price, duration_minutes, status, has_commission, commission_type, commission_value, category_id, created_at";

const SELECT = `${SERVICE_COLUMNS}, categories(name)`;

/**
 * Campos que viajan a la base en un alta o una edición.
 *
 * Vive en una función y no repetido en `createService`/`updateService` porque
 * eran dos listas idénticas que ya se habían desincronizado una vez.
 */
function servicePayload(input: NewServiceInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price: parseFloat(input.price) || 0,
    duration_minutes: parseInt(input.duration_minutes) || 30,
    status: input.status,
    category_id: input.category_id || null,
    has_commission: input.has_commission,
    commission_type: input.has_commission ? input.commission_type : null,
    commission_value: input.has_commission ? parseFloat(input.commission_value) || null : null,
  };
}

export async function fetchServices(): Promise<Service[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("services").select(SELECT).order("name");
  if (error) throw error;
  return (data ?? []) as Service[];
}

export async function createService(input: NewServiceInput): Promise<Service> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .insert(servicePayload(input))
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Service;
}

export async function updateService(id: string, input: NewServiceInput): Promise<Service> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .update(servicePayload(input))
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Service;
}

/**
 * Activa o desactiva sin tocar el resto de la ficha.
 *
 * El catálogo cambia el estado desde la fila, sin abrir el formulario: mandar
 * el `NewServiceInput` completo desde ahí obligaría a reconstruirlo a partir
 * de la fila y un campo mal rearmado pisaría el precio o la comisión.
 */
export async function setServiceStatus(id: string, status: "active" | "inactive"): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("services").update({ status }).eq("id", id);
  if (error) throw error;
}

/*
 * No hay `deleteService`, y es a propósito.
 *
 * `sale_items.service_id` y `appointments.service_id` son ON DELETE SET NULL:
 * borrar un servicio no lo borraba, le arrancaba el vínculo a cada venta y a
 * cada cita que lo tuvieran. La pantalla vieja ofrecía ese botón ("Esta acción
 * no se puede deshacer") sin decir que se llevaba puesto el histórico.
 *
 * Un servicio que ya no se presta se ARCHIVA (`setServiceStatus`), igual que un
 * producto: desaparece del POS y de la agenda, y lo vendido sigue siendo cierto.
 */

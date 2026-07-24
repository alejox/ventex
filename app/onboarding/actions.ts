"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { REGISTRABLE_BUSINESS_TYPES, type BusinessType } from "@/config/business";

/**
 * Completa el perfil de un usuario que entró por OAuth (Google): el trigger
 * `handle_new_user` lo creó sin `business_type` ni `business_name` porque el
 * proveedor no los entrega. Acá el propio dueño los fija.
 *
 * `business_type`/`business_name` son columnas que el usuario SÍ puede escribir
 * sobre su propia fila (grants de columna + policy `profiles_owner`), así que no
 * hace falta el service_role. El trigger `profiles_guard_privileges` solo frena
 * `worker_permissions`/`staff_id`, que no se tocan.
 */
export async function completeOnboarding(formData: FormData): Promise<{ error: string } | void> {
  const businessType = String(formData.get("business_type") || "");
  const businessName = String(formData.get("business_name") || "").trim();

  // El tipo tiene que ser uno de los habilitados hoy; nada de valores forjados.
  if (!REGISTRABLE_BUSINESS_TYPES.includes(businessType as BusinessType)) {
    return { error: "Elegí un tipo de negocio válido." };
  }
  if (!businessName) {
    return { error: "El nombre del negocio es obligatorio." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ business_type: businessType, business_name: businessName })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/pos");
}

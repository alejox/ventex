"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { toMessage } from "@/lib/errors";
import {
  MODULES_BY_TYPE,
  REGISTRABLE_BUSINESS_TYPES,
  type BusinessType,
  type ModuleId,
  type Modules,
} from "@/config/business";
import { afterOnboardingPath, sanitizeMonths, sanitizePlanId } from "@/lib/signup-intent";

/**
 * Completa el perfil de un dueño recién registrado. Pasan por acá TODOS los
 * dueños nuevos —Google y correo—: el registro ya no pide nombre del negocio,
 * nombre ni teléfono (B8), y el trigger `handle_new_user` tampoco guardaría el
 * `business_name` aunque llegara en la metadata (solo copia nombre, rubro,
 * módulos y teléfono). Acá el propio dueño los fija, con el rubro y los módulos
 * que ya eligió precargados desde la URL (ver `lib/signup-intent.ts`).
 *
 * `business_type`/`business_name`/`modules` son columnas que el usuario SÍ puede
 * escribir sobre su propia fila (grants de columna + policy `profiles_owner`),
 * así que no hace falta el service_role. El trigger `profiles_guard_privileges`
 * solo frena `worker_permissions`/`staff_id`, que no se tocan.
 */
export async function completeOnboarding(formData: FormData): Promise<{ error: string } | void> {
  const businessType = String(formData.get("business_type") || "");
  const businessName = String(formData.get("business_name") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  // Solo se escribe si viene con algo: vacío no pisa el nombre que ya haya.
  const fullName = String(formData.get("full_name") || "").trim();

  // El tipo tiene que ser uno de los habilitados hoy; nada de valores forjados.
  if (!REGISTRABLE_BUSINESS_TYPES.includes(businessType as BusinessType)) {
    return { error: "Elige un tipo de negocio válido." };
  }
  if (!businessName) {
    return { error: "El nombre del negocio es obligatorio." };
  }

  // Los módulos llegan del cliente: solo se aceptan los que el rubro ofrece y
  // que además están disponibles (los `comingSoon` no se pueden activar).
  const modules = parseModules(businessType as BusinessType, formData.get("modules"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({
      business_type: businessType,
      business_name: businessName,
      modules,
      phone,
      ...(fullName ? { full_name: fullName } : {}),
    })
    .eq("id", user.id);

  if (error) return { error: toMessage(error) };

  revalidatePath("/dashboard", "layout");
  // Quien llegó desde "Empezar con {plan}" sigue al checkout de ESE plan.
  redirect(
    afterOnboardingPath(
      sanitizePlanId(String(formData.get("plan") || "")),
      sanitizeMonths(String(formData.get("months") || "")),
    ),
  );
}

function parseModules(businessType: BusinessType, raw: FormDataEntryValue | null): Modules {
  const available = new Set(
    (MODULES_BY_TYPE[businessType] ?? []).filter((m) => !m.comingSoon).map((m) => m.id),
  );

  let selected: unknown;
  try {
    selected = JSON.parse(String(raw || "[]"));
  } catch {
    return {};
  }
  if (!Array.isArray(selected)) return {};

  const modules: Modules = {};
  for (const id of selected) {
    if (typeof id === "string" && available.has(id as ModuleId)) {
      modules[id as ModuleId] = true;
    }
  }
  return modules;
}

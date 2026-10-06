import {
  MODULES_BY_TYPE,
  REGISTRABLE_BUSINESS_TYPES,
  type BusinessType,
  type ModuleId,
  type Modules,
} from "@/config/business";

/**
 * Lo que el visitante eligió ANTES de tener cuenta —rubro, herramientas y, si
 * vino desde los precios, el plan— viaja en la URL de vuelta (`next`), no en el
 * navegador.
 *
 * Por qué la URL y no `sessionStorage`: el enlace de confirmación se abre muchas
 * veces en otra pestaña o en otro dispositivo (se pide el correo en la compu y
 * se confirma en el celular), y ahí el storage está vacío. El `next` viaja
 * dentro del propio enlace del correo y del redirect de Google, así que llega
 * siempre. El `OnboardingModal` lo lee y precarga lo ya elegido.
 *
 * Todo lo que entra por acá viene de la URL, o sea del usuario: se valida contra
 * las mismas listas que usa el registro y lo que no encaja se descarta en
 * silencio (se vuelve a preguntar, que es lo mismo que pasaba antes).
 */

export interface SignupIntent {
  businessType: BusinessType | null;
  /** `null` = no vino nada: el modal usa los recomendados del rubro. */
  modules: Modules | null;
  /** Id del plan de pago elegido en la landing (`oro`, `basica`, …). */
  plan: string | null;
  /** Duración elegida en el selector de precios, en meses. */
  months: number | null;
}

export const EMPTY_SIGNUP_INTENT: SignupIntent = {
  businessType: null,
  modules: null,
  plan: null,
  months: null,
};

/** Ids de plan: minúsculas, dígitos, guion y guion bajo. Nada de rutas ni HTML. */
const PLAN_ID = /^[a-z0-9_-]{1,32}$/;

export function sanitizePlanId(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  return PLAN_ID.test(value) ? value : null;
}

export function sanitizeMonths(raw: string | number | null | undefined): number | null {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isInteger(n) && n >= 1 && n <= 36 ? n : null;
}

export function sanitizeBusinessType(raw: string | null | undefined): BusinessType | null {
  return REGISTRABLE_BUSINESS_TYPES.includes(raw as BusinessType) ? (raw as BusinessType) : null;
}

/** Solo los módulos que el rubro ofrece y que ya existen (nada `comingSoon`). */
export function sanitizeModules(businessType: BusinessType, ids: readonly string[]): Modules {
  const available = new Set(
    (MODULES_BY_TYPE[businessType] ?? []).filter((m) => !m.comingSoon).map((m) => m.id),
  );
  const modules: Modules = {};
  for (const id of ids) {
    if (available.has(id as ModuleId)) modules[id as ModuleId] = true;
  }
  return modules;
}

/** Lee la intención desde la query string (`?rubro=&modulos=&plan=&meses=`). */
export function parseSignupIntent(params: URLSearchParams | null | undefined): SignupIntent {
  if (!params) return EMPTY_SIGNUP_INTENT;
  const businessType = sanitizeBusinessType(params.get("rubro"));
  const rawModules = params.get("modulos");
  return {
    businessType,
    // Un `modulos=` vacío es una elección válida ("ninguno"), distinta de no
    // haber mandado el parámetro.
    modules:
      businessType && rawModules !== null
        ? sanitizeModules(businessType, rawModules.split(",").filter(Boolean))
        : null,
    plan: sanitizePlanId(params.get("plan")),
    months: sanitizeMonths(params.get("meses")),
  };
}

/**
 * Ruta a la que vuelve el usuario después de confirmar el correo o de entrar con
 * Google: el panel, que todavía sin rubro le muestra el `OnboardingModal`, con
 * lo elegido en la query para precargarlo.
 */
export function onboardingPath(intent: Partial<SignupIntent>): string {
  const params = new URLSearchParams();
  const businessType = sanitizeBusinessType(intent.businessType ?? null);
  if (businessType) {
    params.set("rubro", businessType);
    if (intent.modules) {
      const ids = Object.keys(sanitizeModules(businessType, Object.keys(intent.modules).filter(
        (id) => intent.modules?.[id as ModuleId],
      )));
      params.set("modulos", ids.join(","));
    }
  }
  const plan = sanitizePlanId(intent.plan ?? null);
  if (plan) {
    params.set("plan", plan);
    const months = sanitizeMonths(intent.months ?? null);
    if (months) params.set("meses", String(months));
  }
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

/**
 * Destino al terminar el onboarding. Con un plan de pago elegido va a los precios
 * de la landing, que con sesión abre el checkout de ESE plan solo; sin plan, al
 * punto de venta como siempre.
 */
export function afterOnboardingPath(plan: string | null, months: number | null): string {
  const safePlan = sanitizePlanId(plan);
  if (!safePlan) return "/dashboard/pos";
  const params = new URLSearchParams({ plan: safePlan });
  const safeMonths = sanitizeMonths(months);
  if (safeMonths) params.set("meses", String(safeMonths));
  return `/?${params.toString()}#precios`;
}


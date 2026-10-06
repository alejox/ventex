/**
 * Lógica pura del panel super admin: KPIs de plataforma, filtros por KPI y
 * orden de la tabla de Empresas (F16/F17). Sin I/O ni reloj: `now` entra por
 * parámetro para que se pueda testear (`tests/admin-company-metrics.test.ts`).
 *
 * Vive junto a las rutas de /admin porque solo las usa este panel; un archivo
 * que no se llama page/layout/route no es una ruta para el App Router.
 */
import type { AdminCompany, AdminCompanyActivity } from "@/services/admin.service";
import { EXPIRY_SOON_DAYS, daysUntil } from "@/components/ui/ExpiryCell";

const MS_PER_DAY = 86_400_000;

export function isWithinDays(iso: string | null | undefined, days: number, now: number): boolean {
  if (!iso) return false;
  const timestamp = new Date(iso).getTime();
  return Number.isFinite(timestamp) && timestamp >= now - days * MS_PER_DAY;
}

/** Vigente y venciendo dentro de la ventana (las ya vencidas no cuentan: eso es churn, no renovación). */
export function expiresSoon(periodEnd: string | null, now: number): boolean {
  if (!periodEnd) return false;
  const days = daysUntil(periodEnd, now);
  return days >= 0 && days <= EXPIRY_SOON_DAYS;
}

export interface CompanyRow {
  company: AdminCompany;
  activity: AdminCompanyActivity | null;
  name: string;
  registeredAt: string;
  lastActivityAt: string | null;
  monthlyGmv: number;
}

export function buildCompanyRows(
  companies: AdminCompany[],
  activityByCompany: Map<string, AdminCompanyActivity>,
): CompanyRow[] {
  return companies.map((company) => {
    const activity = activityByCompany.get(company.user_id) ?? null;
    return {
      company,
      activity,
      name: company.business_name || company.full_name || "Sin nombre",
      registeredAt: activity?.registered_at ?? company.created_at,
      lastActivityAt: activity?.last_operational_activity_at ?? null,
      monthlyGmv: activity ? Number(activity.monthly_gmv) : Number(company.monthly_sales),
    };
  });
}

/** Cada KPI de Empresas es también un filtro: tocarlo muestra esas empresas. */
export type CompanyFilter =
  | "all"
  | "new7"
  | "new30"
  | "activatedNew"
  | "active7"
  | "noActivity"
  | "expiring";

export function matchesCompanyFilter(row: CompanyRow, filter: CompanyFilter, now: number): boolean {
  switch (filter) {
    case "all":
      return true;
    case "new7":
      return isWithinDays(row.registeredAt, 7, now);
    case "new30":
      return isWithinDays(row.registeredAt, 30, now);
    case "activatedNew":
      return isWithinDays(row.registeredAt, 30, now) && row.activity?.activation_stage === "activated";
    case "active7":
      return isWithinDays(row.lastActivityAt, 7, now);
    case "noActivity":
      // Sin la RPC de actividad no se sabe: no se marca a nadie como inactivo.
      return row.activity !== null && !row.lastActivityAt;
    case "expiring":
      return expiresSoon(row.company.period_end, now);
  }
}

export function countCompanies(rows: CompanyRow[], filter: CompanyFilter, now: number): number {
  return rows.filter((row) => matchesCompanyFilter(row, filter, now)).length;
}

export type CompanySortKey = "name" | "plan" | "registered" | "lastActivity" | "gmv" | "expiry";
export type SortDirection = "asc" | "desc";

function sortValue(row: CompanyRow, key: CompanySortKey): string | number | null {
  switch (key) {
    case "name":
      return row.name.toLocaleLowerCase("es");
    case "plan":
      return (row.company.plan_name ?? row.company.plan_id).toLocaleLowerCase("es");
    case "registered":
      return new Date(row.registeredAt).getTime();
    case "lastActivity":
      return row.lastActivityAt ? new Date(row.lastActivityAt).getTime() : null;
    case "gmv":
      return row.monthlyGmv;
    case "expiry":
      return row.company.period_end ? new Date(row.company.period_end).getTime() : null;
  }
}

/**
 * Orden estable de la tabla. Los vacíos (sin vencimiento, sin actividad) van
 * SIEMPRE al final, en cualquier dirección: ordenar por "vence primero" y ver
 * arriba veinte "Sin vencimiento" esconde justo lo que se buscaba.
 */
export function sortCompanyRows(rows: CompanyRow[], key: CompanySortKey, direction: SortDirection): CompanyRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: sortValue(row, key) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      if (a.value < b.value) return -1 * factor;
      if (a.value > b.value) return 1 * factor;
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

/** KPIs del resumen de /admin que no dependen de la RPC de actividad. */
export function platformKpis(companies: AdminCompany[], now: number) {
  return {
    expiringSoon: companies.filter((company) => expiresSoon(company.period_end, now)).length,
    registrations30: companies.filter((company) => isWithinDays(company.created_at, 30, now)).length,
  };
}

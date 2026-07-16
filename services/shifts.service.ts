import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de turnos (caja de empleados) ----

/** Turno abierto del empleado con acumulados en vivo (rpc current_shift). */
export interface CurrentShift {
  id: string;
  opened_at: string;
  opening_cash: number;
  sales_count: number;
  sales_total: number;
  cash_total: number;
  expected_cash: number;
  totals_by_method: Record<string, number>;
}

/** Resumen del arqueo devuelto al cerrar un turno (rpc close_shift). */
export interface ShiftSummary {
  id: string;
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  difference: number;
  sales_total: number;
  sales_count: number;
  totals_by_method: Record<string, number>;
}

/** Fila del historial de turnos del negocio (tabla shifts). */
export interface Shift {
  id: string;
  worker_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  sales_total: number | null;
  sales_count: number | null;
  totals_by_method: Record<string, number> | null;
  notes: string | null;
  status: string;
}

const SHIFT_SELECT =
  "id, worker_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, difference, sales_total, sales_count, totals_by_method, notes, status";

/** Turno abierto del empleado autenticado, o null si no tiene. */
export async function fetchCurrentShift(): Promise<CurrentShift | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("current_shift");
  if (error) throw error;
  return (data as unknown as CurrentShift) ?? null;
}

/** Abre el turno del empleado con la base de caja indicada. */
export async function openShift(openingCash: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("open_shift", { p_opening_cash: openingCash });
  if (error) throw error;
}

/**
 * Cierra el turno abierto del empleado (o, con `shiftId`, un turno del negocio
 * cerrado por el dueño) y devuelve el resumen del arqueo.
 */
export async function closeShift(
  closingCash: number,
  notes?: string,
  shiftId?: string,
): Promise<ShiftSummary> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("close_shift", {
    p_closing_cash: closingCash,
    ...(notes ? { p_notes: notes } : {}),
    ...(shiftId ? { p_shift_id: shiftId } : {}),
  });
  if (error) throw error;
  return data as unknown as ShiftSummary;
}

/** Historial de turnos del negocio (RLS limita al tenant). */
export async function fetchShifts(): Promise<Shift[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shifts")
    .select(SHIFT_SELECT)
    .order("opened_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as Shift[];
}

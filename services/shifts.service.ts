import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de turnos (caja de empleados) ----

/** Turno abierto del empleado con acumulados en vivo (rpc current_shift). */
export interface CurrentShift {
  id: string;
  workspace_id: string;
  membership_id: string;
  opened_at: string;
  opening_cash: number;
  sales_count: number;
  sales_total: number;
  cash_total: number;
  /** Retiros de caja del turno; ya descontados de `expected_cash`. */
  withdrawals_total: number;
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
  withdrawals_total: number;
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
  withdrawals_total: number | null;
  totals_by_method: Record<string, number> | null;
  notes: string | null;
  status: string;
}

const SHIFT_SELECT =
  "id, worker_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, difference, sales_total, sales_count, withdrawals_total, totals_by_method, notes, status";

/**
 * El servidor exige justificar todo cierre descuadrado. Se marca con un código
 * para que la UI pueda pedir la nota en vez de mostrar el error crudo.
 */
export const JUSTIFICATION_REQUIRED = "JUSTIFICACION_REQUERIDA";

export function isJustificationRequired(e: unknown): boolean {
  return e instanceof Error && e.message.includes(JUSTIFICATION_REQUIRED);
}

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

/** Qué se hizo con la plata que salió del cajón. */
export type WithdrawalKind = "gasto" | "traslado";

/**
 * Registra un retiro de caja (sangría) contra el turno abierto. Sin esto, el
 * dinero que sale de la caja durante el turno aparecería como faltante.
 *
 * `kind` decide si además se anota como GASTO del negocio. Son dos cosas
 * distintas: el retiro siempre cuadra la caja, pero solo un "gasto" llega al
 * estado de resultados. Mover plata a la caja fuerte es un "traslado" y no es
 * una pérdida — por eso ese es el valor por defecto.
 *
 * El gasto lo inserta el RPC, que es `security definer`: el cajero no tiene
 * permiso directo sobre `expenses` y no hace falta dárselo.
 */
export async function registerWithdrawal(
  amount: number,
  reason: string,
  kind: WithdrawalKind = "traslado",
  categoryId?: string | null,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("register_cash_withdrawal", {
    p_amount: amount,
    p_reason: reason,
    p_kind: kind,
    p_category: categoryId ?? undefined,
  });
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

import { createClient } from "@/utils/supabase/client";
import { getSelectedWorkspaceId } from "@/services/workspace.service";
import { toWebp, verificarPeso } from "@/lib/image";

// ---- Tipos del dominio de staff (barberos / estilistas / empleados) ----
/**
 * Ficha de una persona del negocio. NO lleva tasa de comisión: la comisión se
 * configura por producto y servicio, y el monto de cada venta queda congelado
 * en `sale_items.commission_amount`.
 */
export interface StaffMember {
  id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  /**
   * Foto de la persona. Vive en `staff` y no en `business_sites` porque es un
   * atributo de la PERSONA: el micrositio la publica, pero la misma foto sirve
   * en cualquier otra pantalla sin volver a subirla.
   */
  photo_url: string | null;
  /**
   * Aparece en el micrositio y recibe reservas online. Un cajero o la
   * recepcionista son parte del equipo pero no atienden: no se ofrecen al
   * cliente ni cuentan como silla libre en la reserva pública.
   */
  show_on_website: boolean;
}

export interface NewStaffInput {
  full_name: string;
  role: string;
  phone: string;
  email: string;
  status: string;
  /** `null` borra la foto; omitirlo la deja como está. */
  photo_url?: string | null;
  show_on_website: boolean;
}

/**
 * Fila del reporte de comisiones por miembro del equipo.
 *
 * No lleva tasa: la comisión se configura POR PRODUCTO/SERVICIO
 * (`products.has_commission`, `commission_type`, `commission_value`), no por
 * persona, y el monto de cada línea queda congelado en
 * `sale_items.commission_amount` al vender. Dos personas pueden vender lo mismo
 * y ganar distinto según qué vendió cada una, así que una tasa única por
 * persona no describe nada.
 *
 * `commission` se parte en dos porque son dos preguntas distintas: cuánto
 * devengó en el período (`commission`) y cuánto de eso todavía se le debe
 * (`pending`). Antes solo existía la primera, y el dueño le pagaba al barbero y
 * al día siguiente veía el mismo número sin saber si ya lo había pagado.
 */
export interface CommissionRow {
  staff_id: string;
  full_name: string;
  salesCount: number;
  /** Total vendido atribuido a la persona (productos y servicios). */
  soldTotal: number;
  /** Devengado en el período: pendiente + liquidado. */
  commission: number;
  /** Lo que todavía se le debe: las líneas sin liquidación. */
  pending: number;
  /** Lo ya pagado de ese mismo período. */
  settled: number;
}

export interface StaffSaleItem {
  id: string;
  product_name: string;
  sku: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  sale_number: number;
  created_at: string;
  customer_name: string | null;
  payment_method: string;
  commissionAmount: number;
  /** Liquidación que ya pagó esta comisión. null = sigue pendiente. */
  settlementId: string | null;
}

/**
 * Rango de fechas que el usuario eligió, en los dos formatos que hacen falta.
 *
 * `from`/`to` son las fechas tal cual, para imprimirlas en el comprobante.
 * `fromTs`/`toTs` son el MISMO rango en instantes, calculados en la zona del
 * navegador y con `toTs` exclusivo. Los dos viajan porque `sales.created_at` es
 * timestamptz y la base corre en UTC: cortar por `created_at::date` metería la
 * venta de las 20:00 en Colombia dentro del día siguiente.
 */
export interface CommissionPeriod {
  from: string;
  to: string;
  fromTs: string;
  toTs: string;
}

/**
 * Construye el período a partir de dos fechas `YYYY-MM-DD` del formulario.
 * `to` es inclusivo para el usuario ("del 1 al 15" incluye el 15), así que el
 * instante de corte es el arranque del día siguiente.
 */
export function commissionPeriodOf(from: string, to: string): CommissionPeriod {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return {
    from,
    to,
    fromTs: new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString(),
    toTs: new Date(ty, tm - 1, td + 1, 0, 0, 0, 0).toISOString(),
  };
}

/** El mes en curso, que es el período por defecto de la pantalla. */
export function currentMonthPeriod(): CommissionPeriod {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return commissionPeriodOf(first, today);
}

/** Una liquidación ya hecha. */
export interface CommissionSettlement {
  id: string;
  staff_id: string;
  staff_name: string;
  period_from: string;
  period_to: string;
  total_amount: number;
  items_count: number;
  payment_method: string;
  paid_on: string;
  status: string;
  expense_id: string | null;
  /**
   * Retiro de caja que descontó del arqueo. Solo existe si se pagó en efectivo
   * y había un turno abierto donde anotarlo.
   */
  cash_movement_id: string | null;
  created_at: string;
  /**
   * Ventas que se anularon DESPUÉS de que esta liquidación las pagara. No es un
   * error del sistema: es plata que ya salió por una venta que dejó de existir,
   * y el dueño tiene que enterarse en vez de que cuadre solo.
   */
  voidedSalesCount: number;
}

export interface SettleCommissionsInput {
  staffId: string;
  period: CommissionPeriod;
  paymentMethod: "efectivo" | "transferencia" | "tarjeta";
  paidOn: string;
  /** Líneas que el dueño sacó de esta liquidación (disputa, error, etc.). */
  excludedItemIds?: string[];
}

const SELECT = "id, full_name, role, phone, email, status, created_at, photo_url, show_on_website";

export async function fetchStaff(): Promise<StaffMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("staff").select(SELECT).order("full_name");
  if (error) throw error;
  return (data ?? []) as StaffMember[];
}

export async function createStaff(input: NewStaffInput): Promise<StaffMember> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff")
    .insert({
      full_name: input.full_name,
      role: input.role || null,
      phone: input.phone || null,
      email: input.email || null,
      status: input.status,
      photo_url: input.photo_url ?? null,
      show_on_website: input.show_on_website,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}

const STAFF_PHOTOS_BUCKET = "staff-photos";

/**
 * Sube la foto de una persona y devuelve su URL pública.
 *
 * La carpeta es el inquilino (`${workspaceId}/...`): así lo exige la policy del
 * bucket, que compara el primer tramo del nombre contra
 * `get_effective_user_id()`. Escribir fuera de esa carpeta lo rechaza Storage,
 * no el cliente.
 *
 * Pasa por `toWebp` como las fotos de producto: una foto de celular sin
 * comprimir son varios megas, y acá el que la descarga es el visitante del
 * micrositio.
 */
export async function uploadStaffPhoto(file: File): Promise<string> {
  const supabase = createClient();
  const workspaceId = await getSelectedWorkspaceId();
  const optimized = await toWebp(file);
  verificarPeso(optimized, 2 * 1024 * 1024); // tope del bucket `staff-photos`

  const ext = optimized.name.split(".").pop()?.toLowerCase() || "webp";
  const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(STAFF_PHOTOS_BUCKET)
    .upload(path, optimized, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  return supabase.storage.from(STAFF_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Comisiones de un período por miembro del equipo, separando lo pendiente de
 * lo ya liquidado.
 *
 * Suma lo ya congelado en cada línea al vender; no recalcula nada. Cambiar hoy
 * la comisión de un producto no puede mover lo que ya se devengó.
 */
export async function fetchCommissions(period?: CommissionPeriod): Promise<CommissionRow[]> {
  const supabase = createClient();
  const range = period ?? currentMonthPeriod();

  const [staffRes, itemsRes] = await Promise.all([
    supabase.from("staff").select("id, full_name"),
    supabase
      .from("sale_items")
      // Sin filtro por service_id: antes solo sumaba SERVICIOS, así que en una
      // tienda —que no los tiene— el reporte salía vacío por definición. Los
      // productos también comisionan.
      .select("sale_id, staff_id, line_total, commission_amount, commission_settlement_id, sales!inner(status, created_at)")
      .not("staff_id", "is", null)
      .eq("sales.status", "completed")
      .gte("sales.created_at", range.fromTs)
      .lt("sales.created_at", range.toTs),
  ]);
  if (staffRes.error) throw staffRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const staff = staffRes.data ?? [];
  const items = (itemsRes.data ?? []) as unknown as {
    sale_id: string;
    staff_id: string;
    line_total: number;
    commission_amount: number;
    commission_settlement_id: string | null;
  }[];

  interface Acc {
    soldTotal: number;
    commission: number;
    pending: number;
    settled: number;
    sales: Set<string>;
  }
  const byStaff = new Map<string, Acc>();
  for (const it of items) {
    const prev: Acc =
      byStaff.get(it.staff_id) ??
      { soldTotal: 0, commission: 0, pending: 0, settled: 0, sales: new Set<string>() };
    prev.soldTotal += it.line_total ?? 0;
    // La comisión NO se recalcula: se suma la que quedó congelada al vender.
    const amount = it.commission_amount ?? 0;
    prev.commission += amount;
    if (it.commission_settlement_id) prev.settled += amount;
    else prev.pending += amount;
    prev.sales.add(it.sale_id);
    byStaff.set(it.staff_id, prev);
  }

  return staff
    .map((m) => {
      const a = byStaff.get(m.id);
      if (!a) return null;
      return {
        staff_id: m.id,
        full_name: m.full_name,
        salesCount: a.sales.size,
        soldTotal: round2(a.soldTotal),
        commission: round2(a.commission),
        pending: round2(a.pending),
        settled: round2(a.settled),
      };
    })
    .filter((r): r is CommissionRow => r !== null && r.soldTotal > 0)
    .sort((a, b) => b.pending - a.pending || b.commission - a.commission);
}

/**
 * Ventas (líneas) atribuidas a un miembro del personal, con su comisión y con
 * el estado de liquidación de cada una.
 *
 * `period` es obligatorio de hecho aunque sea opcional en la firma: sin él
 * devuelve el mes en curso. Antes NO filtraba por fecha y traía el histórico
 * completo, mientras la tarjeta "Comisión del mes" sí recortaba al mes: la
 * tarjeta y este detalle mostraban números distintos para la misma pregunta.
 */
export async function fetchStaffSales(
  staffId: string,
  period?: CommissionPeriod,
): Promise<StaffSaleItem[]> {
  const supabase = createClient();
  const range = period ?? currentMonthPeriod();
  const { data, error } = await supabase
    .from("sale_items")
    .select("id, product_name, sku, unit_price, quantity, line_total, commission_amount, commission_settlement_id, sales!inner(sale_number, created_at, payment_method, status, customers(full_name))")
    .eq("staff_id", staffId)
    // Mismo filtro que fetchCommissions: una venta anulada (void_sale la deja en
    // 'void') no se paga. Sin esto, este detalle sumaba más comisión que el
    // reporte del mes y el dueño no sabía cuál de los dos creer.
    .eq("sales.status", "completed")
    .gte("sales.created_at", range.fromTs)
    .lt("sales.created_at", range.toTs);
  if (error) throw error;

  // El embed anidado de PostgREST (sale_items → sales → customers) no queda bien
  // tipado por el generador, así que se describe la forma que sí devuelve.
  interface SaleItemRow {
    id: string;
    product_name: string;
    sku: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    commission_amount: number;
    commission_settlement_id: string | null;
    sales: {
      sale_number: number | null;
      created_at: string | null;
      payment_method: string | null;
      status: string | null;
      customers: { full_name: string | null } | null;
    } | null;
  }

  const result = ((data ?? []) as unknown as SaleItemRow[]).map((r) => ({
    id: r.id,
    product_name: r.product_name,
    sku: r.sku,
    unit_price: r.unit_price,
    quantity: r.quantity,
    line_total: r.line_total,
    sale_number: r.sales?.sale_number ?? 0,
    created_at: r.sales?.created_at ?? "",
    customer_name: r.sales?.customers?.full_name ?? null,
    payment_method: r.sales?.payment_method ?? "",
    commissionAmount: r.commission_amount ?? 0,
    settlementId: r.commission_settlement_id ?? null,
  }));

  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return result;
}

/** Fila del reporte de servicios por persona. */
export interface ServicesByStaff {
  staff_id: string;
  full_name: string;
  /** Servicios realizados: suma de cantidades, no de líneas. */
  services: number;
  /** Personas distintas atendidas. Dos servicios al mismo cliente son un cliente. */
  clientes: number;
  /** Ventas distintas en las que participó. */
  ventas: number;
  /** Valor bruto de esos servicios, al precio del día. */
  vendido: number;
}

/** Una línea de venta cruda, como la devuelve PostgREST, para agregar. */
export interface ServiceActivityLine {
  sale_id: string;
  staff_id: string | null;
  quantity: number;
  line_total: number;
  customer_id: string | null;
}

/**
 * Agrega líneas de servicio por miembro. Pura, para poder testear el conteo —que
 * es lo único que este reporte hace— sin base de datos de por medio.
 *
 * Se agrupa en memoria porque PostgREST no hace GROUP BY; es el mismo camino
 * que ya usa `fetchCommissions`.
 */
export function aggregateServicesByStaff(
  lines: ServiceActivityLine[],
  staff: { id: string; full_name: string }[],
): ServicesByStaff[] {
  const acc = new Map<string, { services: number; vendido: number; ventas: Set<string>; clientes: Set<string> }>();
  for (const it of lines) {
    if (!it.staff_id) continue;
    const prev =
      acc.get(it.staff_id) ?? { services: 0, vendido: 0, ventas: new Set<string>(), clientes: new Set<string>() };
    prev.services += it.quantity ?? 0;
    prev.vendido += it.line_total ?? 0;
    prev.ventas.add(it.sale_id);
    // Sin cliente registrado no se puede saber si es la misma persona: cada
    // venta anónima cuenta como una, que es lo más cerca de la verdad.
    prev.clientes.add(it.customer_id ?? `anon-${it.sale_id}`);
    acc.set(it.staff_id, prev);
  }

  return staff
    .map((m) => {
      const a = acc.get(m.id);
      if (!a) return null;
      return {
        staff_id: m.id,
        full_name: m.full_name,
        services: a.services,
        clientes: a.clientes.size,
        ventas: a.ventas.size,
        vendido: Math.round(a.vendido * 100) / 100,
      };
    })
    .filter((r): r is ServicesByStaff => r !== null && r.services > 0)
    .sort((a, b) => b.services - a.services || a.full_name.localeCompare(b.full_name));
}

/** Activity report: all sold services, independent of loyalty settings. */
export interface StaffServicesReport {
  rows: ServicesByStaff[];
  services: { id: string; name: string }[];
  unassignedServices: number;
}

/** Includes missing/deleted staff in the unassigned count, never in the ranking. */
export function summarizeServicesByStaff(lines: ServiceActivityLine[], staff: { id: string; full_name: string }[]) {
  const staffIds = new Set(staff.map((member) => member.id));
  return {
    rows: aggregateServicesByStaff(lines, staff),
    unassignedServices: lines.reduce((total, line) =>
      total + (!line.staff_id || !staffIds.has(line.staff_id) ? line.quantity : 0), 0),
  };
}

export async function fetchServicesByStaff(period: CommissionPeriod): Promise<StaffServicesReport> {
  const supabase = createClient();

  const staffRes = await supabase.from("staff").select("id, full_name");
  if (staffRes.error) throw staffRes.error;

  const [itemsRes, servicesRes] = await Promise.all([supabase
    .from("sale_items")
    .select("sale_id, staff_id, quantity, line_total, sales!inner(status, created_at, customer_id)")
    .not("service_id", "is", null)
    .eq("sales.status", "completed")
    .gte("sales.created_at", period.fromTs)
    .lt("sales.created_at", period.toTs),
    supabase.from("services").select("id, name").order("name"),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (servicesRes.error) throw servicesRes.error;

  interface Row {
    sale_id: string;
    staff_id: string | null;
    quantity: number;
    line_total: number;
    sales: { customer_id: string | null } | null;
  }

  const lines: ServiceActivityLine[] = ((itemsRes.data ?? []) as unknown as Row[]).map((it) => ({
    sale_id: it.sale_id,
    staff_id: it.staff_id,
    quantity: it.quantity,
    line_total: it.line_total,
    customer_id: it.sales?.customer_id ?? null,
  }));

  return { ...summarizeServicesByStaff(lines, staffRes.data ?? []), services: servicesRes.data ?? [] };
}

// ---- Liquidación de comisiones ----

/**
 * Paga las comisiones pendientes de una persona en un período.
 *
 * Todo ocurre dentro del RPC `settle_commissions`, en UNA transacción: suma las
 * líneas pendientes, crea la liquidación, crea el gasto en la categoría
 * "Comisiones" y estampa cada línea con el id de la liquidación. Que sea una
 * sola transacción es lo que garantiza los tres criterios de aceptación que
 * importan: no se paga dos veces (solo entra lo que tiene el campo NULL, y va
 * bloqueado), el total del comprobante es la suma exacta del detalle, y el
 * gasto no puede quedar sin su liquidación ni al revés.
 */
export async function settleCommissions(input: SettleCommissionsInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("settle_commissions", {
    p_staff_id: input.staffId,
    p_from: input.period.from,
    p_to: input.period.to,
    p_from_ts: input.period.fromTs,
    p_to_ts: input.period.toTs,
    p_payment_method: input.paymentMethod,
    p_paid_on: input.paidOn,
    p_exclude_item_ids: input.excludedItemIds ?? [],
  });
  if (error) throw error;
  return data as unknown as string;
}

/** Qué se pudo reversar al anular. */
export interface VoidSettlementResult {
  /** El retiro de caja se borró: el efectivo vuelve al arqueo del turno. */
  cash_returned: boolean;
  /**
   * Salió efectivo de un turno que YA se cerró y se contó. Ese arqueo no se
   * reescribe —alguien lo firmó—, así que el desfase se resuelve a mano.
   */
  cash_locked_in_closed_shift: boolean;
}

/**
 * Anula una liquidación: las comisiones vuelven a pendiente, el gasto se borra
 * y, si el turno sigue abierto, el efectivo vuelve al arqueo.
 */
export async function voidCommissionSettlement(
  settlementId: string,
): Promise<VoidSettlementResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("void_commission_settlement", {
    p_settlement_id: settlementId,
  });
  if (error) throw error;
  return (data ?? { cash_returned: false, cash_locked_in_closed_shift: false }) as unknown as VoidSettlementResult;
}

/**
 * ¿De qué turno abierto saldría el efectivo si se liquidara ahora?
 *
 * Devuelve el id, o null si no hay dónde anotarlo (nadie con turno abierto, o
 * varios turnos abiertos y ninguno de la persona a la que se le paga). Se usa
 * solo para AVISAR en el formulario: quien decide de verdad es el RPC, que
 * vuelve a resolverlo dentro de su transacción.
 */
export async function openShiftForCommission(staffId: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("open_shift_for_commission", {
    p_staff_id: staffId,
  });
  if (error) throw error;
  return (data as unknown as string | null) ?? null;
}

/**
 * Historial de liquidaciones. Sin `staffId` trae las de todo el negocio.
 *
 * La segunda consulta busca ventas anuladas DESPUÉS de haber sido liquidadas.
 * Es el caso del checklist de QA: si se anula una venta ya pagada, el sistema
 * tiene que avisar, no cuadrar en silencio. `void_sale` no bloquea la anulación
 * a propósito —la venta puede estar mal de verdad—, así que la inconsistencia
 * se muestra donde se puede resolver: en la liquidación.
 */
export async function fetchSettlements(staffId?: string): Promise<CommissionSettlement[]> {
  const supabase = createClient();
  let query = supabase
    .from("commission_settlements")
    .select("id, staff_id, period_from, period_to, total_amount, items_count, payment_method, paid_on, status, expense_id, cash_movement_id, created_at, staff(full_name)")
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (staffId) query = query.eq("staff_id", staffId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as (Omit<CommissionSettlement, "staff_name" | "voidedSalesCount"> & {
    staff: { full_name: string } | { full_name: string }[] | null;
  })[];
  if (rows.length === 0) return [];

  const { data: voided } = await supabase
    .from("sale_items")
    .select("commission_settlement_id, sales!inner(status)")
    .in("commission_settlement_id", rows.map((r) => r.id))
    .eq("sales.status", "void");

  const voidedBySettlement = new Map<string, number>();
  for (const row of (voided ?? []) as unknown as { commission_settlement_id: string }[]) {
    voidedBySettlement.set(
      row.commission_settlement_id,
      (voidedBySettlement.get(row.commission_settlement_id) ?? 0) + 1,
    );
  }

  return rows.map((r) => {
    // El embed to-one llega como objeto, pero el generador lo tipa como array.
    const staff = Array.isArray(r.staff) ? r.staff[0] ?? null : r.staff;
    return {
      ...r,
      staff_name: staff?.full_name ?? "—",
      voidedSalesCount: voidedBySettlement.get(r.id) ?? 0,
    };
  });
}

export async function deleteStaff(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("staff").delete().eq("id", id);
  if (error) throw error;
}

export async function updateStaff(id: string, input: NewStaffInput): Promise<StaffMember> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff")
    .update({
      full_name: input.full_name,
      role: input.role || null,
      phone: input.phone || null,
      email: input.email || null,
      status: input.status,
      // `photo_url` SOLO viaja si el que llama lo mandó. Con `?? null` fijo,
      // editar el nombre de alguien le borraba la foto sin que nadie lo pidiera:
      // el formulario no manda campos que no tocó.
      ...(input.photo_url !== undefined ? { photo_url: input.photo_url } : {}),
      show_on_website: input.show_on_website,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}

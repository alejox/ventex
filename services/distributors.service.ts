import { createClient } from "@/utils/supabase/client";
import type { TablesUpdate } from "@/utils/supabase/database.types";
import { runInBatches, errorMessage as importErrorMessage, type ImportResult } from "@/lib/import/core";
import type { DistributorImportRecord } from "@/lib/import/distributors";

// ---- Tipos del dominio de distribuidores ----
export interface Distributor {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  rfc_rut: string | null;
  doc_type: string | null;
  dv: string | null;
  status: string;
  created_at: string;
}

export interface NewDistributorInput {
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  rfc_rut: string;
  doc_type: string;
  dv: string;
}

const SELECT = "id, business_name, contact_name, email, phone, whatsapp, address, city, rfc_rut, doc_type, dv, status, created_at";

export async function fetchDistributors(): Promise<Distributor[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("distributors").select(SELECT).order("business_name");
  if (error) throw error;
  return (data ?? []) as Distributor[];
}

export async function updateDistributor(id: string, input: NewDistributorInput): Promise<Distributor> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("distributors")
    .update({
      business_name: input.business_name,
      contact_name: input.contact_name || null,
      email: input.email || null,
      phone: input.phone || null,
      whatsapp: input.whatsapp || null,
      address: input.address || null,
      city: input.city || null,
      rfc_rut: input.rfc_rut || null,
      doc_type: input.doc_type || null,
      dv: input.dv || null,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Distributor;
}

export async function deleteDistributor(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("distributors").delete().eq("id", id);
  if (error) throw error;
}

export async function createDistributor(input: NewDistributorInput): Promise<Distributor> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("distributors")
    .insert({
      business_name: input.business_name,
      contact_name: input.contact_name || null,
      email: input.email || null,
      phone: input.phone || null,
      whatsapp: input.whatsapp || null,
      address: input.address || null,
      city: input.city || null,
      rfc_rut: input.rfc_rut || null,
      doc_type: input.doc_type || null,
      dv: input.dv || null,
      // user_id lo asigna el trigger set_distributors_user_id.
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Distributor;
}

/* -------------------------------------------------------------------------- */
/* Archivar, impacto del borrado e importación                                */
/* -------------------------------------------------------------------------- */

/** Archivar/reactivar: `distributors.status` ya existe, no hace falta migración. */
export async function setDistributorStatus(id: string, status: "active" | "inactive"): Promise<Distributor> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("distributors")
    .update({ status })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Distributor;
}

/**
 * Qué arrastra borrar un proveedor, verificado contra las FK en vivo:
 * - compras (`invoices`) y pedidos: quedan SIN proveedor (`ON DELETE SET NULL`);
 * - productos: la FK es `NO ACTION`, así que con productos asociados la base
 *   RECHAZA el borrado. Por eso la pantalla ofrece Archivar en ese caso.
 */
export async function fetchDistributorImpact(id: string): Promise<{ purchases: number; products: number }> {
  // (`purchase_orders` también queda en NULL, pero es un borrador: no se cuenta.)
  const supabase = createClient();
  const [purchases, products] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("distributor_id", id),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("distributor_id", id),
  ]);
  if (purchases.error) throw purchases.error;
  if (products.error) throw products.error;
  return { purchases: purchases.count ?? 0, products: products.count ?? 0 };
}

export interface DistributorImportItem {
  line: number;
  record: DistributorImportRecord;
  existingId?: string;
}

/** Crea por lotes y actualiza de a uno, solo con lo que el archivo trajo. */
export async function importDistributors(
  items: DistributorImportItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const supabase = createClient();
  const total = items.length;
  let done = 0;
  const insertRowOf = ({ record: r }: DistributorImportItem) => ({ ...r });
  const creates = items.filter((i) => !i.existingId);
  const inserted = await runInBatches(
    creates,
    200,
    async (batch) => {
      const { error } = await supabase.from("distributors").insert(batch.map(insertRowOf));
      if (error) throw error;
    },
    async (item) => {
      const { error } = await supabase.from("distributors").insert(insertRowOf(item));
      if (error) throw error;
    },
    (n) => onProgress?.((done = n), total),
  );
  const failed = [...inserted.failed];
  let updated = 0;
  for (const item of items.filter((i) => i.existingId)) {
    const patch: TablesUpdate<"distributors"> = Object.fromEntries(
      Object.entries(item.record).filter(([, value]) => value !== null && value !== ""),
    );
    const { error } = await supabase.from("distributors").update(patch).eq("id", item.existingId!);
    if (error) failed.push({ line: item.line, message: importErrorMessage(error) });
    else updated++;
    onProgress?.(++done, total);
  }
  return { created: inserted.ok, updated, skipped: 0, failed: failed.sort((a, b) => a.line - b.line) };
}

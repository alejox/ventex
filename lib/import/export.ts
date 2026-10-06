import type { CatalogRow } from "@/lib/catalog";
import { getUnitCost } from "@/services/inventory.service";
import { PRODUCT_IMPORT } from "./products";
import { CUSTOMER_IMPORT } from "./customers";
import { DISTRIBUTOR_IMPORT } from "./distributors";

/**
 * Filas de exportación (puras). Los encabezados son LOS MISMOS de la
 * plantilla de importación: un archivo exportado se puede corregir en Excel y
 * volver a subir tal cual. Las columnas extra (Estado, Duración…) el
 * importador las ignora.
 */

const labelOf = (entity: { columns: { key: string; label: string }[] }, key: string) =>
  entity.columns.find((c) => c.key === key)?.label ?? key;

const P = (key: string) => labelOf(PRODUCT_IMPORT, key);

/**
 * Catálogo completo: productos Y servicios, con la columna Tipo. Al reimportar,
 * las filas de tipo Servicio se rechazan (los servicios no se importan como
 * productos), así que el ida y vuelta no los duplica en `products`.
 *
 * El costo sale solo si quien exporta puede verlo (`inventory_costs`): exportar
 * no puede ser la puerta trasera a un dato que la pantalla le esconde.
 */
export function catalogExportRows(rows: CatalogRow[], opts: { includeCosts: boolean }): unknown[][] {
  const header = [
    P("kind"), P("name"), P("sku"), P("barcode"), P("category"), P("price"),
    ...(opts.includeCosts ? [P("cost")] : []),
    "Stock actual", P("minimumStock"), P("unit"), P("tracksStock"), P("distributor"),
    "Duración (min)", "Estado",
  ];
  const body = rows.map((row) => {
    const p = row.kind === "product" ? row.product : null;
    return [
      row.kind === "product" ? "Producto" : "Servicio",
      row.name,
      p?.sku ?? "",
      p?.barcode ?? "",
      row.categoryName ?? "",
      row.price,
      ...(opts.includeCosts ? [p ? getUnitCost(p) : ""] : []),
      p ? p.stock_level : "",
      p ? p.minimum_stock : "",
      p ? p.unit : "",
      p ? (p.tracks_stock === false ? "No" : "Sí") : "",
      p?.distributors?.business_name ?? "",
      row.kind === "service" ? row.service.duration_minutes : "",
      row.status === "active" ? "Activo" : "Archivado",
    ];
  });
  return [header, ...body];
}

const C = (key: string) => labelOf(CUSTOMER_IMPORT, key);

export function customersExportRows(
  customers: {
    full_name: string;
    doc_type: string | null;
    identification: string | null;
    phone: string | null;
    email: string | null;
    credit_limit: number | null;
    tax_exempt: boolean | null;
    credit_balance: number;
  }[],
): unknown[][] {
  const header = [
    C("full_name"), C("doc_type"), C("identification"), C("phone"), C("email"),
    C("credit_limit"), C("tax_exempt"), "Saldo por cobrar",
  ];
  return [
    header,
    ...customers.map((c) => [
      c.full_name,
      c.doc_type ?? "",
      c.identification ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.credit_limit ?? "",
      c.tax_exempt ? "Sí" : "No",
      c.credit_balance ?? 0,
    ]),
  ];
}

const D = (key: string) => labelOf(DISTRIBUTOR_IMPORT, key);

export function distributorsExportRows(
  distributors: {
    business_name: string;
    doc_type: string | null;
    rfc_rut: string | null;
    dv: string | null;
    contact_name: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    status?: string | null;
  }[],
): unknown[][] {
  const header = [
    D("business_name"), D("doc_type"), D("rfc_rut"), D("dv"), D("contact_name"),
    D("phone"), D("whatsapp"), D("email"), D("address"), D("city"), "Estado",
  ];
  return [
    header,
    ...distributors.map((d) => [
      d.business_name,
      d.doc_type ?? "",
      d.rfc_rut ?? "",
      d.dv ?? "",
      d.contact_name ?? "",
      d.phone ?? "",
      d.whatsapp ?? "",
      d.email ?? "",
      d.address ?? "",
      d.city ?? "",
      d.status === "inactive" ? "Archivado" : "Activo",
    ]),
  ];
}

/** `catalogo-2026-10-06.csv`, con la fecha LOCAL (no UTC). */
export function exportFileName(base: string, ext = "csv", now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${base}-${y}-${m}-${d}.${ext}`;
}

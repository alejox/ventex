import type { ImportEntity, RecordResult } from "./core";
import { parseDocType, DOC_TYPE_VALUES } from "./doc-types";
import { documentKey, optionalText, parseEmail, parsePhone } from "./values";

export interface DistributorImportRecord {
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
}

/**
 * "900123456-7" en la columna del NIT: el número va a un lado y el dígito de
 * verificación al otro, que es como se guardan. Solo si la columna DV vino vacía.
 */
export function splitNit(raw: string | null, dv: string | null): { nit: string | null; dv: string | null } {
  if (!raw) return { nit: raw, dv };
  const m = raw.match(/^([\d.\s]+)-(\d)$/);
  if (m && !dv) return { nit: m[1].trim(), dv: m[2] };
  return { nit: raw, dv };
}

export function distributorRecordOf(values: Record<string, string>): RecordResult<DistributorImportRecord> {
  const errors: string[] = [];
  const business_name = values.business_name.trim();
  if (!business_name) errors.push("Falta la razón social");

  let doc_type = parseDocType(values.doc_type ?? "");
  if ((values.doc_type ?? "").trim() && !doc_type) {
    errors.push(`Tipo de documento "${values.doc_type}" no reconocido. Usa: ${DOC_TYPE_VALUES.join(", ")}`);
  }
  const rawDv = optionalText(values.dv);
  if (rawDv && !/^\d$/.test(rawDv)) errors.push("El DV es un solo dígito");
  const { nit, dv } = splitNit(optionalText(values.rfc_rut), rawDv);
  if (nit && !doc_type && !(values.doc_type ?? "").trim()) doc_type = "NIT";

  const phone = parsePhone(values.phone ?? "");
  if (!phone.ok) errors.push(`Teléfono: ${phone.error}`);
  const whatsapp = parsePhone(values.whatsapp ?? "");
  if (!whatsapp.ok) errors.push(`WhatsApp: ${whatsapp.error}`);
  const email = parseEmail(values.email ?? "");
  if (!email.ok) errors.push(`Correo: ${email.error}`);

  if (errors.length > 0) return { record: null, errors };
  return {
    record: {
      business_name,
      doc_type: nit ? doc_type : null,
      rfc_rut: nit,
      dv: nit ? dv : null,
      contact_name: optionalText(values.contact_name),
      phone: phone.ok ? phone.value : null,
      whatsapp: whatsapp.ok ? whatsapp.value : null,
      email: email.ok ? email.value : null,
      address: optionalText(values.address),
      city: optionalText(values.city),
    },
    errors,
  };
}

export const DISTRIBUTOR_IMPORT: ImportEntity<DistributorImportRecord> = {
  noun: "proveedores",
  columns: [
    { key: "business_name", label: "Razón social", required: true, aliases: ["razon social", "nombre", "proveedor", "empresa", "distribuidor"], example: "Distribuidora El Sol S.A.S.", help: "Se guarda tal como lo escribas." },
    { key: "doc_type", label: "Tipo de documento", aliases: ["tipo doc", "tipo de doc"], example: "NIT", help: `Uno de: ${DOC_TYPE_VALUES.join(", ")}. Vacío con documento = NIT.` },
    { key: "rfc_rut", label: "NIT / Documento", aliases: ["nit", "documento", "numero de documento", "número de documento", "rut", "identificacion", "identificación"], example: "900123456", help: "Opcional. Si ya existe un proveedor con ese documento, se actualiza o se omite. Acepta 900123456-7." },
    { key: "dv", label: "DV", aliases: ["digito de verificacion", "dígito de verificación"], example: "7" },
    { key: "contact_name", label: "Contacto", aliases: ["nombre de contacto", "vendedor", "asesor"], example: "Carlos Ruiz" },
    { key: "phone", label: "Teléfono", aliases: ["telefono", "celular"], example: "+57 300 123 4567" },
    { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp"], example: "+57 300 123 4567" },
    { key: "email", label: "Correo", aliases: ["email", "correo electronico", "correo electrónico"], example: "pedidos@elsol.com" },
    { key: "address", label: "Dirección", aliases: ["direccion"], example: "Cra 7 # 12-34" },
    { key: "city", label: "Ciudad", aliases: ["municipio"], example: "Bogotá" },
  ],
  toRecord: distributorRecordOf,
  keysOf: (r) => (r.rfc_rut ? [`doc:${documentKey(r.rfc_rut)}`] : []),
  keyLabels: { doc: "NIT o documento" },
};

export function existingDistributorKeys(distributors: { id: string; rfc_rut: string | null }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of distributors) {
    const key = documentKey(d.rfc_rut);
    if (key) map.set(`doc:${key}`, d.id);
  }
  return map;
}

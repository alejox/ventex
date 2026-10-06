import type { ImportEntity, RecordResult } from "./core";
import { parseDocType, DOC_TYPE_VALUES } from "./doc-types";
import { documentKey, optionalText, parseEmail, parseNumberCO, parsePhone, parseYesNo } from "./values";

export interface CustomerImportRecord {
  full_name: string;
  doc_type: string | null;
  identification: string | null;
  phone: string | null;
  email: string | null;
  credit_limit: number | null;
  tax_exempt: boolean | null;
}

export function customerRecordOf(values: Record<string, string>): RecordResult<CustomerImportRecord> {
  const errors: string[] = [];
  const full_name = values.full_name.trim();
  if (!full_name) errors.push("Falta el nombre");

  const identification = optionalText(values.identification);
  let doc_type = parseDocType(values.doc_type ?? "");
  if ((values.doc_type ?? "").trim() && !doc_type) {
    errors.push(`Tipo de documento "${values.doc_type}" no reconocido. Usa: ${DOC_TYPE_VALUES.join(", ")}`);
  }
  if (identification && !doc_type && !(values.doc_type ?? "").trim()) doc_type = "CC";
  if (identification && /e\+?\d+$/i.test(identification)) {
    errors.push("Excel convirtió el documento a notación científica: formatea la columna como Texto");
  }

  const phone = parsePhone(values.phone ?? "");
  if (!phone.ok) errors.push(`Teléfono: ${phone.error}`);
  const email = parseEmail(values.email ?? "");
  if (!email.ok) errors.push(`Correo: ${email.error}`);
  const credit = parseNumberCO(values.credit_limit ?? "");
  if (!credit.ok) errors.push(`Cupo de crédito: ${credit.error}`);
  else if (credit.value !== null && credit.value < 0) errors.push("El cupo de crédito no puede ser negativo");
  const exempt = parseYesNo(values.tax_exempt ?? "");
  if (!exempt.ok) errors.push(`Exento de IVA: ${exempt.error}`);

  if (errors.length > 0) return { record: null, errors };
  return {
    record: {
      full_name,
      doc_type: identification ? doc_type : null,
      identification,
      phone: phone.ok ? phone.value : null,
      email: email.ok ? email.value : null,
      credit_limit: credit.ok ? credit.value : null,
      tax_exempt: exempt.ok ? exempt.value : null,
    },
    errors,
  };
}

export const CUSTOMER_IMPORT: ImportEntity<CustomerImportRecord> = {
  noun: "clientes",
  columns: [
    { key: "full_name", label: "Nombre", required: true, aliases: ["nombre completo", "cliente", "nombres"], example: "María Gómez", help: "Se guarda tal como lo escribas." },
    { key: "doc_type", label: "Tipo de documento", aliases: ["tipo doc", "tipo de doc"], example: "CC", help: `Uno de: ${DOC_TYPE_VALUES.join(", ")}. Vacío con documento = CC.` },
    { key: "identification", label: "Documento", aliases: ["numero de documento", "número de documento", "cedula", "cédula", "identificacion", "identificación", "nit"], example: "1020304050", help: "Opcional. Si ya existe un cliente con ese documento, se actualiza o se omite." },
    { key: "phone", label: "Teléfono", aliases: ["telefono", "celular", "whatsapp", "movil", "móvil"], example: "+57 300 123 4567", help: "Opcional. Con indicativo si es de otro país." },
    { key: "email", label: "Correo", aliases: ["email", "correo electronico", "correo electrónico", "e-mail"], example: "maria@correo.com" },
    { key: "credit_limit", label: "Cupo de crédito", aliases: ["cupo", "limite de credito", "límite de crédito"], example: "200000", help: "Opcional. Hasta cuánto se le puede fiar." },
    { key: "tax_exempt", label: "Exento de IVA", aliases: ["exento"], example: "No", help: "Sí o No. Vacío = No." },
  ],
  toRecord: customerRecordOf,
  keysOf: (r) => (r.identification ? [`doc:${documentKey(r.identification)}`] : []),
  keyLabels: { doc: "documento" },
};

export function existingCustomerKeys(customers: { id: string; identification: string | null }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of customers) {
    const key = documentKey(c.identification);
    if (key) map.set(`doc:${key}`, c.id);
  }
  return map;
}

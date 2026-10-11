"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useCustomersStore } from "@/stores/customers.store";

export function QuickCustomerModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void;
}) {
  if (!open) return null;
  return <QuickCustomerForm onClose={onClose} onCreated={onCreated} />;
}

function QuickCustomerForm({ onClose, onCreated }: Omit<Parameters<typeof QuickCustomerModal>[0], "open">) {
  const addCustomer = useCustomersStore((s) => s.addCustomer);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fieldClass = "w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
  return <Modal open title="Crear cliente" description="Con su nombre puedes agendar. Agrega el teléfono para confirmar su visita."
    onClose={() => { if (!saving) onClose(); }}
    footer={<div className="flex justify-end gap-2"><Button variant="ghost" disabled={saving} onClick={onClose}>Cancelar</Button>
      <Button type="submit" form="quick-customer-form" loading={saving}>Crear y seleccionar</Button></div>}>
    <form id="quick-customer-form" className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      if (saving || !name.trim()) return;
      setSaving(true);
      setError("");
      const customer = await addCustomer({ full_name: name.trim(), phone: phone.trim(), email: "", identification: "", doc_type: "CC", tax_exempt: false });
      setSaving(false);
      if (customer) onCreated(customer.id);
      else setError(useCustomersStore.getState().error ?? "No se pudo crear el cliente. Intenta de nuevo.");
    }}>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <label className="block space-y-1 text-sm font-semibold">Nombre completo *<input data-autofocus required maxLength={150} disabled={saving} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} autoComplete="name" /></label>
      <label className="block space-y-1 text-sm font-semibold">Teléfono (opcional)<input type="tel" maxLength={30} disabled={saving} value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} placeholder="+57 300 123 4567" autoComplete="tel" /></label>
    </form>
  </Modal>;
}

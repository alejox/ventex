"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/stores/settings.store";
import { usePrintSettingsStore } from "@/stores/print-settings.store";
import type { Settings } from "@/services/settings.service";
import { buildSampleReceipt, normalizeReceiptSettings, RECEIPT_TEXT_MAX_LENGTH, type ReceiptSettings, type PaperWidth } from "@/lib/receipt-settings";
import { PosReceipt, ReceiptContent } from "@/components/PosReceipt";
import { CashDrawerCard } from "../CashDrawerCard";

const fields = [
  ["showLogo", "Logo"], ["showBusiness", "Nombre del negocio"],
  ["showContact", "Contacto"], ["showCustomer", "Cliente"],
  ["showCashier", "Cajero"], ["showSeller", "Vendedor"],
] as const;

export default function PrintingSettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const error = useSettingsStore((s) => s.error);
  const ensureSettings = useSettingsStore((s) => s.ensureSettings);
  const init = usePrintSettingsStore((s) => s.init);
  useEffect(() => { void ensureSettings(); init(); }, [ensureSettings, init]);
  if (!settings) return <p role={error ? "alert" : "status"}>{error ?? "Cargando…"}</p>;
  return <PrintingEditor key={settings.id ?? "new"} settings={settings} />;
}

function PrintingEditor({ settings }: { settings: Settings }) {
  const [draft, setDraft] = useState(() => normalizeReceiptSettings(settings.business_profile.receiptSettings));
  const [date] = useState(() => new Date());
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState("");
  const sampleRef = useRef<HTMLDivElement>(null);
  const submitting = useSettingsStore((s) => s.submitting);
  const error = useSettingsStore((s) => s.error);
  const save = useSettingsStore((s) => s.saveReceiptSettings);
  const paperWidth = usePrintSettingsStore((s) => s.paperWidth);
  const hydrated = usePrintSettingsStore((s) => s.hydrated);
  const storageAvailable = usePrintSettingsStore((s) => s.storageAvailable);
  const setPaperWidth = usePrintSettingsStore((s) => s.setPaperWidth);
  const sample = buildSampleReceipt(settings.business_profile, date, settings.include_tax);
  const update = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => {
    setDraft((current) => normalizeReceiptSettings({ ...current, [key]: value }));
    setMessage("");
  };

  const printSample = async () => {
    setPrinting(true);
    setMessage("");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const images = Array.from(sampleRef.current?.querySelectorAll("img") ?? []);
      // A slow/broken logo must not silently produce a partial test ticket.
      await Promise.race([
        Promise.all(images.map((image) => image.decode())),
        new Promise<never>((_, reject) => timeout = setTimeout(() => reject(new Error("Logo timeout")), 5000)),
      ]);
      window.print();
    } catch {
      setMessage("No se pudo cargar el logo. Intenta de nuevo o desactívalo para imprimir la prueba.");
    } finally { clearTimeout(timeout); setPrinting(false); }
  };

  return (
    <>
      <div className="space-y-6 print:hidden">
        <section className="rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-5 sm:p-8">
          <h2 className="text-xl font-bold">Impresión</h2>
          <p className="text-sm text-on-surface-variant mt-2">Personaliza el ticket de todo tu negocio. Los importes, impuestos y avisos fiscales siempre se muestran.</p>
          <fieldset disabled={printing || submitting}>
          <div className="grid sm:grid-cols-2 gap-3 my-6">
            {fields.map(([key, label]) => <label key={key} className="flex items-center gap-3"><input type="checkbox" checked={draft[key]} onChange={(event) => update(key, event.target.checked)} />{label}</label>)}
          </div>
          {([ ["headerText", "Encabezado"], ["footerText", "Pie del ticket"] ] as const).map(([key, label]) => (
            <label key={key} className="block mb-4 text-sm font-semibold">{label}
              <textarea value={draft[key]} maxLength={RECEIPT_TEXT_MAX_LENGTH} onChange={(event) => update(key, event.target.value)} className="mt-2 block w-full min-h-24 rounded-xl border border-outline-variant/30 p-3 font-normal" />
              <span className="text-xs font-normal text-on-surface-variant">Solo texto · {draft[key].length}/{RECEIPT_TEXT_MAX_LENGTH}</span>
            </label>
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={submitting} className="rounded-xl px-5 py-3 bg-primary text-on-primary disabled:opacity-50" onClick={async () => { if (await save(draft)) setMessage("Diseño guardado."); }}>Guardar</button>
            <button type="button" disabled={submitting} className="rounded-xl px-5 py-3 border border-outline-variant/30" onClick={() => { setDraft(normalizeReceiptSettings(settings.business_profile.receiptSettings)); setMessage(""); }}>Cancelar</button>
          </div>
          </fieldset>
          {error && <p role="alert" className="mt-3 text-error">{error}</p>}
          {message && <p role="status" className="mt-3 text-sm">{message}</p>}
        </section>

        <section className="rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-5 sm:p-8">
          <h2 className="text-lg font-bold">Papel de esta terminal</h2>
          <label className="block my-3 text-sm">Ancho del papel
            <select value={paperWidth} disabled={!hydrated || printing} onChange={(event) => setPaperWidth(event.target.value as PaperWidth)} className="block mt-2 rounded-xl border border-outline-variant/30 p-3"><option value="80mm">80 mm</option><option value="58mm">58 mm</option></select>
          </label>
          <p className="text-sm text-on-surface-variant">Solo se guarda en este navegador. La impresora se elige en el diálogo del navegador o del sistema; no hay impresión silenciosa.</p>
          {!storageAvailable && <p role="status" className="mt-2 text-sm">No se pudo guardar el ancho. Se usará durante esta sesión.</p>}
        </section>

        <section className="min-w-0 rounded-3xl border border-outline-variant/20 bg-surface-container-low p-3 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold">Vista previa</h2>
            <button type="button" disabled={!hydrated || printing} onClick={printSample} className="rounded-xl px-4 py-3 bg-primary text-on-primary disabled:opacity-50">{printing ? "Preparando…" : "Imprimir prueba"}</button>
          </div>
          <ReceiptContent data={sample} settings={draft} paperWidth={paperWidth} sample />
        </section>

        <section>
          <h2 className="text-lg font-bold mb-2">Equipos de esta terminal</h2>
          <CashDrawerCard />
        </section>
      </div>
      <div ref={sampleRef}><PosReceipt data={sample} settings={draft} paperWidth={paperWidth} sample /></div>
    </>
  );
}

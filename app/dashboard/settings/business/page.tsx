"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSettingsStore } from "@/stores/settings.store";
import {
  TAX_REGIME_LABEL,
  taxRegimeOf,
  taxSettingsForRegime,
  type BusinessProfile,
  type Settings,
  type TaxRegime,
} from "@/services/settings.service";
import { notifySuccess } from "@/lib/notifications";
import { validateBusinessLogoFile, type BusinessLogoFileError } from "@/lib/business-logo";
import { Select } from "@/components/ui/Select";
import { CitySelect } from "@/components/CitySelect";
import { useProfile } from "@/components/ProfileProvider";

function CameraIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  );
}

function Field({ label, required, children, className = "" }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-sm font-semibold text-on-surface">
        {label} {required && <span className="text-primary">*</span>}
      </label>
      {children}
    </div>
  );
}

function logoValidationMessage(error: BusinessLogoFileError): string {
  if (error === "too_large") return "El logo no puede superar los 2 MB.";
  if (error === "empty") return "El archivo del logo está vacío.";
  return "El archivo debe ser una imagen PNG, JPG, WEBP, GIF o SVG.";
}

export default function BusinessSettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (loading || !settings) {
    return <div className="p-8 text-sm text-on-surface-variant">Cargando…</div>;
  }

  // El `key` remonta el formulario cuando llegan otros ajustes, así el estado
  // inicial se siembra en `useState` y no hace falta un efecto que copie el
  // store al state (que además disparaba renders en cascada).
  return <BusinessProfileForm key={settings.id ?? "new"} settings={settings} />;
}

function BusinessProfileForm({ settings }: { settings: Settings }) {
  const submitting = useSettingsStore((s) => s.submitting);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const uploadLogo = useSettingsStore((s) => s.uploadLogo);
  const profile = useProfile();
  const isTienda = profile?.businessType === "tienda";

  const [form, setForm] = useState<BusinessProfile>(() => settings.business_profile ?? {});
  // El régimen se siembra desde `include_tax`, no desde `taxResponsibility`:
  // si los dos quedaron desfasados, se muestra lo que de verdad se cobra.
  const [regime, setRegime] = useState<TaxRegime>(() => taxRegimeOf(settings.include_tax));
  const [taxPercent, setTaxPercent] = useState(() => String(+(settings.tax_rate * 100).toFixed(2)));
  const [icuiPercent, setIcuiPercent] = useState(() => String(+(settings.icui_rate * 100).toFixed(2)));
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(() => settings.business_profile?.logoUrl ?? "");
  const [logoDragActive, setLogoDragActive] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const uploadingLogoRef = useRef(false);
  const logoObjectUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
  }, []);

  const update = useCallback(<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const processLogoFile = useCallback(async (file: File) => {
    if (uploadingLogoRef.current) return;

    const validationError: BusinessLogoFileError | null = validateBusinessLogoFile(file);
    if (validationError) {
      setLogoError(logoValidationMessage(validationError));
      return;
    }

    const previousPreviewUrl = form.logoUrl ?? "";
    const previewUrl = URL.createObjectURL(file);
    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    logoObjectUrlRef.current = previewUrl;
    setLogoPreviewUrl(previewUrl);
    setLogoError(null);
    uploadingLogoRef.current = true;
    setUploadingLogo(true);

    try {
      const uploadedUrl = await uploadLogo(file);
      if (uploadedUrl) {
        setForm((prev) => ({ ...prev, logoUrl: uploadedUrl }));
        setLogoPreviewUrl(uploadedUrl);
        URL.revokeObjectURL(previewUrl);
        logoObjectUrlRef.current = null;
      } else {
        setLogoPreviewUrl(previousPreviewUrl);
        URL.revokeObjectURL(previewUrl);
        logoObjectUrlRef.current = null;
        setLogoError("No se pudo subir el logo. Inténtalo de nuevo.");
      }
    } catch {
      setLogoPreviewUrl(previousPreviewUrl);
      URL.revokeObjectURL(previewUrl);
      logoObjectUrlRef.current = null;
      setLogoError("No se pudo subir el logo. Inténtalo de nuevo.");
    } finally {
      uploadingLogoRef.current = false;
      setUploadingLogo(false);
    }
  }, [form.logoUrl, uploadLogo]);

  const handleLogoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-seleccionar el mismo archivo
    if (file) void processLogoFile(file);
  }, [processLogoFile]);

  const handleLogoDrop = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setLogoDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) void processLogoFile(file);
  }, [processLogoFile]);

  /** Descarta lo editado: vuelve a lo último guardado. */
  const handleCancel = () => {
    if (uploadingLogoRef.current) return;
    setForm(settings.business_profile ?? {});
    setLogoPreviewUrl(settings.business_profile?.logoUrl ?? "");
    setRegime(taxRegimeOf(settings.include_tax));
    setTaxPercent(String(+(settings.tax_rate * 100).toFixed(2)));
    setIcuiPercent(String(+(settings.icui_rate * 100).toFixed(2)));
    setLogoError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingLogoRef.current) return;
    // IVA y régimen van en el MISMO guardado: no pueden volver a contradecirse.
    const tax = taxSettingsForRegime(regime, taxPercent, settings.tax_rate);
    // ICUI: tasa en porcentaje, 0..100, guardada como fracción (0..1).
    const icuiPct = parseFloat(icuiPercent);
    const icuiRate = Number.isFinite(icuiPct)
      ? Math.round(Math.min(Math.max(icuiPct, 0), 100) / 100 * 10000) / 10000
      : settings.icui_rate;
    // Printing preferences belong to their own editor, not this form snapshot.
    const { receiptSettings: _receiptSettings, ...businessProfile } = form;
    void _receiptSettings;
    const ok = await saveSettings({
      tax_rate: tax.tax_rate,
      include_tax: tax.include_tax,
      ...(isTienda ? { icui_rate: icuiRate } : {}),
      allow_oversell: settings.allow_oversell,
      currency: settings.currency,
      business_profile: { ...businessProfile, taxResponsibility: tax.taxResponsibility },
    });
    if (ok) {
      notifySuccess("Ajustes guardados", "Los datos de tu negocio se actualizaron correctamente.");
    }
  };

  return (
    <form onSubmit={handleSave} className="w-full max-w-5xl mx-auto pb-24 animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Datos de tu negocio</h1>
        <p className="text-sm text-on-surface-variant mt-1">Actualiza la información de tu negocio que aparecerá en tus facturas</p>
      </div>

      <div className="space-y-6">
        {/* Card: Información general */}
        <div className="bg-surface-container-lowest rounded-3xl overflow-hidden shadow-sm border border-outline-variant/10">
          <div className="p-6 md:p-8">
            <h2 className="text-lg font-bold text-on-surface">Información general</h2>
            <p className="text-sm text-on-surface-variant mt-1">Configura la información principal y los datos de contacto de tu negocio.</p>
          </div>
          
          <hr className="border-outline-variant/10" />

          <div className="p-6 md:p-8 space-y-8">
            {/* Logo Upload Section */}
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="relative w-full md:w-64">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoChange}
                  aria-label="Seleccionar archivo de logo"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  onDragEnter={(e) => { e.preventDefault(); if (!uploadingLogo) setLogoDragActive(true); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragLeave={(e) => { e.preventDefault(); setLogoDragActive(false); }}
                  onDrop={handleLogoDrop}
                  disabled={uploadingLogo}
                  aria-describedby="business-logo-help"
                  className={`w-full h-40 rounded-xl border-2 border-dashed overflow-hidden bg-surface-container flex flex-col items-center justify-center gap-2 transition-colors disabled:cursor-wait disabled:opacity-70 ${logoDragActive ? "border-primary bg-primary/5" : "border-outline-variant hover:border-primary"}`}
                >
                  {logoPreviewUrl ? (
                    // `next/image` exige declarar el host de Supabase para esta miniatura puntual.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreviewUrl} alt="Vista previa del logo" className="w-full h-full object-contain" />
                  ) : (
                    <>
                      <CameraIcon className="w-6 h-6 text-primary" aria-hidden="true" />
                      <span className="text-sm font-semibold text-on-surface">Arrastra tu logo aquí</span>
                      <span className="text-xs text-on-surface-variant">o haz clic para seleccionarlo</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="absolute -bottom-3 -right-3 w-10 h-10 bg-surface-container-lowest border border-outline-variant/20 rounded-full flex items-center justify-center text-on-surface shadow-sm hover:bg-surface-container transition-colors disabled:opacity-50"
                  aria-label="Cambiar logo"
                >
                  <CameraIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-on-surface">Se mostrará en la parte superior de tus facturas de venta.</p>
                <p id="business-logo-help" className="text-sm text-on-surface-variant mt-1">Sube una imagen PNG, JPG, WEBP, GIF o SVG de hasta 2 MB. Recuerda pulsar <span className="font-semibold">Guardar</span> para conservar los cambios.</p>
                {uploadingLogo && <p className="text-sm text-on-surface-variant mt-1" role="status">Subiendo logo…</p>}
                {logoError && <p className="text-sm text-error mt-1">{logoError}</p>}
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Form Fields: Essential contact info */}
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre comercial" required>
                  <input type="text" value={form.businessName ?? ""} onChange={(e) => update("businessName", e.target.value)} placeholder="Ej. Barbería El Galón" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Teléfono">
                  <input type="tel" value={form.phone ?? ""} onChange={(e) => update("phone", e.target.value)} placeholder="Ej. +57 300 123 4567" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Correo electrónico">
                  <input type="email" value={form.email ?? ""} onChange={(e) => update("email", e.target.value)} placeholder="contacto@minegocio.com" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Dirección">
                  <input type="text" value={form.address ?? ""} onChange={(e) => update("address", e.target.value)} placeholder="Calle 10 # 5-20" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Municipio / Departamento">
                  <CitySelect value={form.municipality ?? ""} onChange={(municipality) => update("municipality", municipality)} aria-label="Municipio / Departamento" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
              </div>

              {/* Accordion: DIAN / Legal tax fields */}
              <details className="group border border-outline-variant/20 rounded-2xl p-4 bg-surface-container-low transition-all">
                <summary className="font-semibold text-sm text-on-surface cursor-pointer flex items-center justify-between select-none">
                  <span>¿Requieres facturación electrónica / DIAN? (Datos tributarios opcionales)</span>
                  <span className="text-xs text-primary font-medium group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 space-y-6 pt-4 border-t border-outline-variant/10">
                  {/* Tipo de persona */}
                  <div>
                    <label className="block text-sm font-semibold text-on-surface mb-2">Tipo de persona</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(["natural", "juridica"] as const).map((t) => (
                        <label key={t} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.personType === t ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
                          <input type="radio" name="person_type" value={t} checked={form.personType === t} onChange={() => update("personType", t)} className="hidden" />
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.personType === t ? 'border-primary' : 'border-outline-variant/50'}`}>
                            {form.personType === t && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <span className="font-medium text-sm capitalize">{t === "natural" ? "Persona natural" : "Persona jurídica"}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Identification Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    <div className="sm:col-span-4">
                      <Select
                        label="Tipo de identificación"
                        value={form.identificationType ?? ""}
                        onChange={(e) => update("identificationType", e.target.value)}
                      >
                        <option value="">Seleccionar</option>
                        <option value="NIT">NIT - Número de identificación tributaria</option>
                        <option value="CC">CC - Cédula de ciudadanía</option>
                      </Select>
                    </div>
                    <Field label="Número de identificación" className="sm:col-span-4">
                      <input type="text" value={form.identificationNumber ?? ""} onChange={(e) => update("identificationNumber", e.target.value)} placeholder="9012345678" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                    </Field>
                    <Field label="DV" className="sm:col-span-4">
                      <input type="text" value={form.dv ?? ""} onChange={(e) => update("dv", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container border border-outline-variant/10 rounded-lg text-sm text-on-surface-variant focus:outline-none" />
                    </Field>
                  </div>

                  {/* Names Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Primer nombre">
                      <input type="text" value={form.firstName ?? ""} onChange={(e) => update("firstName", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                    </Field>
                    <Field label="Segundo nombre">
                      <input type="text" value={form.secondName ?? ""} onChange={(e) => update("secondName", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                    </Field>
                    <Field label="Apellidos">
                      <input type="text" value={form.lastName ?? ""} onChange={(e) => update("lastName", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                    </Field>
                  </div>

                  {/* Postal Code & Website Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Código postal">
                      <input type="text" value={form.postalCode ?? ""} onChange={(e) => update("postalCode", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                    </Field>
                    <Field label="Sitio web">
                      <input type="url" value={form.website ?? ""} onChange={(e) => update("website", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                    </Field>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* Card: IVA. Es el ÚNICO control del IVA del negocio: escribe
            `settings.include_tax` (lo que mira el cobro) y la tasa. */}
        <div className="bg-surface-container-lowest rounded-3xl overflow-hidden shadow-sm border border-outline-variant/10">
          <div className="p-6 md:p-8">
            <h2 className="text-lg font-bold text-on-surface">IVA</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Elige si tu negocio cobra IVA. Si no eres responsable, el IVA no aparece en el punto de venta, los recibos ni los reportes.
            </p>
          </div>

          <hr className="border-outline-variant/10" />

          <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Responsabilidad tributaria"
              value={regime}
              onChange={(e) => setRegime(e.target.value as TaxRegime)}
            >
              <option value="responsable">{TAX_REGIME_LABEL.responsable}</option>
              <option value="no_responsable">{TAX_REGIME_LABEL.no_responsable}</option>
            </Select>
            {regime === "responsable" && (
              <Field label="Tasa de IVA (%)" required>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  placeholder="19"
                  className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface"
                />
              </Field>
            )}
            {regime === "responsable" && (
              <p className="sm:col-span-2 text-xs text-on-surface-variant">
                Los precios de tu catálogo ya incluyen el IVA: esta tasa se usa para extraerlo del precio y mostrarlo desglosado. Los clientes marcados como exentos pagan solo la base.
              </p>
            )}
          </div>
        </div>

        {/* Card: ICUI. Tasa configurable del impuesto a los comestibles
            ultraprocesados (Ley 2277 de 2022, Colombia). Solo compras: el ICUI
            ya viene en el costo y no se cobra en ventas. Se muestra solo en
            tienda, el rubro que maneja alimentos. */}
        {isTienda && (
          <div className="bg-surface-container-lowest rounded-3xl overflow-hidden shadow-sm border border-outline-variant/10">
            <div className="p-6 md:p-8">
              <h2 className="text-lg font-bold text-on-surface">ICUI</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Impuesto a los comestibles ultraprocesados. Se registra en las compras de los productos marcados; no se cobra al cliente porque ya viene en tu costo.
              </p>
            </div>

            <hr className="border-outline-variant/10" />

            <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tasa de ICUI (%)" required>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={icuiPercent}
                  onChange={(e) => setIcuiPercent(e.target.value)}
                  placeholder="20"
                  className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface"
                />
              </Field>
              <p className="sm:col-span-2 text-xs text-on-surface-variant">
                La tarifa nacional actual es del 20 %. Cámbiala aquí si el Gobierno la ajusta.
              </p>
            </div>
          </div>
        )}

        {/* "Información básica" (Sector, Precisión y Separador decimal) se quitó:
            ningún lado de la app leía esos valores. Siguen en `business_profile` si
            alguien los guardó antes — el formulario los conserva al guardar. */}
      </div>

      {/* Sticky Footer Area */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-surface-container-lowest border-t border-outline-variant/10 p-4 px-6 md:px-10 z-10 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-sm text-on-surface-variant font-medium">
          Los campos marcados con <span className="text-primary">*</span> son obligatorios
        </p>
        <div className="flex gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting || uploadingLogo}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface font-semibold hover:bg-surface-container-low transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={submitting || uploadingLogo} className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50">
            {submitting ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </form>
  );
}

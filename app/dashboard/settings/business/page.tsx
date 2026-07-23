"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSettingsStore } from "@/stores/settings.store";
import type { BusinessProfile, Settings } from "@/services/settings.service";
import { notifySuccess } from "@/lib/notifications";
import { Select } from "@/components/ui/Select";

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

  const [form, setForm] = useState<BusinessProfile>(() => settings.business_profile ?? {});
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback(<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleLogoChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // permite re-seleccionar el mismo archivo
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        setLogoError("El logo no puede superar los 2 MB.");
        return;
      }

      setLogoError(null);
      setUploadingLogo(true);
      const url = await uploadLogo(file);
      setUploadingLogo(false);
      if (url) {
        setForm((prev) => ({ ...prev, logoUrl: url }));
      } else {
        setLogoError("No se pudo subir el logo. Inténtalo de nuevo.");
      }
    },
    [uploadLogo],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await saveSettings({
      tax_rate: settings.tax_rate,
      include_tax: settings.include_tax,
      allow_oversell: settings.allow_oversell,
      currency: settings.currency,
      business_profile: form,
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
              <div className="relative">
                <div className="w-64 h-32 rounded-xl border-2 border-primary overflow-hidden bg-surface-container flex items-center justify-center">
                  {uploadingLogo ? (
                    <div className="text-on-surface-variant font-medium text-sm">Subiendo…</div>
                  ) : form.logoUrl ? (
                    // Preview de 256x128 de un logo recién subido a Storage.
                    // `next/image` exigiría declarar el host de Supabase en
                    // remotePatterns para optimizar una miniatura que se ve una
                    // vez: no compensa el acoplamiento.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-on-surface-variant font-medium">Logo</div>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="absolute -bottom-3 -right-3 w-10 h-10 bg-surface-container-lowest border border-outline-variant/20 rounded-full flex items-center justify-center text-on-surface shadow-sm hover:bg-surface-container transition-colors disabled:opacity-50"
                  aria-label="Subir logo"
                >
                  <CameraIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-on-surface">Se mostrará en la parte superior de tus facturas de venta.</p>
                <p className="text-sm text-on-surface-variant mt-1">Sube una imagen PNG, JPG, WEBP o SVG de hasta 2 MB. Recuerda pulsar <span className="font-semibold">Guardar</span> para conservar los cambios.</p>
                {logoError && <p className="text-sm text-error mt-1">{logoError}</p>}
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Form Fields */}
            <div className="space-y-6">
              {/* Tipo de persona */}
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-2">Tipo de persona <span className="text-primary">*</span></label>
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

              {/* Row 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-4">
                  <Select
                    label="Tipo de identificación *"
                    value={form.identificationType ?? ""}
                    onChange={(e) => update("identificationType", e.target.value)}
                  >
                    <option value="">Seleccionar</option>
                    <option value="NIT">NIT - Número de identificación tributaria</option>
                    <option value="CC">CC - Cédula de ciudadanía</option>
                  </Select>
                </div>
                <Field label="Número de identificación" required className="sm:col-span-3">
                  <input type="text" value={form.identificationNumber ?? ""} onChange={(e) => update("identificationNumber", e.target.value)} placeholder="9012345678" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="DV" required className="sm:col-span-2">
                  <input type="text" value={form.dv ?? ""} onChange={(e) => update("dv", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container border border-outline-variant/10 rounded-lg text-sm text-on-surface-variant focus:outline-none" />
                </Field>
                <div className="sm:col-span-3">
                  <Select
                    label="Tipo de persona según nacionalidad *"
                    value={form.nationalityType ?? ""}
                    onChange={(e) => update("nationalityType", e.target.value)}
                  >
                    <option value="">Seleccionar</option>
                    <option value="Nacional">Nacional</option>
                    <option value="Extranjero">Extranjero</option>
                  </Select>
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Primer nombre" required>
                  <input type="text" value={form.firstName ?? ""} onChange={(e) => update("firstName", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Segundo nombre">
                  <input type="text" value={form.secondName ?? ""} onChange={(e) => update("secondName", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Apellidos" required>
                  <input type="text" value={form.lastName ?? ""} onChange={(e) => update("lastName", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Nombre comercial">
                  <input type="text" value={form.businessName ?? ""} onChange={(e) => update("businessName", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <div>
                  <Select
                    label="Responsabilidad tributaria *"
                    value={form.taxResponsibility ?? ""}
                    onChange={(e) => update("taxResponsibility", e.target.value)}
                  >
                    <option value="">Seleccionar</option>
                    <option value="Responsable de IVA">Responsable de IVA</option>
                    <option value="No responsable de IVA">No responsable de IVA</option>
                  </Select>
                </div>
                <Field label="Municipio / Departamento">
                  <input type="text" value={form.municipality ?? ""} onChange={(e) => update("municipality", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
              </div>

              {/* Row 4 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Dirección">
                  <input type="text" value={form.address ?? ""} onChange={(e) => update("address", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Código postal">
                  <input type="text" value={form.postalCode ?? ""} onChange={(e) => update("postalCode", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Correo electrónico">
                  <input type="email" value={form.email ?? ""} onChange={(e) => update("email", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
              </div>

              {/* Row 5 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Teléfono">
                  <input type="tel" value={form.phone ?? ""} onChange={(e) => update("phone", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Sitio web">
                  <input type="url" value={form.website ?? ""} onChange={(e) => update("website", e.target.value)} className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Información básica */}
        <div className="bg-surface-container-lowest rounded-3xl overflow-hidden shadow-sm border border-outline-variant/10">
          <div className="p-6 md:p-8">
            <h2 className="text-lg font-bold text-on-surface">Información basica</h2>
            <p className="text-sm text-on-surface-variant mt-1">Configura algunos datos necesarios para la generación de tus documentos y transacciones.</p>
          </div>
          
          <hr className="border-outline-variant/10" />

          <div className="p-6 md:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Select
                  label="Sector"
                  value={form.sector ?? ""}
                  onChange={(e) => update("sector", e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  <option value="Otros">Otros</option>
                  <option value="Tecnología">Tecnología</option>
                  <option value="Alimentación">Alimentación</option>
                </Select>
              </div>
              <div>
                <Select
                  label="Precisión decimal *"
                  value={form.decimalPrecision ?? "2"}
                  onChange={(e) => update("decimalPrecision", e.target.value)}
                >
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </Select>
              </div>
              <div>
                <Select
                  label="Separador decimal *"
                  value={form.decimalSeparator ?? ","}
                  onChange={(e) => update("decimalSeparator", e.target.value)}
                >
                  <option value=",">,</option>
                  <option value=".">.</option>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Footer Area */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-surface-container-lowest border-t border-outline-variant/10 p-4 px-6 md:px-10 z-10 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-sm text-on-surface-variant font-medium">
          Los campos marcados con <span className="text-primary">*</span> son obligatorios
        </p>
        <div className="flex gap-3 w-full sm:w-auto">
          <button type="button" className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface font-semibold hover:bg-surface-container-low transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={submitting} className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50">
            {submitting ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </form>
  );
}

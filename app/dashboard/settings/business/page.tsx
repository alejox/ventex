"use client";

import React, { useState } from "react";
import Image from "next/image";

function CameraIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
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
  const [saving, setSaving] = useState(false);
  const [personType, setPersonType] = useState<"natural" | "juridica">("natural");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
    }, 1000);
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
                   {/* Placeholder for Logo */}
                   <div className="text-on-surface-variant font-medium">Logo</div>
                </div>
                <button type="button" className="absolute -bottom-3 -right-3 w-10 h-10 bg-surface-container-lowest border border-outline-variant/20 rounded-full flex items-center justify-center text-on-surface shadow-sm hover:bg-surface-container transition-colors">
                  <CameraIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-on-surface">Se mostrará en la parte superior de tus facturas de venta.</p>
                <p className="text-sm text-on-surface-variant mt-1">Si necesitas ayuda, puedes conocer <a href="#" className="text-primary hover:underline">cómo agregar tu logo</a>.</p>
              </div>
            </div>

            <hr className="border-outline-variant/10" />

            {/* Form Fields */}
            <div className="space-y-6">
              {/* Tipo de persona */}
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-2">Tipo de persona <span className="text-primary">*</span></label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${personType === 'natural' ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
                    <input type="radio" name="person_type" value="natural" checked={personType === 'natural'} onChange={() => setPersonType('natural')} className="hidden" />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${personType === 'natural' ? 'border-primary' : 'border-outline-variant/50'}`}>
                      {personType === 'natural' && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <span className="font-medium text-sm">Persona natural</span>
                  </label>
                  <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${personType === 'juridica' ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
                    <input type="radio" name="person_type" value="juridica" checked={personType === 'juridica'} onChange={() => setPersonType('juridica')} className="hidden" />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${personType === 'juridica' ? 'border-primary' : 'border-outline-variant/50'}`}>
                      {personType === 'juridica' && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <span className="font-medium text-sm">Persona jurídica</span>
                  </label>
                </div>
              </div>

              {/* Row 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <Field label="Tipo de identificación" required className="sm:col-span-4">
                  <select className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface">
                    <option>NIT - Número de identificación tributaria</option>
                    <option>CC - Cédula de ciudadanía</option>
                  </select>
                </Field>
                <Field label="Número de identificación" required className="sm:col-span-3">
                  <div className="flex h-[42px]">
                    <input type="text" placeholder="9012345678" className="w-full px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-l-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                    <button type="button" className="px-3 bg-primary text-white flex items-center justify-center rounded-r-lg hover:bg-primary-dim transition-colors">
                      <SearchIcon className="w-5 h-5" />
                    </button>
                  </div>
                </Field>
                <Field label="DV" required className="sm:col-span-2">
                  <input type="text" defaultValue="6" readOnly className="w-full h-[42px] px-3 bg-surface-container border border-outline-variant/10 rounded-lg text-sm text-on-surface-variant focus:outline-none" />
                </Field>
                <Field label="Tipo de persona según nacionalidad" required className="sm:col-span-3">
                  <select className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface-variant">
                    <option>Seleccionar</option>
                  </select>
                </Field>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Primer nombre" required>
                  <input type="text" defaultValue="Alejox" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Segundo nombre">
                  <input type="text" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Apellidos" required>
                  <input type="text" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Nombre comercial">
                  <input type="text" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Responsabilidad tributaria" required>
                  <select className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface">
                    <option>Responsable de IVA</option>
                    <option>No responsable de IVA</option>
                  </select>
                </Field>
                <Field label="Municipio / Departamento">
                  <select className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface-variant">
                    <option>Seleccionar</option>
                  </select>
                </Field>
              </div>

              {/* Row 4 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Dirección">
                  <input type="text" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Código postal">
                  <input type="text" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Correo electrónico">
                  <input type="email" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
              </div>

              {/* Row 5 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Teléfono">
                  <input type="tel" defaultValue="3148956814" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
                </Field>
                <Field label="Sitio web">
                  <input type="url" className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface" />
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
              <Field label="Sector">
                <select className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface">
                  <option>Otros</option>
                  <option>Tecnología</option>
                  <option>Alimentación</option>
                </select>
              </Field>
              <Field label="Precisión decimal" required>
                <select className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface">
                  <option>0</option>
                  <option>1</option>
                  <option>2</option>
                </select>
              </Field>
              <Field label="Separador decimal" required>
                <select className="w-full h-[42px] px-3 bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary text-sm text-on-surface">
                  <option>,</option>
                  <option>.</option>
                </select>
              </Field>
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
          <button type="submit" disabled={saving} className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </form>
  );
}

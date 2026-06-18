"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AddCustomerPage() {
  const router = useRouter();
  const [isTaxExempt, setIsTaxExempt] = useState(false);

  return (
    <div className="w-full max-w-2xl mx-auto pb-20 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => router.back()}
          className="p-2 hover:bg-surface-container rounded-full transition-colors"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-on-surface">Añadir Cliente</h1>
      </div>

      {/* Main Card */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-on-surface mb-2">Información del Cliente</h2>
        <p className="text-sm text-on-surface-variant mb-8">
          Ingrese los datos para registrar un nuevo cliente en el sistema.
        </p>

        <form className="space-y-6">
          {/* Nombre Completo */}
          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Nombre Completo</label>
            <input 
              type="text" 
              placeholder="Ej. María González"
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Teléfono</label>
            <input 
              type="tel" 
              placeholder="+52 55 1234 5678"
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
          </div>

          {/* Correo Electrónico */}
          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Correo Electrónico</label>
            <input 
              type="email" 
              placeholder="maria@ejemplo.com"
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
          </div>

          {/* RFC / RUT */}
          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">RFC / RUT</label>
            <input 
              type="text" 
              placeholder="MGO890123AAA"
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
            <p className="text-xs font-semibold text-on-surface-variant mt-2">Requerido para facturación.</p>
          </div>

          {/* Tax Exempt Toggle */}
          <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl border border-outline-variant/10 mt-8">
            <div>
              <p className="text-sm font-bold text-on-surface">Cliente Exento de Impuestos</p>
              <p className="text-xs text-on-surface-variant mt-1">No aplicar IVA a las compras de este cliente.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsTaxExempt(!isTaxExempt)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                isTaxExempt ? 'bg-[#6063ee]' : 'bg-outline-variant/30'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isTaxExempt ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-4 pt-6 mt-8 border-t border-outline-variant/10">
            <button 
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="button"
              className="flex-1 py-3 px-4 rounded-xl bg-[#6063ee] text-white hover:bg-[#c0c1ff] hover:text-[#0b0664] text-sm font-bold shadow-lg shadow-[#6063ee]/20 transition-colors"
            >
              Guardar Cliente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

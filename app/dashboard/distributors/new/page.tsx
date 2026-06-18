"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AddDistributorPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [rfcRut, setRfcRut] = useState("");

  return (
    <div className="w-full max-w-2xl mx-auto pb-20 animate-in fade-in duration-300">
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
        <h1 className="text-xl font-bold text-on-surface">Añadir Distribuidor</h1>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-on-surface mb-2">Información del Distribuidor</h2>
        <p className="text-sm text-on-surface-variant mb-8">
          Ingrese los datos para registrar un nuevo distribuidor en el sistema.
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Nombre del Negocio</label>
            <input 
              type="text" 
              placeholder="Ej. Distribuidora del Norte S.A."
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Nombre del Contacto</label>
            <input 
              type="text" 
              placeholder="Ej. Juan Pérez"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Correo Electrónico</label>
            <input 
              type="email" 
              placeholder="contacto@distribuidora.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Teléfono</label>
            <input 
              type="tel" 
              placeholder="+52 55 1234 5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">Dirección</label>
            <textarea 
              placeholder="Calle, ciudad, estado, código postal"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-2">RFC / RUT</label>
            <input 
              type="text" 
              placeholder="DNO890123AAA"
              value={rfcRut}
              onChange={(e) => setRfcRut(e.target.value)}
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 transition-shadow"
            />
            <p className="text-xs font-semibold text-on-surface-variant mt-2">Requerido para facturación.</p>
          </div>

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
              Guardar Distribuidor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

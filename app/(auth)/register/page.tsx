"use client";

import Link from "next/link";
import { useState } from "react";
import { LogoVertical } from "@/components/Logo";
import { GoogleButton } from "@/components/GoogleButton";
import {
  REGISTER_BUSINESS_OPTIONS,
  MODULES_BY_TYPE,
  type BusinessType,
  type ModuleId,
} from "@/config/business";

// --- Icons ---
const ScissorsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

const BagIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const CarIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a2 2 0 0 0-1.6-.8H8.3a2 2 0 0 0-1.6.8L4 11l-5.16.86a1 1 0 0 0-.84.99V16h3" />
    <circle cx="6.5" cy="16.5" r="2.5" />
    <circle cx="16.5" cy="16.5" r="2.5" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const RocketIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

const CartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const BoxIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// --- Component ---
export default function RegisterPage() {
  const [step, setStep] = useState(1);
  // Con un único rubro habilitado no tiene sentido obligar a elegirlo: viene
  // preseleccionado y el paso 1 queda a un clic de continuar.
  const [businessType, setBusinessType] = useState(
    REGISTER_BUSINESS_OPTIONS.length === 1 ? REGISTER_BUSINESS_OPTIONS[0].id : "",
  );
  const [modules, setModules] = useState<Record<string, boolean>>({});
  
  // Step 3 state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const handleNext = () => setStep(step + 1);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // La confirmación se valida antes de tocar la red: si no coinciden, no
    // tiene sentido crear la cuenta.
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    setError("");

    // Use Supabase client to register
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Pasa por /auth/confirm (verifica el token en el servidor) igual que el
        // reset de contraseña. Acepta el ?code= actual y también el token_hash
        // si la plantilla "Confirm signup" se migra a ese formato.
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard/pos`,
        data: {
          full_name: name,
          business_name: businessName,
          business_type: businessType,
          modules: modules,
        }
      }
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setConfirmed(true);
    }
  };

  // Iconos por id (la presentación; los datos viven en config/business.ts).
  const BUSINESS_ICONS: Record<BusinessType, React.ReactNode> = {
    salon: <ScissorsIcon />,
    tienda: <BagIcon />,
    lavaautos: <CarIcon />,
    servicios: <BriefcaseIcon />,
  };

  const MODULE_ICONS: Record<ModuleId, React.ReactNode> = {
    ecommerce: <CartIcon />,
    website: <GlobeIcon />,
    appointments: <CalendarIcon />,
    inventory: <BoxIcon />,
    billing: <FileIcon />,
    services: <ScissorsIcon />,
    staff: <UsersIcon />,
    vehicles: <CarIcon />,
  };

  if (confirmed) {
    return (
      <div className="w-full max-w-[420px] mx-auto text-center">
        <div className="flex justify-center mb-8 lg:hidden">
          <LogoVertical className="w-[180px] h-[48px]" />
        </div>
        <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <h2 className="text-[28px] font-bold text-on-surface mb-2">
          Revisa tu correo
        </h2>
        <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
          Te enviamos un enlace de confirmación a <strong className="text-on-surface">{email}</strong>.
          Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta.
        </p>
        <div className="bg-surface-container-low rounded-xl p-4 mb-8 text-left">
          <p className="text-xs text-on-surface-variant font-medium mb-2">¿No encuentras el correo?</p>
          <ul className="text-xs text-on-surface-variant space-y-1.5 list-disc list-inside">
            <li>Revisa tu carpeta de spam o correo no deseado</li>
            <li>Asegúrate de haber escrito bien tu correo</li>
          </ul>
        </div>
        <Link
          href="/login"
          className="inline-block w-full bg-primary hover:bg-primary-dim text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] text-center"
        >
          Ir a Iniciar Sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[420px] mx-auto">
      {/* Mobile Logo */}
      <div className="flex justify-center mb-8 lg:hidden">
        <LogoVertical className="w-[180px] h-[48px]" />
      </div>

      {/* Volver.
          En el primer paso sale al login; en los siguientes retrocede un paso.
          Antes el asistente no tenía NINGUNA forma de volver: quien se
          equivocaba de tipo de negocio en el paso 1 quedaba atrapado y tenía
          que recargar y empezar de cero. */}
      <div className="mb-6">
        {step === 1 ? (
          <Link
            href="/login"
            className="inline-flex items-center gap-2 h-10 -ml-2 px-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver al inicio de sesi&oacute;n
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="inline-flex items-center gap-2 h-10 -ml-2 px-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Atr&aacute;s
          </button>
        )}
      </div>

      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center lg:text-center mb-8">
            <h2 className="text-[28px] font-bold text-on-surface mb-2 tracking-tight">
              Personaliza tu experiencia
            </h2>
            <p className="text-on-surface-variant text-[15px]">
              Selecciona el tipo de negocio que mejor te describe para configurar tu panel.
            </p>
          </div>

          <div className="space-y-3 mb-8">
            {REGISTER_BUSINESS_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setBusinessType(option.id)}
                className={`w-full py-4 px-6 rounded-[20px] border flex flex-col items-center justify-center gap-3 transition-all duration-300 ${
                  businessType === option.id
                    ? "bg-primary/5 border-primary ring-1 ring-primary/50 shadow-[0_0_20px_rgba(96,99,238,0.1)]"
                    : "bg-surface-container-low border-outline-variant/10 hover:bg-surface-container hover:border-outline-variant/20"
                }`}
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all duration-300 ${
                  businessType === option.id
                    ? "bg-primary border-primary text-on-primary shadow-md"
                    : "bg-surface-container-highest border-outline-variant/20 text-on-surface-variant"
                }`}>
                  {BUSINESS_ICONS[option.id]}
                </div>
                <span className={`text-[15px] font-semibold transition-colors ${businessType === option.id ? 'text-primary' : 'text-on-surface'}`}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={handleNext}
            disabled={!businessType}
            className="w-full bg-primary hover:bg-primary-dim disabled:bg-surface-container-high disabled:text-on-surface-variant/50 disabled:cursor-not-allowed text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(96,99,238,0.15)] flex justify-center items-center gap-2"
          >
            Continuar
          </button>

          <div className="mt-6 flex flex-col items-center">
            <span className="text-[13px] text-on-surface-variant font-medium mb-4">
              Paso 1 de 3: Perfil de Negocio
            </span>
            <div className="flex gap-4 text-[12px] text-on-surface-variant/70">
               <Link href="#" className="hover:text-on-surface transition-colors">Términos y Condiciones</Link>
               <Link href="#" className="hover:text-on-surface transition-colors">Privacidad</Link>
               <Link href="#" className="hover:text-on-surface transition-colors">Ayuda</Link>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center lg:text-center mb-8 flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-container-high border border-outline-variant/10 flex items-center justify-center text-primary mb-5 shadow-sm">
               <RocketIcon />
            </div>
            <h2 className="text-[28px] font-bold text-on-surface mb-2 tracking-tight">
              Potencia tu negocio
            </h2>
            <p className="text-on-surface-variant text-[15px]">
              Selecciona las herramientas que necesitas.
            </p>
          </div>

          <div className="space-y-4 mb-8">
            {(MODULES_BY_TYPE[businessType as BusinessType] || []).map((mod) => {
              const isOn = !mod.comingSoon && !!modules[mod.id];
              return (
              <div key={mod.id} className={`p-5 rounded-[24px] border transition-all duration-300 ${mod.comingSoon ? 'bg-surface-container-low/50 border-outline-variant/10 opacity-70' : isOn ? 'bg-primary/5 border-primary/40' : 'bg-surface-container-low border-outline-variant/10 hover:bg-surface-container'}`}>
                 <div className="flex justify-between items-start mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${isOn ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-highest border-outline-variant/20 text-on-surface-variant'}`}>
                       {MODULE_ICONS[mod.id]}
                    </div>
                    {mod.comingSoon ? (
                       <span className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant bg-surface-container-highest border border-outline-variant/20 px-2.5 py-1 rounded-full">
                          Próximamente
                       </span>
                    ) : (
                       <button
                          type="button"
                          onClick={() => setModules({...modules, [mod.id]: !modules[mod.id]})}
                          className={`w-11 h-6 rounded-full relative transition-colors duration-300 focus:outline-none ${isOn ? 'bg-primary' : 'bg-surface-container-highest border border-outline-variant/20'}`}
                       >
                          <span className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${isOn ? 'left-[22px]' : 'left-[2px]'}`}></span>
                       </button>
                    )}
                 </div>
                 <h3 className="text-[17px] font-bold text-on-surface mb-2">{mod.label}</h3>
                 <p className="text-[13px] text-on-surface-variant leading-relaxed">
                    {mod.description}
                 </p>
              </div>
              );
            })}
          </div>

          <button
            onClick={handleNext}
            className="w-full bg-primary hover:bg-primary-dim text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(96,99,238,0.15)] flex justify-center items-center gap-2 mb-4"
          >
            Continuar
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
          
          <div className="mt-4 flex flex-col items-center">
            <span className="text-[13px] text-on-surface-variant font-medium">
              Paso 2 de 3: Módulos Adicionales
            </span>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="text-center lg:text-left mb-8">
            <h2 className="text-[28px] font-bold text-on-surface mb-2 tracking-tight">
              Crea tu cuenta
            </h2>
            <p className="text-on-surface-variant text-[15px]">
              Ingresa tus datos para finalizar el registro.
            </p>
          </div>

          <div className="mb-6">
            <GoogleButton label="Registrarme con Google" />
            <div className="flex items-center gap-3 mt-6">
              <div className="h-px flex-1 bg-outline-variant/20" />
              <span className="text-[12px] text-on-surface-variant">o con tu correo</span>
              <div className="h-px flex-1 bg-outline-variant/20" />
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleRegister}>
            {error && (
              <div className="bg-error-container/20 text-error-dim text-[13px] px-4 py-3 rounded-lg border border-error-container/30">
                {error}
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Nombre del negocio
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Mi Tienda"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  required
                />
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Tu nombre
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Juan Pérez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  required
                />
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Correo electrónico
              </label>
              <div className="relative">
                <input
                  type="email"
                  placeholder="nombre@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  required
                />
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
                  <polyline points="3 7 12 13 21 7" />
                </svg>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  required
                  minLength={6}
                />
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-on-surface transition-colors"
                >
                  {showPassword ? (
                    <svg
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Confirmar contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full bg-surface-container-lowest border rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:ring-1 transition-all placeholder:text-on-surface-variant/50 ${
                    confirmPassword && confirmPassword !== password
                      ? "border-error/60 focus:border-error focus:ring-error"
                      : "border-outline-variant/30 focus:border-primary focus:ring-primary"
                  }`}
                  required
                  minLength={6}
                />
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="text-[12px] text-error pl-1">Las contraseñas no coinciden.</p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1 pb-2">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="terms"
                  required
                  className="peer appearance-none w-4 h-4 border border-outline-variant/40 rounded bg-surface-container-lowest checked:bg-primary checked:border-primary transition-colors cursor-pointer"
                />
                <svg className="absolute w-3 h-3 left-0.5 top-0.5 text-on-primary pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <label htmlFor="terms" className="text-[12px] text-on-surface-variant cursor-pointer select-none">
                Acepto los <Link href="#" className="text-primary hover:underline">Términos y Condiciones</Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !password || password !== confirmPassword}
              className="w-full bg-primary hover:bg-primary-dim disabled:bg-primary/50 disabled:cursor-not-allowed text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(96,99,238,0.15)] flex justify-center items-center gap-2"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>
                  Finalizar Registro
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                     <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>
            <div className="mt-4 flex flex-col items-center">
              <span className="text-[13px] text-on-surface-variant font-medium">
                Paso 3 de 3: Datos de Cuenta
              </span>
            </div>
          </form>
          
          <div className="mt-8 text-center text-[13px] text-on-surface-variant">
            ¿Ya tienes una cuenta?{" "}
            <Link
              href="/login"
              className="text-primary font-semibold hover:text-primary-dim transition-colors"
            >
              Iniciar Sesión
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

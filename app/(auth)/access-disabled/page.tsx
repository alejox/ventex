"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LogoVertical } from "@/components/Logo";

function AccessDisabledContent() {
  const params = useSearchParams();
  const suspended = params.get("status") === "suspended";
  const expired = params.get("status") === "expired";
  const [loading, setLoading] = useState(false);

  const signOut = async () => {
    setLoading(true);
    const { createClient } = await import("@/utils/supabase/client");
    await createClient().auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="w-full max-w-[420px] mx-auto text-center">
      <div className="flex justify-center mb-8 lg:hidden">
        <LogoVertical className="w-[120px] h-[32px]" />
      </div>
      <h2 className="text-[28px] font-bold text-on-surface mb-2">
        {expired ? "Invitación vencida" : suspended ? "Acceso suspendido" : "Acceso pendiente"}
      </h2>
      <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
        {expired
          ? "Pedile al dueño del negocio que contacte a soporte para emitir un nuevo enlace sin reemplazar tu cuenta."
          : suspended
          ? "El dueño del negocio suspendió tu acceso. Comunicate con él para reactivarlo."
          : "Tu invitación todavía no está activa. Abrí el enlace del correo y definí tu contraseña."}
      </p>
      <button
        type="button"
        onClick={signOut}
        disabled={loading}
        className="w-full bg-primary hover:bg-primary-dim disabled:opacity-50 text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px]"
      >
        {loading ? "Saliendo…" : "Volver al inicio de sesión"}
      </button>
    </div>
  );
}

export default function AccessDisabledPage() {
  return (
    <Suspense fallback={null}>
      <AccessDisabledContent />
    </Suspense>
  );
}

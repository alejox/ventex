"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useProfileStore } from "@/stores/profile.store";
import { useProfile } from "@/components/ProfileProvider";
import {
  BUSINESS_OPTIONS,
  MODULES_BY_TYPE,
  effectiveModules,
  type BusinessType,
  type ModuleId,
  type Modules,
} from "@/config/business";
import { cleanModulesForType, modulesForSwitch, navChangeOnSwitch } from "@/lib/business-change";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";

export default function BusinessModulesPage() {
  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-on-surface mb-1">Negocio y módulos</h2>
        <p className="text-sm text-on-surface-variant mb-8">
          Tu tipo de negocio y los módulos activos determinan qué secciones ves en el panel.
        </p>
        <BusinessModulesForm />
      </div>
    </div>
  );
}

function BusinessModulesForm() {
  const router = useRouter();
  const profile = useProfile();
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const submitting = useProfileStore((s) => s.submitting);
  const error = useProfileStore((s) => s.error);

  const [businessType, setBusinessType] = useState<BusinessType>(
    profile?.businessType ?? "tienda",
  );
  // Se siembra con los módulos EFECTIVOS (lo que el menú muestra hoy), no con
  // los guardados en crudo: para un rubro "full module" un módulo sin valor
  // guardado está encendido, y sembrarlo como apagado lo apagaba al guardar.
  const [modules, setModules] = useState<Modules>(() =>
    effectiveModules(profile?.businessType ?? null, profile?.modules ?? null),
  );
  const [saved, setSaved] = useState(false);
  const { confirm, dialog } = useConfirm();

  // Solo módulos realmente disponibles: un `comingSoon` no se puede encender.
  // Antes esta lista no lo filtraba y el toggle sí persistía en el perfil, así
  // que se podía "activar" un módulo que no existe.
  const available = (MODULES_BY_TYPE[businessType] ?? []).filter((m) => !m.comingSoon);

  const toggle = (id: ModuleId) => {
    setModules((m) => ({ ...m, [id]: !m[id] }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    // Conserva solo los módulos pertinentes al tipo seleccionado.
    const cleaned = cleanModulesForType(modules, businessType);

    // Cambiar de rubro reescribe el menú entero y descarta los módulos que el
    // rubro nuevo no ofrece: no puede pasar sin que el dueño vea qué pierde.
    if (profile && profile.businessType !== businessType) {
      const change = navChangeOnSwitch(
        { businessType: profile.businessType, modules: profile.modules },
        { businessType, modules: cleaned },
      );
      const nextLabel = BUSINESS_OPTIONS.find((b) => b.id === businessType)?.label ?? businessType;
      const ok = await confirm({
        title: `¿Cambiar el negocio a ${nextLabel}?`,
        tone: change.removed.length > 0 ? "danger" : "primary",
        confirmLabel: "Cambiar tipo de negocio",
        description: (
          <>
            {change.added.length === 0 && change.removed.length === 0 ? (
              <p>Las secciones del menú no cambian.</p>
            ) : (
              <>
                {change.added.length > 0 && (
                  <div>
                    <p className="font-semibold text-on-surface">Aparecen en el menú</p>
                    <ul className="mt-1 list-disc pl-5">
                      {change.added.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {change.removed.length > 0 && (
                  <div>
                    <p className="font-semibold text-on-surface">Desaparecen del menú</p>
                    <ul className="mt-1 list-disc pl-5">
                      {change.removed.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <p>
              Tus datos no se borran: si vuelves a este tipo de negocio, las secciones
              reaparecen con lo que tenías.
            </p>
          </>
        ),
      });
      if (!ok) return;
    }

    const ok = await saveProfile({ businessType, modules: cleaned });
    if (ok) {
      setSaved(true);
      router.refresh(); // re-ejecuta el layout server para refrescar la navegación
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      <Select
        label="Tipo de negocio"
        value={businessType}
        onChange={(e) => {
          const next = e.target.value as BusinessType;
          setBusinessType(next);
          // Rubro nuevo, módulos de ese rubro: sin esto, los del rubro anterior
          // que el nuevo no ofrece quedaban apagados sin que nadie lo decidiera.
          setModules((m) => modulesForSwitch(m, next));
          setSaved(false);
        }}
      >
        {BUSINESS_OPTIONS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </Select>

      {/* Un rubro puede no tener extras opcionales (la tienda hoy no los tiene):
          en ese caso no se muestra un encabezado sobre una lista vacía. */}
      {available.length > 0 && (
      <div className="space-y-3">
        <span className="block text-sm font-semibold text-on-surface">Módulos</span>
        {available.map((mod) => (
          <button
            type="button"
            key={mod.id}
            onClick={() => toggle(mod.id)}
            className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl border text-left transition-colors ${
              modules[mod.id]
                ? "bg-primary/5 border-primary/40"
                : "bg-surface-container-low border-outline-variant/10 hover:bg-surface-container"
            }`}
          >
            <span>
              <span className="block text-sm font-semibold text-on-surface">{mod.label}</span>
              <span className="block text-xs text-on-surface-variant">{mod.description}</span>
            </span>
            <span
              className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
                modules[mod.id] ? "bg-primary" : "bg-surface-container-highest border border-outline-variant/20"
              }`}
            >
              <span
                className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-all ${
                  modules[mod.id] ? "left-[22px]" : "left-[2px]"
                }`}
              ></span>
            </span>
          </button>
        ))}
      </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-6 mt-4 border-t border-outline-variant/10">
        <span className={`text-sm font-medium text-success transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          ✓ Cambios guardados
        </span>
        <button
          type="submit"
          disabled={submitting}
          className="py-3 px-6 rounded-xl bg-primary text-on-primary hover:bg-primary-dim text-sm font-bold shadow-lg shadow-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Guardando…" : "Guardar Cambios"}
        </button>
      </div>
      {dialog}
    </form>
  );
}


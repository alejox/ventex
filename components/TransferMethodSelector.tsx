"use client";

import { COLOMBIA_TRANSFER_METHODS } from "@/config/transferMethods";

interface TransferMethodSelectorProps {
  enabledMethods?: string[];
  selectedMethod: string | null;
  onSelect: (id: string) => void;
}

export function TransferMethodSelector({
  enabledMethods,
  selectedMethod,
  onSelect,
}: TransferMethodSelectorProps) {
  // Filtrar solo los métodos habilitados en la configuración del negocio
  const methodsToDisplay = COLOMBIA_TRANSFER_METHODS.filter((m) =>
    enabledMethods ? enabledMethods.includes(m.id) : true
  );

  if (methodsToDisplay.length === 0) {
    return (
      <div className="p-3 text-xs text-on-surface-variant bg-surface-container rounded-xl border border-outline-variant/20 text-center">
        No hay medios de transferencia habilitados en Configuración.
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
      <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
        Medio de transferencia
      </label>

      <div className="grid grid-cols-2 gap-2">
        {methodsToDisplay.map((m) => {
          const isSelected = selectedMethod === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all relative overflow-hidden ${
                isSelected
                  ? "bg-primary/10 border-primary ring-1 ring-primary/40 shadow-sm"
                  : "bg-surface-container-low border-outline-variant/20 hover:bg-surface-container hover:border-outline-variant/40"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${m.bgColor} ${m.borderColor} border`}
                style={{ color: m.color }}
              >
                {m.shortName.substring(0, 2).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={`text-xs font-bold truncate ${
                    isSelected ? "text-primary" : "text-on-surface"
                  }`}
                >
                  {m.shortName}
                </p>
              </div>

              {isSelected && (
                <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                  <svg
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                    className="w-2.5 h-2.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { backdropProps } from "@/components/modal";

interface SchoolModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}

/** Carcasa de modal de la escuela: mismo aspecto que `CustomerModal`. */
export function SchoolModal({ title, onClose, children, maxWidth = "max-w-md" }: SchoolModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropProps(onClose)}
    >
      <div
        className={`bg-surface-container-lowest rounded-[24px] w-full ${maxWidth} border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 flex justify-between items-center border-b border-outline-variant/10">
          <h2 className="text-xl font-bold text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
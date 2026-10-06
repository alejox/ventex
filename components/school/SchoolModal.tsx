"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";

interface SchoolModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: "max-w-md" | "max-w-lg" | "max-w-xl" | "max-w-2xl";
}

// Clases literales (no armadas con strings) para que Tailwind las genere.
const WIDTH: Record<NonNullable<SchoolModalProps["maxWidth"]>, string> = {
  "max-w-md": "max-w-md!",
  "max-w-lg": "max-w-lg!",
  "max-w-xl": "max-w-xl!",
  "max-w-2xl": "max-w-2xl!",
};

/**
 * Carcasa de modal de la escuela, sobre el `Modal` compartido (`<dialog>`):
 * foco atrapado, Escape y scroll bloqueado vienen de ahí. El contenido trae
 * su propio relleno y su propio pie, por eso el cuerpo va sin padding.
 */
export function SchoolModal({ title, onClose, children, maxWidth = "max-w-md" }: SchoolModalProps) {
  return (
    <Modal open onClose={onClose} title={title} className={WIDTH[maxWidth]} bodyClassName="border-t border-outline-variant/10">
      {children}
    </Modal>
  );
}

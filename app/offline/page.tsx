import Link from "next/link";
import { LogoVertical } from "@/components/Logo";

export const metadata = {
  title: "Sin conexión · Ventex",
};

/**
 * Respaldo que sirve el service worker cuando una navegación no llega a la red.
 * No lleva datos del negocio: es una página pública y cacheada.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <LogoVertical className="w-16 h-16" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-on-surface">Sin conexión</h1>
        <p className="text-sm text-on-surface-variant max-w-sm">
          Ventex necesita internet para mostrar tus ventas y tu inventario al día. Revisá la
          conexión y volvé a intentar.
        </p>
      </div>
      <Link
        href="/dashboard/pos"
        className="h-12 px-6 inline-flex items-center rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary-dim transition-colors"
      >
        Reintentar
      </Link>
    </div>
  );
}

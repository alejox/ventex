"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type CollectionStateAction =
  | { label: string; href: string }
  | { label: string; onClick: () => void };

interface CollectionActionProps {
  action: CollectionStateAction;
  variant?: "primary" | "secondary" | "text";
}

function CollectionAction({ action, variant = "secondary" }: CollectionActionProps) {
  const className = {
    primary:
      "inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim",
    secondary:
      "inline-flex items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high",
    text: "inline-flex items-center justify-center text-sm font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dim",
  }[variant];

  if ("href" in action) {
    return <Link href={action.href} className={className}>{action.label}</Link>;
  }

  return <button type="button" onClick={action.onClick} className={className}>{action.label}</button>;
}

export function CollectionLoading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-6 py-12 text-center" role="status">
      <span aria-hidden="true" className="h-7 w-7 animate-spin rounded-full border-2 border-outline-variant/30 border-t-primary" />
      <p className="text-sm text-on-surface-variant">{label}</p>
    </div>
  );
}

interface CollectionEmptyProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: CollectionStateAction;
}

export function CollectionEmpty({ icon, title, description, action }: CollectionEmptyProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-outline-variant/10 bg-surface-container-lowest px-6 py-12 text-center shadow-sm">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
        {icon}
      </div>
      <h2 className="text-lg font-bold text-on-surface">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-on-surface-variant">{description}</p>
      {action && <div className="mt-6"><CollectionAction action={action} /></div>}
    </div>
  );
}

interface CollectionFilteredEmptyProps {
  title?: string;
  description?: string;
  action?: CollectionStateAction;
}

export function CollectionFilteredEmpty({
  title = "No encontramos resultados",
  description = "Probá cambiando o limpiando los filtros.",
  action,
}: CollectionFilteredEmptyProps) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
      <p className="font-semibold text-on-surface">{title}</p>
      <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
      {action && <div className="mt-4"><CollectionAction action={action} variant="text" /></div>}
    </div>
  );
}

export function CollectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error-container/30 bg-error-container/20 px-4 py-3 text-sm text-error-dim" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-semibold text-error-dim underline underline-offset-2 transition-colors hover:text-error"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

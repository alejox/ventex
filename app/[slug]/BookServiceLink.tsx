"use client";

import type { ReactNode } from "react";

export const BOOK_SERVICE_EVENT = "ventex:book-service";

export function BookServiceLink({
  serviceId,
  href = "#reservar",
  className,
  children,
}: {
  serviceId: string;
  href?: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent(BOOK_SERVICE_EVENT, { detail: { serviceId } }),
        );
      }}
    >
      {children}
    </a>
  );
}

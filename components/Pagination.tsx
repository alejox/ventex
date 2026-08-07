"use client";

import React from "react";
import { Select } from "./ui/Select";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  /** Rango real de filas que dibuja la página actual (por defecto se infiere de pageSize). */
  startItem?: number;
  endItem?: number;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = "",
  startItem: startItemProp,
  endItem: endItemProp,
}: PaginationProps) {
  if (totalItems === 0) return null;

  const safePage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const startItem = startItemProp ?? (safePage - 1) * pageSize + 1;
  const endItem = endItemProp ?? Math.min(safePage * pageSize, totalItems);

  // Genera el rango de números de página con elipsis si hay más de 7 páginas
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push("...");

      const start = Math.max(2, safePage - 1);
      const end = Math.min(totalPages - 1, safePage + 1);

      for (let i = start; i <= end; i++) pages.push(i);

      if (safePage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const handlePageClick = (e: React.MouseEvent, page: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (page >= 1 && page <= totalPages && page !== safePage) {
      onPageChange(page);
    }
  };

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 py-3.5 px-4 sm:px-6 bg-surface-container-lowest border-t border-outline-variant/10 rounded-b-2xl sm:rounded-b-3xl text-xs text-on-surface-variant ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Rango de resultados y selector de tamaño */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-on-surface-variant">
          Mostrando <strong className="font-semibold font-mono text-on-surface tabular-nums">{startItem}</strong>–
          <strong className="font-semibold font-mono text-on-surface tabular-nums">{endItem}</strong> de{" "}
          <strong className="font-semibold font-mono text-on-surface tabular-nums">{totalItems}</strong> resultados
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-on-surface-variant/70 text-[11px] font-medium">Por página:</span>
            <Select
              size="sm"
              value={String(pageSize)}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                if (newSize > 0) onPageSizeChange(newSize);
              }}
              aria-label="Resultados por página"
              containerClassName="w-20"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={String(opt)}>
                  {opt}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Navegación por páginas */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Botón Anterior */}
          <button
            type="button"
            onClick={(e) => handlePageClick(e, safePage - 1)}
            disabled={safePage <= 1}
            aria-label="Página anterior"
            className="inline-flex items-center justify-center gap-1 px-3 h-8 rounded-xl border border-outline-variant/20 bg-surface-container-low text-on-surface font-semibold text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-container-high transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="w-3.5 h-3.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="hidden sm:inline">Anterior</span>
          </button>

          {/* Números de página */}
          <div className="flex items-center gap-1">
            {getPageNumbers().map((num, idx) =>
              num === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1.5 text-on-surface-variant/40 font-mono text-xs select-none">
                  …
                </span>
              ) : (
                <button
                  key={`page-${num}`}
                  type="button"
                  onClick={(e) => handlePageClick(e, Number(num))}
                  className={`w-8 h-8 rounded-xl text-xs font-semibold flex items-center justify-center transition-all ${
                    safePage === num
                      ? "bg-primary text-on-primary font-bold shadow-md shadow-primary/20"
                      : "bg-surface-container-low border border-outline-variant/20 text-on-surface hover:bg-surface-container-high"
                  }`}
                >
                  {num}
                </button>
              )
            )}
          </div>

          {/* Botón Siguiente */}
          <button
            type="button"
            onClick={(e) => handlePageClick(e, safePage + 1)}
            disabled={safePage >= totalPages}
            aria-label="Página siguiente"
            className="inline-flex items-center justify-center gap-1 px-3 h-8 rounded-xl border border-outline-variant/20 bg-surface-container-low text-on-surface font-semibold text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-container-high transition-colors"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="w-3.5 h-3.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

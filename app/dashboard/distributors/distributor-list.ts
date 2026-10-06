/** Filtro de estado de proveedores. Activos por defecto. */
export type DistributorStatusFilter = "active" | "archived" | "all";

export const isArchivedDistributor = (d: { status: string | null }) => d.status === "inactive";

export function filterDistributorsByStatus<T extends { status: string | null }>(
  distributors: T[],
  filter: DistributorStatusFilter,
): T[] {
  if (filter === "all") return distributors;
  return distributors.filter((d) => (filter === "archived" ? isArchivedDistributor(d) : !isArchivedDistributor(d)));
}

export function parseDistributorStatusFilter(raw: string): DistributorStatusFilter {
  return raw === "archived" || raw === "all" ? raw : "active";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Qué arrastra borrar un proveedor. Con productos asociados la base RECHAZA el
 * borrado (FK `NO ACTION`): `canDelete` es falso y la salida es Archivar.
 */
export function distributorImpact(impact: { purchases: number; products: number }): {
  lines: string[];
  canDelete: boolean;
} {
  const lines: string[] = [];
  if (impact.purchases > 0) {
    lines.push(`${plural(impact.purchases, "compra quedará", "compras quedarán")} sin proveedor.`);
  }
  if (impact.products > 0) {
    lines.push(
      `${plural(impact.products, "producto lo tiene", "productos lo tienen")} como proveedor: mientras sea así no se puede borrar. Archívalo para que deje de aparecer.`,
    );
  }
  return { lines, canDelete: impact.products === 0 };
}

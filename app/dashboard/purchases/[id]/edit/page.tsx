"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDistributorsStore } from "@/stores/distributors.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { toMessage } from "@/lib/errors";
import * as purchasesService from "@/services/purchases.service";
import type { PurchaseInvoice } from "@/services/purchases.service";
import { PurchaseForm, type PurchaseLineForm } from "../../components/PurchaseForm";

export default function EditPurchasePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null);
  const [lines, setLines] = useState<PurchaseLineForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchDistributors();
    fetchInventory();
  }, [fetchDistributors, fetchInventory]);

  useEffect(() => {
    if (!id) return;
    let active = true;

    (async () => {
      try {
        const [found, items] = await Promise.all([
          purchasesService.fetchPurchaseInvoice(id),
          purchasesService.fetchPurchaseInvoiceItems(id),
        ]);
        if (!active) return;
        if (!found) {
          setLoadError("No encontramos esta compra.");
        } else {
          setInvoice(found);
          setLines(
            items.map((item) => ({
              product_id: item.product_id ?? "",
              product_name: item.products?.name ?? item.description,
              description: item.description,
              // Del registro, NO del producto: presentación y costos son los de
              // ese día, aunque el producto haya cambiado después. Las sueltas
              // no se guardan: se derivan del total menos las cajas.
              package_quantity: item.package_quantity,
              loose_quantity: purchasesService.looseUnitsOf(item),
              unit_price: item.unit_price,
              package_price: item.package_price,
              units_per_package: item.units_per_package,
            }))
          );
        }
      } catch (e) {
        if (active) setLoadError(toMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();

    // Evita escribir estado si el usuario ya se fue de la pantalla.
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <p className="text-center text-sm text-on-surface-variant py-12">Cargando compra…</p>;
  }

  if (loadError || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 gap-4">
        <p className="text-sm text-on-surface-variant">{loadError ?? "No encontramos esta compra."}</p>
        <Link
          href="/dashboard/purchases"
          className="px-5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold hover:bg-surface-container-high transition-colors"
        >
          Volver a Compras
        </Link>
      </div>
    );
  }

  return <PurchaseForm editingInvoice={invoice} initialLines={lines} />;
}

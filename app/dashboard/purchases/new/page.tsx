"use client";

import { useEffect } from "react";
import { useDistributorsStore } from "@/stores/distributors.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { PurchaseForm } from "../components/PurchaseForm";

export default function NewPurchasePage() {
  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  // La pantalla se puede abrir por URL directa, así que carga sus propios
  // catálogos en vez de confiar en que el listado ya los haya traído.
  useEffect(() => {
    fetchDistributors();
    fetchInventory();
  }, [fetchDistributors, fetchInventory]);

  return <PurchaseForm editingInvoice={null} initialLines={[]} />;
}

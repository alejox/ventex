"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Image from "next/image";
import ExcelJS from "exceljs";
import { IconAlertTriangle } from "@/app/assets/icons/DashboardIcons";
import { buildSuggestedItems } from "@/services/abastecimiento.service";
import type { SuggestedOrderItem } from "@/services/abastecimiento.service";
import { useDistributorsStore } from "@/stores/distributors.store";
import { usePurchaseOrdersStore } from "@/stores/purchase-orders.store";
import type { PurchaseOrder, PurchaseOrderLineInput } from "@/services/purchase-orders.service";
import { notifySuccess, notifyError } from "@/lib/notifications";
import { ProductBrowser } from "./ProductBrowser";
import { SavedOrders } from "./SavedOrders";
import { Select } from "@/components/ui/Select";

function IconZap(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

interface Props {
  initialProducts: {
    id: string;
    name: string;
    image_url: string | null;
    sku: string;
    stock_level: number;
    minimum_stock: number;
    unit: string;
    purchase_price: number;
    categories: { name: string } | null;
    distributors: { business_name: string } | null;
  }[];
  allCategories: { id: string; name: string }[];
  lowStockCount: number;
  preseeded: SuggestedOrderItem[];
}

function formatPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function PedidosClient({
  initialProducts,
  allCategories,
  lowStockCount,
  preseeded,
}: Props) {
  const distributors = useDistributorsStore((s) => s.distributors);
  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);

  useEffect(() => {
    if (distributors.length === 0) fetchDistributors();
  }, [distributors.length, fetchDistributors]);

  const [generated, setGenerated] = useState(preseeded.length > 0);
  const [items, setItems] = useState<SuggestedOrderItem[]>(preseeded);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const q: Record<string, number> = {};
    for (const item of preseeded) {
      q[item.productId] = item.suggestedQuantity;
    }
    return q;
  });

  const [browserOpen, setBrowserOpen] = useState(false);

  const [selectedDistributorId, setSelectedDistributorId] = useState("");
  const [manualWhatsApp, setManualWhatsApp] = useState("");

  const orders = usePurchaseOrdersStore((s) => s.orders);
  const ordersLoading = usePurchaseOrdersStore((s) => s.loading);
  const savingOrder = usePurchaseOrdersStore((s) => s.submitting);
  const orderError = usePurchaseOrdersStore((s) => s.error);
  const fetchOrders = usePurchaseOrdersStore((s) => s.fetchOrders);
  const saveDraft = usePurchaseOrdersStore((s) => s.saveDraft);
  const issueOrder = usePurchaseOrdersStore((s) => s.issue);
  const receiveOrder = usePurchaseOrdersStore((s) => s.receive);
  const cancelOrder = usePurchaseOrdersStore((s) => s.cancel);

  /**
   * Borrador que se está editando. Sin esto, cada "Guardar" crearía un pedido
   * nuevo y la lista se llenaría de copias del mismo.
   */
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (orderError) notifyError("No se pudo guardar el pedido", orderError);
  }, [orderError]);

  const selectedDistributor = useMemo(
    () => distributors.find((d) => d.id === selectedDistributorId),
    [distributors, selectedDistributorId],
  );

  const whatsappNumber = useMemo(() => {
    if (manualWhatsApp) return formatPhone(manualWhatsApp);
    if (selectedDistributor?.whatsapp) return formatPhone(selectedDistributor.whatsapp);
    return "";
  }, [manualWhatsApp, selectedDistributor]);

  const handleClear = useCallback(() => {
    setItems([]);
    setQuantities({});
    setGenerated(true);
    setEditingOrderId(null);
  }, []);

  /** Las líneas del armador, en el formato que guarda la base. */
  const buildLines = useCallback((): PurchaseOrderLineInput[] => {
    return items
      .map((item) => ({
        product_id: item.productId,
        product_name: item.productName,
        sku: item.sku || null,
        quantity: quantities[item.productId] ?? item.suggestedQuantity,
        unit_price: item.purchasePrice,
      }))
      .filter((line) => line.quantity > 0);
  }, [items, quantities]);

  const handleSaveDraft = useCallback(async () => {
    const lines = buildLines();
    if (lines.length === 0) {
      notifyError("Pedido vacío", "Agrega productos con cantidad mayor a cero.");
      return;
    }
    const order = await saveDraft(
      { distributor_id: selectedDistributorId || null, items: lines },
      editingOrderId,
    );
    if (order) {
      setEditingOrderId(order.id);
      notifySuccess(
        `Borrador #${order.order_number} guardado`,
        "Puedes retomarlo cuando quieras desde Pedidos guardados.",
      );
    }
  }, [buildLines, saveDraft, selectedDistributorId, editingOrderId]);

  const handleIssue = useCallback(async () => {
    const lines = buildLines();
    if (lines.length === 0) {
      notifyError("Pedido vacío", "Agrega productos con cantidad mayor a cero.");
      return;
    }
    // Emitir compromete una compra. Sin proveedor no se puede recibir después,
    // así que se frena acá y no cuando llegue la mercancía. El borrador sí
    // puede guardarse sin proveedor: para eso es un borrador.
    if (!selectedDistributorId) {
      notifyError(
        "Falta el proveedor",
        "Elige a quién le vas a comprar antes de emitir la orden.",
      );
      return;
    }
    const order = await issueOrder(
      { distributor_id: selectedDistributorId || null, items: lines },
      editingOrderId,
    );
    if (order) {
      notifySuccess(
        `Orden #${order.order_number} emitida`,
        "Cuando llegue la mercancía, márcala como recibida y se registra la compra.",
      );
      handleClear();
    }
  }, [buildLines, issueOrder, selectedDistributorId, editingOrderId, handleClear]);

  /** Carga un borrador guardado de vuelta en el armador. */
  const handleResume = useCallback((order: PurchaseOrder) => {
    setItems(
      order.items.map((line) => ({
        productId: line.product_id ?? line.id,
        productName: line.product_name,
        imageUrl: null,
        sku: line.sku ?? "",
        currentStock: 0,
        minimumStock: 0,
        suggestedQuantity: line.quantity,
        unit: "Unidad",
        purchasePrice: line.unit_price,
        distributorName: order.distributor_name,
      })),
    );
    setQuantities(
      Object.fromEntries(
        order.items.map((line) => [line.product_id ?? line.id, line.quantity]),
      ),
    );
    setSelectedDistributorId(order.distributor_id ?? "");
    setEditingOrderId(order.id);
    setGenerated(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleReceive = useCallback(
    async (order: PurchaseOrder) => {
      const ok = await receiveOrder(order);
      if (ok) {
        notifySuccess(
          `Pedido #${order.order_number} recibido`,
          "Se registró la compra y el stock ya quedó actualizado.",
        );
      }
    },
    [receiveOrder],
  );

  const handleExportExcel = useCallback(async () => {
    const data = items.map((item) => {
      const qty = quantities[item.productId] ?? item.suggestedQuantity;
      return {
        Producto: item.productName,
        SKU: item.sku,
        Proveedor: item.distributorName ?? "",
        "Stock Actual": item.currentStock,
        "Stock M\u00ednimo": item.minimumStock,
        "Cantidad a Pedir": qty,
        Unidad: item.unit,
      };
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Pedido");

    worksheet.columns = [
      { header: "Producto", key: "Producto", width: 40 },
      { header: "SKU", key: "SKU", width: 15 },
      { header: "Proveedor", key: "Proveedor", width: 25 },
      { header: "Stock Actual", key: "Stock Actual", width: 14 },
      { header: "Stock M\u00ednimo", key: "Stock M\u00ednimo", width: 14 },
      { header: "Cantidad a Pedir", key: "Cantidad a Pedir", width: 18 },
      { header: "Unidad", key: "Unidad", width: 10 },
    ];

    worksheet.addRows(data);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedido_${dateStr}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [items, quantities]);

  const handleGenerate = () => {
    const result = buildSuggestedItems(initialProducts) as SuggestedOrderItem[];
    setItems(result);
    const q: Record<string, number> = {};
    for (const item of result) {
      q[item.productId] = item.suggestedQuantity;
    }
    setQuantities(q);
    setGenerated(true);
  };

  const updateQuantity = (productId: string, value: number) => {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, value) }));
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
    setQuantities((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const addProduct = (productId: string) => {
    const product = initialProducts.find((p) => p.id === productId);
    if (!product || items.some((i) => i.productId === productId)) return;

    const suggested = product.stock_level < product.minimum_stock
      ? Math.max(0, (product.minimum_stock * 2) - product.stock_level)
      : 1;
    const newItem: SuggestedOrderItem = {
      productId: product.id,
      productName: product.name,
      imageUrl: product.image_url,
      sku: product.sku,
      currentStock: product.stock_level,
      minimumStock: product.minimum_stock,
      suggestedQuantity: suggested,
      unit: product.unit,
      purchasePrice: product.purchase_price,
      distributorName: product.distributors?.business_name ?? null,
    };
    setItems((prev) => [...prev, newItem]);
    setQuantities((prev) => ({ ...prev, [product.id]: suggested }));
    setGenerated(true);
  };

  const buildWhatsAppText = () => {
    const lines: string[] = ["*Pedido de Reposici\u00f3n*", ""];
    for (const item of items) {
      const qty = quantities[item.productId] ?? item.suggestedQuantity;
      if (qty > 0) {
        lines.push(`\u2022 ${item.productName} (${item.sku}): ${qty} ${item.unit}`);
      }
    }
    return encodeURIComponent(lines.join("\n"));
  };

  const handleSendWhatsApp = () => {
    if (!whatsappNumber) return;
    const text = buildWhatsAppText();
    window.open(`https://wa.me/${whatsappNumber}?text=${text}`, "_blank");
  };

  const activeItems = items.filter((item) => (quantities[item.productId] ?? item.suggestedQuantity) > 0);

  const itemIds = useMemo(() => new Set(items.map((i) => i.productId)), [items]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-on-surface tracking-tight">
            Pedidos y &Oacute;rdenes de Compra
          </h1>
          <p className="text-on-surface-variant text-sm mt-1.5">
            {initialProducts.length} producto{initialProducts.length !== 1 ? "s" : ""} registrado
            {initialProducts.length !== 1 ? "s" : ""} &middot;{" "}
            {lowStockCount} necesitan reposici&oacute;n
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setBrowserOpen(true)}
            className="h-12 bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm font-semibold px-5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Agregar Producto
          </button>
          <button
            onClick={handleGenerate}
            disabled={lowStockCount === 0}
            className="h-12 bg-primary hover:bg-primary-dim disabled:bg-on-surface-variant/30 disabled:cursor-not-allowed text-on-primary text-sm font-semibold px-5 rounded-xl shadow-[0_0_20px_rgba(96,99,238,0.25)] transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_25px_rgba(96,99,238,0.35)]"
          >
            <IconZap className="w-5 h-5" />
            Sugerir
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center group hover:border-outline-variant/20 transition-colors">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Total Productos</p>
            <h3 className="text-4xl font-bold text-on-surface tracking-tight">{initialProducts.length}</h3>
          </div>
          <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-7 h-7">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
        </div>

        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center group hover:border-outline-variant/20 transition-colors">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Stock Bajo / Cr&iacute;tico</p>
            <h3 className="text-4xl font-bold text-on-surface tracking-tight">{lowStockCount}</h3>
          </div>
          <div className="w-14 h-14 rounded-xl bg-[#f59e0b]/10 text-[#f59e0b] flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconAlertTriangle className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Editando un borrador ya guardado: sin este aviso el dueño no sabe si
          está armando un pedido nuevo o modificando uno existente. */}
      {editingOrderId && (
        <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 text-sm text-on-surface flex flex-wrap items-center justify-between gap-2">
          <span>
            Estás editando el borrador{" "}
            <strong>
              #{orders.find((o) => o.id === editingOrderId)?.order_number ?? ""}
            </strong>
            . Al guardar se actualiza, no se crea uno nuevo.
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
          >
            Empezar uno nuevo
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden flex flex-col">
        <div className="px-7 py-5 border-b border-outline-variant/10 bg-surface-container-lowest flex items-center justify-between">
          <h2 className="text-lg font-bold text-on-surface">
            Productos en el pedido
          </h2>
          {generated && items.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="h-9 px-4 rounded-xl border border-outline-variant/20 text-xs font-semibold text-on-surface-variant hover:text-error hover:border-error/30 hover:bg-error/5 transition-colors flex items-center gap-1.5"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Limpiar
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">
                <th className="px-7 py-4 font-bold">Producto</th>
                <th className="px-4 py-4 font-bold">Proveedor</th>
                <th className="px-4 py-4 font-bold">Stock Actual</th>
                <th className="px-4 py-4 font-bold">Stock M&iacute;nimo</th>
                <th className="px-4 py-4 font-bold">Cantidad a Pedir</th>
                <th className="px-4 py-4 text-center font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm">
              {!generated ? (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-on-surface-variant text-sm">
                    <div className="flex flex-col items-center gap-3">
                      <IconZap className="w-10 h-10 text-on-surface-variant/30" />
                      <p className="font-medium">
                        Presiona &ldquo;Sugerir&rdquo; para auto-detectar productos con stock bajo, o agrega productos manualmente con el bot&oacute;n &ldquo;Agregar Producto&rdquo;.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-on-surface-variant text-sm">
                    <div className="flex flex-col items-center gap-3">
                      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-10 h-10 text-on-surface-variant/30">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <p className="font-medium">No hay productos en el pedido. Agrega productos manualmente o usa &ldquo;Sugerir&rdquo;.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const qty = quantities[item.productId] ?? item.suggestedQuantity;
                  const ratio = item.currentStock / item.minimumStock;
                  const isOut = ratio === 0;
                  const badgeClass = isOut
                    ? "bg-error-container/20 text-error-dim border border-error-container/30"
                    : "bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20";
                  const dotClass = isOut ? "bg-error" : "bg-[#f59e0b]";

                  return (
                    <tr key={item.productId} className="hover:bg-surface-container-lowest transition-colors group">
                      <td className="px-7 py-4">
                        <div className="flex items-center gap-4">
                          <div className="relative w-11 h-11 rounded-xl bg-surface-container border border-outline-variant/10 flex items-center justify-center text-on-surface-variant/30 overflow-hidden shrink-0">
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt={item.productName}
                                fill
                                sizes="44px"
                                unoptimized
                                className="object-cover"
                              />
                            ) : (
                              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <span className="font-medium text-on-surface block">{item.productName}</span>
                            <span className="text-xs text-on-surface-variant font-mono">{item.sku}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-on-surface-variant">
                        {item.distributorName ?? <span className="italic opacity-50">Sin proveedor</span>}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold ${badgeClass}`}>
                          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                          {item.currentStock} {item.unit}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-on-surface-variant font-medium">
                        {item.minimumStock} {item.unit}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, qty - 1)}
                            disabled={qty <= 0}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={qty}
                            onChange={(e) =>
                              updateQuantity(item.productId, parseInt(e.target.value) || 0)
                            }
                            className="w-20 text-center bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2 px-3 text-sm text-on-surface font-semibold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, qty + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                          >
                            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          className="w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors mx-auto"
                          title="Eliminar del pedido"
                        >
                          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {generated && items.length > 0 && (
          <div className="px-7 py-4 border-t border-outline-variant/10 bg-surface-container-lowest text-sm text-on-surface-variant">
            {items.length} producto{items.length !== 1 ? "s" : ""} en el pedido &middot;{" "}
            {activeItems.length} con cantidad &gt; 0
          </div>
        )}
      </div>

      {/* Distributor & WhatsApp Panel */}
      {generated && items.length > 0 && activeItems.length > 0 && (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="px-7 py-5 border-b border-outline-variant/10 bg-surface-container-lowest">
            <h2 className="text-lg font-bold text-on-surface">Enviar pedido por WhatsApp</h2>
          </div>

          <div className="p-7 space-y-5">
            <Select
              label="Seleccionar proveedor"
              value={selectedDistributorId}
              onChange={(e) => {
                setSelectedDistributorId(e.target.value);
                setManualWhatsApp("");
              }}
            >
                <option value="">Seleccionar proveedor...</option>
                {distributors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.business_name}{d.whatsapp ? ` (${d.whatsapp})` : ""}
                  </option>
                ))}
              </Select>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-outline-variant/20" />
              <span className="text-xs text-on-surface-variant/50 font-medium">o env&iacute;a a un n&uacute;mero manual</span>
              <div className="flex-1 h-px bg-outline-variant/20" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                N&uacute;mero manual
              </label>
              <input
                type="tel"
                value={manualWhatsApp}
                onChange={(e) => {
                  setManualWhatsApp(e.target.value);
                  if (e.target.value) setSelectedDistributorId("");
                }}
                placeholder="+52 55 1234 5678"
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
              />
              {selectedDistributor?.whatsapp && !manualWhatsApp && (
                <p className="text-xs text-primary font-medium">
                  Se usar&aacute; el n&uacute;mero guardado del proveedor: {selectedDistributor.whatsapp}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSendWhatsApp}
                disabled={!whatsappNumber}
                aria-describedby={!whatsappNumber ? "whatsapp-send-hint" : undefined}
                className="w-full min-h-12 py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#22c35e] disabled:bg-on-surface-variant/30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center justify-center gap-3 leading-tight"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 shrink-0">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Enviar pedido por WhatsApp
              </button>
              {!whatsappNumber && (
                <p id="whatsapp-send-hint" className="text-xs text-on-surface-variant text-center">
                  Selecciona un proveedor o ingresa un n&uacute;mero para habilitar el env&iacute;o.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Panel */}
      {generated && items.length > 0 && activeItems.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 pt-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="w-full sm:w-auto min-h-12 py-2.5 px-6 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors flex items-center justify-center gap-2"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Excel
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingOrder || activeItems.length === 0}
            className="w-full sm:w-auto min-h-12 py-2.5 px-8 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            {savingOrder ? "Guardando…" : editingOrderId ? "Actualizar Borrador" : "Guardar como Borrador"}
          </button>
          <button
            type="button"
            onClick={handleIssue}
            disabled={savingOrder || activeItems.length === 0}
            className="w-full sm:w-auto min-h-12 py-2.5 px-8 rounded-xl bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold shadow-[0_0_20px_rgba(96,99,238,0.25)] transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_25px_rgba(96,99,238,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {savingOrder ? "Emitiendo…" : "Emitir Orden de Compra"}
          </button>
        </div>
      )}

      {/* Product Browser Modal */}
      <SavedOrders
        orders={orders}
        loading={ordersLoading}
        submitting={savingOrder}
        onResume={handleResume}
        onReceive={handleReceive}
        onCancel={cancelOrder}
      />

      {browserOpen && (
        <ProductBrowser
          products={initialProducts}
          categories={allCategories}
          addedIds={itemIds}
          onAdd={addProduct}
          onClose={() => setBrowserOpen(false)}
        />
      )}
    </div>
  );
}

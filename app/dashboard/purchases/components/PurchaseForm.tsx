"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconPlus, IconTrash } from "@/app/assets/icons/DashboardIcons";
import { Select } from "@/components/ui/Select";
import { ProductModal } from "@/components/ProductModal";
import { DistributorQuickModal } from "@/components/DistributorQuickModal";
import { CategoryQuickModal } from "@/components/CategoryQuickModal";
import { useInventoryStore } from "@/stores/inventory.store";
import { useDistributorsStore } from "@/stores/distributors.store";
import { usePurchasesStore } from "@/stores/purchases.store";
import { useProfile } from "@/components/ProfileProvider";
import { can } from "@/lib/permissions";
import { useBusinessTax } from "@/lib/useBusinessTax";
import type { Product } from "@/services/inventory.service";
import { getUnitCost, isServiceItem } from "@/services/inventory.service";
import { needsRestock } from "@/lib/stock";
import type { PurchaseInvoice } from "@/services/purchases.service";
import {
  fetchLastPurchaseFromDistributor,
  totalUnitsOf,
  lineTotalOf,
} from "@/services/purchases.service";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Fecha de hoy en horario local. `toISOString()` da UTC y adelanta un día por la tarde. */
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface PurchaseLineForm {
  product_id: string;
  product_name: string;
  description: string;
  /** Cajas recibidas. */
  package_quantity: number;
  /** Unidades sueltas recibidas, ADEMÁS de las cajas. */
  loose_quantity: number;
  /**
   * Costo de UNA unidad suelta.
   *
   * Independiente de `package_price`: son dos campos libres. El proveedor cobra
   * la caja a un precio y la unidad suelta a otro, y derivar uno del otro
   * inventaría un número que nadie facturó.
   */
  unit_price: number;
  /** Costo de UNA caja. Solo aplica si el producto tiene `units_per_package > 1`. */
  package_price: number;
  /** Unidades por caja que se congelan en la línea al guardar. */
  units_per_package: number;
}

interface DropdownRect {
  top: number;
  left: number;
  width: number;
  /** Si se abre hacia arriba porque abajo no entraba. */
  up: boolean;
}

/** Alto estimado del panel, para decidir hacia qué lado abrirlo. */
const PANEL_MAX_HEIGHT = 268;

function rectFor(el: HTMLElement): DropdownRect {
  const box = el.getBoundingClientRect();
  const below = window.innerHeight - box.bottom;
  const up = below < PANEL_MAX_HEIGHT && box.top > below;
  return {
    top: up ? box.top - PANEL_MAX_HEIGHT - 4 : box.bottom + 4,
    left: box.left,
    width: box.width,
    up,
  };
}

const EMPTY_LINE: PurchaseLineForm = {
  product_id: "",
  product_name: "",
  description: "",
  package_quantity: 0,
  loose_quantity: 1,
  unit_price: 0,
  package_price: 0,
  units_per_package: 1,
};

interface PurchaseFormProps {
  /** `null` para un alta; la factura cuando se está editando. */
  editingInvoice: PurchaseInvoice | null;
  initialLines: PurchaseLineForm[];
}

const inputClass =
  "w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/40";
const labelClass = "text-[13px] font-semibold text-on-surface block mb-1.5";
const cellClass =
  "w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-2 px-2.5 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/40";

/**
 * Alta y edición de una compra, a página completa.
 *
 * Es una página y no un modal porque una factura de compra no es un formulario
 * corto: cabecera, proveedor, N líneas de producto, notas y totales. En un modal
 * con scroll propio los totales quedan fuera de la vista justo cuando se cargan
 * las líneas, que es el momento en que hay que mirarlos.
 */
export function PurchaseForm({ editingInvoice, initialLines }: PurchaseFormProps) {
  const router = useRouter();

  const distributors = useDistributorsStore((s) => s.distributors);
  const products = useInventoryStore((s) => s.products);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);

  const submitting = usePurchasesStore((s) => s.submitting);
  const error = usePurchasesStore((s) => s.error);
  const createInvoice = usePurchasesStore((s) => s.createInvoice);
  const updateInvoice = usePurchasesStore((s) => s.updateInvoice);

  const profile = useProfile();
  const canSeeCosts = can(profile, "inventory_costs");
  const { rawRate: businessTaxRate, rawPercentLabel: percentLabel } = useBusinessTax();

  const [distributorId, setDistributorId] = useState(editingInvoice?.distributor_id ?? "");
  const [issueDate, setIssueDate] = useState(() => editingInvoice?.issue_date ?? todayISO());
  const [dueDate, setDueDate] = useState(editingInvoice?.due_date ?? "");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(
    editingInvoice?.supplier_invoice_number ?? ""
  );
  const [status, setStatus] = useState(editingInvoice?.status ?? "paid");
  /**
   * Una compra NUEVA arranca con IVA si el negocio tiene tasa configurada.
   *
   * Arrancaba en "Ninguno" y la fila del IVA simplemente no aparecía, así que
   * parecía roto. Una factura de proveedor casi siempre trae IVA, y —como
   * documenta `useBusinessTax`— un negocio no responsable igual lo PAGA aunque
   * no pueda descontarlo: ponerlo en cero por defecto hacía desaparecer un
   * impuesto realmente pagado. Se puede cambiar a "Ninguno" en el selector.
   *
   * Editando manda lo que se guardó, no este default.
   */
  const [taxOption, setTaxOption] = useState(() => {
    if (editingInvoice) return editingInvoice.tax_rate > 0 ? "IVA" : "Ninguno";
    return "IVA";
  });
  const [discountAmount, setDiscountAmount] = useState(
    editingInvoice ? String(editingInvoice.discount_amount) : "0"
  );
  const [notes, setNotes] = useState(editingInvoice?.notes ?? "");
  const [lines, setLines] = useState<PurchaseLineForm[]>(
    initialLines.length > 0 ? initialLines : [{ ...EMPTY_LINE }]
  );

  const [productSearch, setProductSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState<number | null>(null);
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null);
  const productInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [loadingLastPurchase, setLoadingLastPurchase] = useState(false);
  const [distributorDrawerOpen, setDistributorDrawerOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [productModalLineIdx, setProductModalLineIdx] = useState<number | null>(null);
  const productModalLineIdxRef = useRef<number | null>(null);

  const selectedDistributor = distributors.find((d) => d.id === distributorId) ?? null;

  // Identificación y teléfono son un espejo del proveedor elegido, no campos de
  // la compra: se muestran para confirmar que se eligió al proveedor correcto.
  const distributorDocument = selectedDistributor?.rfc_rut
    ? [selectedDistributor.doc_type, selectedDistributor.rfc_rut].filter(Boolean).join(" ") +
      (selectedDistributor.dv ? `-${selectedDistributor.dv}` : "")
    : "";

  const openProductDropdown = (idx: number) => {
    const el = productInputRefs.current[idx];
    if (el) setDropdownRect(rectFor(el));
    setShowDropdown(idx);
    setProductSearch("");
  };

  const closeProductDropdown = () => {
    setShowDropdown(null);
    setDropdownRect(null);
  };

  /**
   * El panel es `fixed`, así que hay que reubicarlo cuando la vista se mueve o
   * queda flotando lejos de su campo. El contenedor que scrollea es el `<main>`
   * del shell, no la ventana: por eso el listener va con `capture: true`, que es
   * la única forma de enterarse del scroll de un descendiente.
   */
  useEffect(() => {
    if (showDropdown === null) return;
    const reposition = () => {
      const el = productInputRefs.current[showDropdown];
      if (el) setDropdownRect(rectFor(el));
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [showDropdown]);

  /** Cómo llama el negocio a la unidad suelta de ese producto ("Unidad", "Litro"…). */
  const unitLabel = (productId: string) =>
    products.find((p) => p.id === productId)?.unit || "Unidad";

  const handleAddLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);

  /**
   * Inserta una fila JUSTO DEBAJO de aquella cuyo "+" se tocó, no al final.
   * El botón vive en una fila concreta: mandar la nueva al fondo de una lista
   * larga obliga a buscar dónde apareció.
   */
  const handleInsertLineAfter = (idx: number) =>
    setLines((prev) => [...prev.slice(0, idx + 1), { ...EMPTY_LINE }, ...prev.slice(idx + 1)]);

  /**
   * Abre el modal de alta apuntando a la primera fila vacía; si no hay ninguna,
   * agrega una y apunta a esa. Así "Crear producto" siempre deja el producto
   * nuevo cargado en la compra, que es para lo que se lo abre.
   */
  const handleCreateProduct = () => {
    const emptyIdx = lines.findIndex((l) => !l.product_id);
    const targetIdx = emptyIdx === -1 ? lines.length : emptyIdx;
    if (emptyIdx === -1) handleAddLine();
    productModalLineIdxRef.current = targetIdx;
    setProductModalLineIdx(targetIdx);
  };

  const handleRemoveLine = (idx: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const handleLineChange = (idx: number, field: keyof PurchaseLineForm, value: string | number) =>
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line)));

  // Una compra ingresa mercadería al inventario. Un servicio no se le compra a
  // un proveedor ni suma existencias, así que no aparece en el selector.
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          !isServiceItem(p) &&
          (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
            p.sku.toLowerCase().includes(productSearch.toLowerCase()))
      ),
    [products, productSearch]
  );

  const selectProduct = useCallback((idx: number, product: Product) => {
    setLines((prev) =>
      prev.map((line, i) =>
        i === idx
          ? {
              ...line,
              product_id: product.id,
              product_name: product.name,
              description: line.description || `Compra: ${product.name}`,
              // Valores de arranque tomados del producto, NO un vínculo: el
              // costo de la caja se propone como el unitario por su contenido,
              // y desde ahí cada campo se edita por su cuenta.
              unit_price: getUnitCost(product) || product.price,
              package_price: product.purchase_price ?? product.price,
              units_per_package: Math.max(product.units_per_package ?? 1, 1),
            }
          : line
      )
    );
    setShowDropdown(null);
    setProductSearch("");
  }, []);


  const taxMultiplier = taxOption === "Ninguno" ? 0 : businessTaxRate;
  const subtotal = useMemo(() => lines.reduce((s, l) => s + lineTotalOf(l), 0), [lines]);
  const taxAmount = useMemo(
    () => Math.round(subtotal * taxMultiplier * 100) / 100,
    [subtotal, taxMultiplier]
  );
  const discount = parseFloat(discountAmount || "0") || 0;
  const total = subtotal + taxAmount - discount;

  const handleLoadLastPurchase = async () => {
    if (!distributorId) return;
    setLoadingLastPurchase(true);
    try {
      const last = await fetchLastPurchaseFromDistributor(distributorId);
      if (last && last.items.length > 0) {
        setLines(
          last.items.map((i) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            description: `Compra: ${i.product_name}`,
            package_quantity: i.package_quantity,
            loose_quantity: i.loose_quantity,
            unit_price: i.unit_price,
            package_price: i.package_price,
            units_per_package: i.units_per_package,
          }))
        );
      }
    } catch {
      /* el store ya reporta los errores de red; acá no hay nada que agregar */
    }
    setLoadingLastPurchase(false);
  };

  // Una línea sin cajas NI sueltas no compró nada: no puede mover stock.
  const validLines = lines.filter((l) => l.product_id && totalUnitsOf(l) > 0);

  /**
   * El N° de factura del proveedor es OBLIGATORIO.
   *
   * Es el único dato que ata esta compra al papel que emitió el proveedor. Sin
   * él, dos compras al mismo proveedor por el mismo monto son indistinguibles:
   * no se puede auditar contra el remito, ni detectar que se cargó dos veces.
   * El `invoice_number` interno no sirve para eso — lo genera Ventex.
   */
  const supplierNumber = supplierInvoiceNumber.trim();
  const canSubmit =
    Boolean(distributorId) && Boolean(supplierNumber) && validLines.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const payload = {
      distributor_id: distributorId,
      issue_date: issueDate,
      supplier_invoice_number: supplierNumber,
      status,
      // `description` es NOT NULL: si el usuario no escribió observación, cae al
      // nombre del producto en vez de romper el insert.
      items: validLines.map((l) => ({
        ...l,
        description: l.description || l.product_name,
      })),
      tax_rate: taxMultiplier,
      discount_amount: discount,
      due_date: dueDate,
      notes,
    };

    const ok = editingInvoice
      ? await updateInvoice(editingInvoice.id, payload)
      : await createInvoice(payload);

    if (ok) router.push("/dashboard/purchases");
  };

  return (
    <>
      {/* `pb-24`: el botón flotante de Soporte está fijo abajo a la derecha,
          justo donde cae "Guardar". Sin ese colchón lo tapa. */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full pb-24 animate-in fade-in duration-500">
        <div>
          <Link
            href="/dashboard/purchases"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-dim transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Compras
          </Link>
          <h1 className="text-2xl font-bold text-on-surface mt-1">
            {editingInvoice ? `Editar compra #${editingInvoice.invoice_number}` : "Nueva compra"}
          </h1>
        </div>

        {error && (
          <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
            {error}
          </div>
        )}

        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm p-4 sm:p-6 space-y-6">
          {/* Cabecera: número de factura del proveedor y fecha */}
          {/* En móvil la etiqueta va ARRIBA: "Factura de compra N°" mide casi el
              ancho de la tarjeta y en fila dejaba el campo cortado contra el borde. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0">
              <label htmlFor="supplier-number" className="text-lg font-semibold text-on-surface sm:shrink-0">
                Factura de compra N°
                <span className="text-error" aria-hidden="true"> *</span>
              </label>
              <input
                id="supplier-number"
                type="text"
                required
                aria-required="true"
                value={supplierInvoiceNumber}
                // Se pasa a mayúsculas mientras se escribe. `toUpperCase()` no
                // cambia el largo del texto, así que el cursor no salta.
                onChange={(e) => setSupplierInvoiceNumber(e.target.value.toUpperCase())}
                className={`${inputClass} sm:w-48`}
                placeholder="N° del proveedor"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0">
              <label htmlFor="issue-date" className="text-sm font-medium text-on-surface-variant sm:shrink-0">
                Fecha de compra:
              </label>
              <input
                id="issue-date"
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={`${inputClass} sm:w-44`}
              />
            </div>
          </div>

          {/* Información general */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-on-surface">Información general</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <Select
                  label="Proveedor *"
                  value={distributorId}
                  onChange={(e) => setDistributorId(e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {distributors
                    .filter((d) => d.status === "active" || d.id === distributorId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.business_name}
                      </option>
                    ))}
                </Select>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setDistributorDrawerOpen(true)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-dim transition-colors"
                  >
                    <IconPlus className="w-3.5 h-3.5" />
                    Nuevo proveedor
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadLastPurchase}
                    disabled={!distributorId || loadingLastPurchase}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Cargar los productos de la última compra a este proveedor"
                  >
                    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    {loadingLastPurchase ? "Cargando…" : "Última compra"}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="dist-doc" className={labelClass}>Identificación</label>
                <input
                  id="dist-doc"
                  type="text"
                  readOnly
                  value={distributorDocument}
                  placeholder="—"
                  className={`${inputClass} bg-surface-container-low text-on-surface-variant font-mono cursor-default`}
                />
              </div>

              <div>
                <label htmlFor="dist-phone-view" className={labelClass}>Teléfono</label>
                <input
                  id="dist-phone-view"
                  type="text"
                  readOnly
                  value={selectedDistributor?.phone ?? ""}
                  placeholder="—"
                  className={`${inputClass} bg-surface-container-low text-on-surface-variant cursor-default`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Sin "Anulada": anular devuelve stock y deja movimiento, cosa que
                  este submit no hace. Se anula desde Acciones en el listado. */}
              <Select label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="paid">Pagada</option>
                <option value="pending">Pendiente</option>
              </Select>

              <div>
                <label htmlFor="due-date" className={labelClass}>Fecha de vencimiento</label>
                <input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              <Select label="Impuesto" value={taxOption} onChange={(e) => setTaxOption(e.target.value)}>
                <option value="Ninguno">Ninguno</option>
                <option value="IVA">IVA {percentLabel}</option>
              </Select>
            </div>
          </section>

          {/* Productos comprados */}
          <section className="space-y-3">
            {/* "Agregar producto" vive ACÁ ARRIBA, no debajo de la tabla.
                Debajo quedaba justo en la trayectoria del desplegable de la
                última fila y el panel lo tapaba siempre que hubiera lugar hacia
                abajo. Moverlo es lo único que elimina la colisión de raíz;
                achicar el panel o forzarlo hacia arriba solo la corre de lugar. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-on-surface">Productos comprados</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(true)}
                  className="text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors"
                >
                  + Categoría
                </button>
                {/* Antes decía "Agregar producto" y agregaba una FILA vacía:
                    dos cosas distintas con el mismo nombre. Ahora este botón
                    crea el producto en el catálogo (abre el modal) y agregar
                    filas es el "+" del final de cada fila, que es donde se lo
                    busca. */}
                <button
                  type="button"
                  onClick={handleCreateProduct}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold transition-colors"
                >
                  <IconPlus className="w-4 h-4" />
                  Crear producto
                </button>
              </div>
            </div>

            {/* SIN `overflow-hidden`: recortaba el desplegable de producto, que
                es `absolute` y se sale de la tabla. Es la misma trampa que
                documenta `components/ui/Select.tsx`. Las esquinas superiores
                las redondea la cabecera por su cuenta (15px = 16 del contenedor
                menos su borde de 1px). */}
            <div className="border border-outline-variant/20 rounded-2xl">
              <div className="hidden lg:grid grid-cols-[minmax(0,1.5fr)_80px_115px_90px_115px_minmax(0,1fr)_115px_76px] gap-3 px-3 py-2.5 bg-surface-container-low rounded-t-[15px] border-b border-outline-variant/20 text-xs font-semibold text-on-surface-variant">
                <span>Producto</span>
                <span className="text-center">Cajas</span>
                <span className="text-right">Costo caja</span>
                <span className="text-center">Unidades</span>
                <span className="text-right">Costo unidad</span>
                <span>Observaciones</span>
                <span className="text-right">Total</span>
                <span className="sr-only">Acciones</span>
              </div>

              <div className="divide-y divide-outline-variant/10">
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_80px_115px_90px_115px_minmax(0,1fr)_115px_76px] gap-3 p-3 items-start"
                  >
                    {/* Producto */}
                    <div className="relative min-w-0">
                      <span className="lg:hidden text-[11px] font-semibold text-on-surface-variant block mb-1">
                        Producto
                      </span>
                      <div className="relative">
                        <input
                          ref={(el) => {
                            productInputRefs.current[idx] = el;
                          }}
                          type="text"
                          placeholder="Buscar o seleccionar…"
                          aria-label={`Producto de la línea ${idx + 1}`}
                          value={showDropdown === idx ? productSearch : line.product_name}
                          onFocus={() => openProductDropdown(idx)}
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            if (showDropdown !== idx) openProductDropdown(idx);
                          }}
                          onBlur={() => setTimeout(closeProductDropdown, 200)}
                          className={`${cellClass} pr-8`}
                        />
                        <svg
                          aria-hidden="true"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          viewBox="0 0 24 24"
                          className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant transition-transform ${
                            showDropdown === idx ? "rotate-180" : ""
                          }`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>

                      {/* Se abre al hacer foco, NO solo al teclear: un
                          desplegable que no muestra nada al abrirlo parece roto.
                          Con la búsqueda vacía lista el catálogo (recortado).

                          Va por PORTAL a <body> con `position: fixed`, no
                          `absolute` dentro de la fila: así se abre hacia arriba
                          cuando abajo no hay lugar —antes tapaba "Agregar
                          producto" y la etiqueta "Notas"— y ningún `overflow`
                          de un ancestro lo puede recortar. Mismo patrón que
                          `components/ui/Select.tsx`. */}
                      {showDropdown === idx && dropdownRect && createPortal(
                        <div
                          style={{
                            top: dropdownRect.top,
                            left: dropdownRect.left,
                            width: dropdownRect.width,
                            maxHeight: PANEL_MAX_HEIGHT,
                          }}
                          className="fixed z-[120] flex flex-col overflow-hidden bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl animate-in fade-in duration-100"
                        >
                          {/* El que scrollea es ESTA lista, no el panel: así el
                              pie "Crear producto" queda afuera del área
                              desplazable y no puede solaparse con la última
                              fila. Antes el pie era `sticky bottom-0` dentro del
                              scroll: un sticky flota por encima del contenido
                              que va tapando, y su fondo opaco lo disimulaba
                              hasta que el hover (`bg-primary/10`) lo reemplazaba
                              por un tinte del 10% y se transparentaba la fila de
                              abajo. */}
                          <div className="min-h-0 flex-1 overflow-y-auto">
                          {products.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-on-surface-variant">
                              Todavía no tienes productos.
                            </p>
                          ) : filteredProducts.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-on-surface-variant">Sin resultados</p>
                          ) : (
                            filteredProducts.slice(0, 10).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onMouseDown={() => selectProduct(idx, p)}
                                className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{p.name}</span>
                                  <span className="text-xs text-on-surface-variant font-mono">{p.sku}</span>
                                </span>
                                <span className="flex items-center gap-3 mt-0.5 text-xs text-on-surface-variant">
                                  <span>
                                    Stock:{" "}
                                    <strong className={needsRestock(p) ? "text-error" : "text-on-surface"}>
                                      {p.stock_level}
                                    </strong>
                                  </span>
                                  {canSeeCosts && (
                                    <span>
                                      Compra: <strong className="text-on-surface">${Number(p.purchase_price ?? 0).toLocaleString("en-US")}</strong>
                                    </span>
                                  )}
                                  <span>
                                    Venta: <strong className="text-on-surface">${Number(p.price).toLocaleString("en-US")}</strong>
                                  </span>
                                </span>
                              </button>
                            ))
                          )}
                          {filteredProducts.length > 10 && (
                            <p className="px-3 py-2 text-[11px] text-on-surface-variant border-t border-outline-variant/10">
                              Mostrando 10 de {filteredProducts.length}. Escribe para filtrar.
                            </p>
                          )}
                          </div>

                          {/* Reemplaza al botón "+" que estaba al lado del campo:
                              se confundía con "Agregar producto", que agrega una
                              FILA. Acá está donde se lo necesita —cuando buscaste
                              y no aparece— y no compite visualmente con nada. */}
                          <button
                            type="button"
                            onMouseDown={() => {
                              productModalLineIdxRef.current = idx;
                              setProductModalLineIdx(idx);
                              closeProductDropdown();
                            }}
                            className="w-full shrink-0 flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors border-t border-outline-variant/10"
                          >
                            <IconPlus className="w-3.5 h-3.5" />
                            Crear producto{productSearch ? ` "${productSearch}"` : " nuevo"}
                          </button>
                        </div>,
                        document.body,
                      )}

                      {/* Lo que de verdad entra al inventario. Cajas y sueltas
                          se tipean por separado, pero el stock se mueve en
                          unidades: esa cuenta tiene que estar a la vista ANTES
                          de guardar, no después. */}
                      {line.product_id && line.package_quantity > 0 && line.units_per_package > 1 && (
                        <p className="text-[11px] text-on-surface-variant mt-1">
                          Entran <strong className="text-on-surface">{totalUnitsOf(line)}</strong>{" "}
                          {unitLabel(line.product_id)} ({line.package_quantity} × {line.units_per_package}
                          {line.loose_quantity > 0 ? ` + ${line.loose_quantity}` : ""})
                        </p>
                      )}
                    </div>

                    {/* Cajas: solo tiene sentido si el producto viene por caja */}
                    <div>
                      <span className="lg:hidden text-[11px] font-semibold text-on-surface-variant block mb-1">
                        Cajas
                      </span>
                      {line.units_per_package > 1 ? (
                        <input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="0"
                          aria-label={`Cajas de la línea ${idx + 1}`}
                          title={`1 caja = ${line.units_per_package} ${unitLabel(line.product_id)}`}
                          value={line.package_quantity || ""}
                          onChange={(e) =>
                            handleLineChange(idx, "package_quantity", Math.max(0, Number(e.target.value)))
                          }
                          className={`${cellClass} text-center`}
                        />
                      ) : (
                        <p className="h-10 flex items-center justify-center text-xs text-on-surface-variant/50">
                          —
                        </p>
                      )}
                    </div>

                    {/* Costo de la caja: SOLO si el producto se creó por caja.
                        Es un campo libre, sin vínculo con el costo unitario: el
                        proveedor cobra la caja a un precio y la unidad suelta a
                        otro, y derivar uno del otro inventaría un número. */}
                    <div>
                      <span className="lg:hidden text-[11px] font-semibold text-on-surface-variant block mb-1">
                        Costo caja
                      </span>
                      {line.units_per_package > 1 ? (
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="0"
                          aria-label={`Costo por caja de la línea ${idx + 1}`}
                          value={line.package_price || ""}
                          onChange={(e) =>
                            handleLineChange(idx, "package_price", Number(e.target.value))
                          }
                          className={`${cellClass} text-right font-mono`}
                        />
                      ) : (
                        <p className="h-10 flex items-center justify-end text-xs text-on-surface-variant/50">
                          —
                        </p>
                      )}
                    </div>

                    {/* Unidades sueltas */}
                    <div>
                      <span className="lg:hidden text-[11px] font-semibold text-on-surface-variant block mb-1">
                        Unidades
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="0"
                        aria-label={`Unidades sueltas de la línea ${idx + 1}`}
                        value={line.loose_quantity || ""}
                        onChange={(e) =>
                          handleLineChange(idx, "loose_quantity", Math.max(0, Number(e.target.value)))
                        }
                        className={`${cellClass} text-center`}
                      />
                    </div>

                    {/* Precio, con la aclaración de a QUÉ se refiere */}
                    <div>
                      <span className="lg:hidden text-[11px] font-semibold text-on-surface-variant block mb-1">
                        Costo por unidad
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="0"
                        aria-label={`Costo por unidad de la línea ${idx + 1}`}
                        value={line.unit_price || ""}
                        onChange={(e) => handleLineChange(idx, "unit_price", Number(e.target.value))}
                        className={`${cellClass} text-right font-mono`}
                      />
                    </div>

                    {/* Observaciones */}
                    <div className="min-w-0">
                      <span className="lg:hidden text-[11px] font-semibold text-on-surface-variant block mb-1">
                        Observaciones
                      </span>
                      <input
                        type="text"
                        placeholder="Observaciones"
                        aria-label={`Observaciones de la línea ${idx + 1}`}
                        value={line.description}
                        onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                        className={cellClass}
                      />
                    </div>

                    {/* Total de la línea */}
                    <div className="flex lg:justify-end items-center lg:h-10">
                      <span className="lg:hidden text-[11px] font-semibold text-on-surface-variant mr-2">
                        Total
                      </span>
                      <span className="text-sm font-semibold text-on-surface font-mono tabular-nums">
                        {money(lineTotalOf(line))}
                      </span>
                    </div>

                    {/* Acciones de la fila: agregar otra debajo y quitar esta.
                        El "+" va en TODAS las filas; el basurero desaparece en
                        la última que queda, porque una compra sin ninguna línea
                        no es un estado al que se pueda llegar. */}
                    <div className="flex lg:justify-center items-center gap-1 lg:h-10">
                      <button
                        type="button"
                        onClick={() => handleInsertLineAfter(idx)}
                        className="w-10 h-10 lg:w-8 lg:h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                        aria-label={`Agregar una línea debajo de la ${idx + 1}`}
                        title="Agregar otra línea"
                      >
                        <IconPlus className="w-4 h-4" />
                      </button>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="w-10 h-10 lg:w-8 lg:h-8 flex items-center justify-center rounded-lg text-error hover:bg-error/10 transition-colors"
                          aria-label={`Quitar la línea ${idx + 1}`}
                          title="Quitar esta línea"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </section>

          {/* Notas + totales */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div>
              <label htmlFor="purchase-notes" className={labelClass}>Notas</label>
              <textarea
                id="purchase-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputClass} resize-y`}
                placeholder="Condiciones, remisión, quién recibió…"
              />
            </div>

            {/* `role="group"` explícito: `<dl>` no expone un rol estable en el
                árbol de accesibilidad, y sin nombre accesible el panel de
                totales no se puede acotar ni leer con lector de pantalla. */}
            <dl
              role="group"
              aria-label="Totales de la compra"
              className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-4 text-sm">
                <dt className="text-on-surface-variant">Subtotal</dt>
                <dd className="font-mono tabular-nums text-on-surface">{money(subtotal)}</dd>
              </div>

              <div className="flex items-center justify-between gap-4 text-sm">
                <dt>
                  <label htmlFor="purchase-discount" className="text-on-surface-variant">Descuento</label>
                </dt>
                <dd className="flex items-center gap-1">
                  <span className="text-on-surface-variant">-$</span>
                  <input
                    id="purchase-discount"
                    type="number"
                    min={0}
                    step={0.01}
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-28 bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-1.5 px-2 text-base lg:text-sm text-on-surface text-right font-mono tabular-nums focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </dd>
              </div>

              {taxMultiplier > 0 && (
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-on-surface-variant">IVA ({percentLabel})</dt>
                  <dd className="font-mono tabular-nums text-on-surface">{money(taxAmount)}</dd>
                </div>
              )}

              <div className="flex items-center justify-between gap-4 pt-3 border-t border-outline-variant/20">
                <dt className="text-sm font-semibold text-on-surface">Total</dt>
                <dd className="text-xl font-bold text-on-surface font-mono tabular-nums">{money(total)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard/purchases")}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-8 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>

      {distributorDrawerOpen && (
        <DistributorQuickModal
          onClose={() => setDistributorDrawerOpen(false)}
          onCreated={(id) => {
            // El drawer ya metió la fila en el store; acá solo la dejamos elegida.
            if (id) setDistributorId(id);
            else fetchDistributors();
          }}
        />
      )}

      {categoryModalOpen && <CategoryQuickModal onClose={() => setCategoryModalOpen(false)} />}

      {productModalLineIdx !== null && (
        <ProductModal
          onClose={() => {
            setProductModalLineIdx(null);
            productModalLineIdxRef.current = null;
          }}
          onCreated={async (productId, productName) => {
            const idx = productModalLineIdxRef.current;
            productModalLineIdxRef.current = null;
            setProductModalLineIdx(null);

            // Se recarga el catálogo ANTES de llenar la línea, y después se usa
            // el MISMO camino que al elegir de la lista (`selectProduct`).
            //
            // El modal solo devuelve el id y el texto crudo que se tipeó: no el
            // producto guardado. Y `addProduct` normaliza el nombre a mayúsculas
            // (services/inventory.service.ts) y calcula/guarda los costos, así
            // que llenar la línea con lo tipeado la dejaba en minúscula, con
            // costo unidad en 0 y sin unidades por caja — mientras que elegir
            // ese mismo producto de la lista traía todo bien.
            await fetchInventory();
            if (idx === null) return;

            const created = useInventoryStore
              .getState()
              .products.find((p) => p.id === productId);

            if (created) {
              selectProduct(idx, created);
              return;
            }

            // Respaldo: un servicio puede volver sin id utilizable. Al menos
            // queda el nombre, como antes.
            setLines((prev) =>
              prev.map((line, i) =>
                i === idx
                  ? {
                      ...line,
                      product_id: productId,
                      product_name: productName,
                      description: line.description || `Compra: ${productName}`,
                    }
                  : line
              )
            );
          }}
        />
      )}
    </>
  );
}

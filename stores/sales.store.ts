import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as salesService from "@/services/sales.service";
import type {
  SaleListItem,
  SaleDetail,
  SalesSummary,
  SalesPeriodId,
  ItemFilter,
  SaleVoidImpact,
  SaleReceiptExtras,
} from "@/services/sales.service";
import { NO_ITEM_FILTER } from "@/services/sales.service";

interface SalesState {
  sales: SaleListItem[];
  /** Total de ventas del período, para paginar (no es `sales.length`). */
  total: number;
  page: number;
  loading: boolean;
  error: string | null;

  /** KPIs del período completo; vienen del RPC, no de `sales`. */
  summary: SalesSummary | null;

  period: SalesPeriodId;
  customFrom: string;
  customTo: string;
  /** Búsqueda por nombre de cliente. Vacío = sin filtrar. */
  customerQuery: string;
  /** Filtro por método de pago. Vacío = todos. */
  paymentMethod: string;
  /** Filtro por método de transferencia. Vacío = todas. */
  transferMethod: string;
  /**
   * Por qué producto/servicio o categoría se está filtrando.
   *
   * Viaja como UN objeto y no como tres campos sueltos porque los tres se
   * limpian y se mandan siempre juntos: son una sola pregunta ("¿de qué ítem?")
   * hecha de tres maneras, y separarlos invita a mandar dos a la vez.
   */
  itemFilter: ItemFilter;

  detail: SaleDetail | null;
  detailLoading: boolean;
  /**
   * Qué mueve anular la venta abierta (efectivo, fiado, puntos, premio,
   * comisión pagada). null mientras no se calculó.
   */
  voidImpact: SaleVoidImpact | null;
  /** Documento del cliente y medios de pago: para reimprimir y para el split. */
  receiptExtras: SaleReceiptExtras | null;
  /** Anulación en curso: deshabilita el botón y el cierre del modal. */
  voiding: boolean;
  /**
   * Error de la ANULACIÓN, aparte de `error`: este se muestra dentro del modal.
   * El de la tabla quedaba detrás del modal y la anulación parecía no hacer nada.
   */
  voidError: string | null;

  /** Recarga listado + totales del período actual. */
  fetchSales: () => Promise<void>;
  setPeriod: (period: SalesPeriodId) => Promise<void>;
  setCustomRange: (from: string, to: string) => Promise<void>;
  setCustomerQuery: (query: string) => Promise<void>;
  setPaymentMethod: (method: string) => Promise<void>;
  setTransferMethod: (method: string) => Promise<void>;
  setItemFilter: (filter: ItemFilter) => Promise<void>;
  setPage: (page: number) => Promise<void>;
  openDetail: (saleId: string) => Promise<void>;
  closeDetail: () => void;
  /** El motivo es obligatorio en la pantalla; ver `salesService.voidSale`. */
  voidSale: (saleId: string, reason: string) => Promise<boolean>;
  clearVoidError: () => void;
}


export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],
  total: 0,
  page: 0,
  // Arranca en `true`: el primer render es anterior al fetch del efecto, y con
  // `false` mostraba el estado vacío sobre datos que sí existen.
  loading: true,
  error: null,
  summary: null,
  // Arranca en el mes en curso: mostrar todo el histórico es caro y casi nunca
  // es lo que se quiere mirar al abrir la pantalla.
  period: "month",
  customFrom: "",
  customTo: "",
  customerQuery: "",
  paymentMethod: "",
  transferMethod: "",
  itemFilter: NO_ITEM_FILTER,
  detail: null,
  detailLoading: false,
  receiptExtras: null,
  voidImpact: null,
  voiding: false,
  voidError: null,

  fetchSales: async () => {
    const { period, customFrom, customTo, page, customerQuery, paymentMethod, transferMethod, itemFilter } = get();
    set({ loading: true, error: null });
    try {
      const range = salesService.resolvePeriod(period, customFrom, customTo);
      // En paralelo: son consultas independientes y la página las necesita a las dos.
      const [pageResult, summary] = await Promise.all([
        salesService.fetchSales(range, page, undefined, customerQuery, paymentMethod, transferMethod, itemFilter),
        salesService.fetchSalesSummary(range, customerQuery, paymentMethod, transferMethod, itemFilter),
      ]);
      set({ sales: pageResult.items, total: pageResult.total, summary, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  setPeriod: async (period) => {
    // Cambiar de período reinicia la paginación: la página 3 del mes pasado no
    // tiene por qué existir en "hoy".
    set({ period, page: 0 });
    // "Personalizado" espera a que haya fechas cargadas.
    if (period === "custom" && !get().customFrom && !get().customTo) return;
    await get().fetchSales();
  },

  setCustomRange: async (from, to) => {
    set({ customFrom: from, customTo: to, period: "custom", page: 0 });
    if (!from && !to) return;
    await get().fetchSales();
  },

  setCustomerQuery: async (query) => {
    // Volver a la página 1: la 3 de "todos" no tiene por qué existir filtrando.
    set({ customerQuery: query, page: 0 });
    await get().fetchSales();
  },

  setPaymentMethod: async (method) => {
    // Al cambiar el método de pago, resetea el sub-filtro de transferencia.
    set({ paymentMethod: method, transferMethod: "", page: 0 });
    await get().fetchSales();
  },

  setItemFilter: async (filter) => {
    set({ itemFilter: filter, page: 0 });
    await get().fetchSales();
  },

  setTransferMethod: async (method) => {
    set({ transferMethod: method, page: 0 });
    await get().fetchSales();
  },

  setPage: async (page) => {
    set({ page });
    await get().fetchSales();
  },

  openDetail: async (saleId) => {
    set({ detailLoading: true, detail: null, receiptExtras: null, voidImpact: null, voidError: null });
    try {
      // En paralelo. Los extras del recibo (documento del cliente y medios de
      // un split) alimentan la reimpresión Y el aviso de efectivo; los de
      // anulación (puntos/premio) devuelven vacío si fallan en vez de tumbar
      // el detalle.
      // `fetchSaleReceiptAmounts` (recibido y descuento por línea) nunca
      // tira: sin la migración aplicada devuelve nulls.
      const [detail, extras, amounts, voidExtras] = await Promise.all([
        salesService.fetchSaleDetail(saleId),
        salesService.fetchSaleReceiptExtras(saleId),
        salesService.fetchSaleReceiptAmounts(saleId),
        salesService.fetchSaleVoidExtras(saleId),
      ]);
      const receiptExtras = { ...extras, ...amounts };
      set({
        detail,
        receiptExtras,
        voidImpact: salesService.saleVoidImpact(
          detail,
          receiptExtras.payments,
          voidExtras.ledger,
          voidExtras.redemptions,
        ),
        detailLoading: false,
      });
    } catch (e) {
      set({ error: toMessage(e), detailLoading: false });
    }
  },

  closeDetail: () => set({ detail: null, receiptExtras: null, voidImpact: null, voidError: null }),

  clearVoidError: () => set({ voidError: null }),

  voidSale: async (saleId, reason) => {
    set({ voiding: true, voidError: null });
    try {
      await salesService.voidSale(saleId, reason);
      set((s) => ({
        voiding: false,
        sales: s.sales.map((sl) =>
          sl.id === saleId ? { ...sl, status: "void" } : sl
        ),
        detail: s.detail?.id === saleId
          ? { ...s.detail, status: "void" }
          : s.detail,
      }));
      // Las tarjetas (completadas, ingresos, ticket) cambiaron. Solo se
      // recalcula el resumen: recargar la tabla haría parpadear el listado
      // detrás del modal, y la fila ya quedó marcada como anulada.
      const { period, customFrom, customTo, customerQuery, paymentMethod, transferMethod, itemFilter } = get();
      salesService
        .fetchSalesSummary(
          salesService.resolvePeriod(period, customFrom, customTo),
          customerQuery,
          paymentMethod,
          transferMethod,
          itemFilter,
        )
        .then((summary) => set({ summary }))
        .catch(() => {});
      return true;
    } catch (e) {
      set({ voidError: toMessage(e), voiding: false });
      return false;
    }
  },
}));

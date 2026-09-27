/**
 * Placeholder temporal: T1 (gate) necesita que la rama `tienda` de esta
 * pestaña renderice algo real para poder compilar y probarse de forma
 * aislada. T4 lo reemplaza por el gestor de ofertas completo
 * (`./OffersManager`, con store y servicio propios) y borra este archivo.
 */
export function OffersManagerPlaceholder() {
  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
      <h2 className="text-base font-bold text-on-surface">Ofertas</h2>
      <p className="text-sm text-on-surface-variant mt-1">Próximamente.</p>
    </div>
  );
}

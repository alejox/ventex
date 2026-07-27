# Plan de Mejoras: Compras e Inventario — Paso a Paso

Basado en nota de voz 2026-07-07. Orden de implementación: primero lo que desbloquea funcionalidad, luego mejoras de UX.

---

## Fase 1: IVA en Facturas de Compra (prioridad alta)

### Paso 1 — Modificar `services/purchases.service.ts`

**Qué hacer**: Agregar `tax_rate` y `discount_amount` a los tipos y funciones de creación/actualización.

**Detalle**:
- `PurchaseInvoiceParams` → agregar `tax_rate?: number`, `discount_amount?: number`
- `createPurchaseInvoice`: calcular `subtotal` igual, `tax_amount = subtotal * (tax_rate ?? 0)`, `total = subtotal + tax_amount - discount_amount`
- `updatePurchaseInvoice`: mismo cálculo

### Paso 2 — Modificar `stores/purchases.store.ts`

**Qué hacer**: Pasar los nuevos campos en los tipos de las acciones `createInvoice` y `updateInvoice`.

**Detalle**:
- `createInvoice(params)`: agregar `tax_rate` y `discount_amount` al tipo
- `updateInvoice(id, params)`: igual

### Paso 3 — Modificar UI `app/dashboard/purchases/page.tsx`

**Qué hacer**: Agregar selector de IVA y descuento en el modal de compra.

**Detalle**:
- Agregar estado `taxRate` con opciones `"Ninguno"` (0.00) y `"19%"` (0.19), default `"Ninguno"`
- Agregar campo `discountAmount` opcional
- En la sección de total, mostrar desglose: Subtotal, IVA, Descuento, Total
- Al hacer submit, pasar `tax_rate` convertido a número y `discount_amount`
- Actualizar `total` calculado visible en UI

---

## Fase 2: UX de Precios — Modo "Precio con IVA Incluido"

### Paso 4 — Modificar `app/dashboard/inventory/product/page.tsx`

**Qué hacer**: Agregar un tercer modo al precio de venta: "Precio final (IVA incluido)".

**Detalle**:
- En `priceMode`, agregar opción `"final"` al lado de `"manual"` y `"percentage"`
- Botón de selección entre 3 modos: Manual / % Margen / Precio Final
- Modo "Precio Final": un solo campo donde el usuario ingresa el precio final (ej. $500)
  - Calcular: `base = final / 1.19`, `iva = final - base`
  - Guardar en `price` el valor final (con IVA) — igual que hoy
- El IVA selector sigue existiendo (Ninguno/19%) para determinar si se divide o no

### Paso 5 — Aplicar mismo cambio en `components/ProductModal.tsx`

**Qué hacer**: Reflejar los mismos modos de precio en el modal rápido de creación de producto.

---

## Fase 3: Separar Producto de Inventario

### Paso 6 — Migración DB `20260707000000_create_inventory_movements.sql`

**Qué hacer**: Crear tabla `inventory_movements` con RLS, triggers, índices.

**Detalle**:
```sql
create table if not exists public.inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  type          text not null check (type in ('in', 'out', 'adjust')),
  quantity      integer not null check (quantity > 0),
  reference_type text,
  reference_id  uuid,
  notes         text,
  created_at    timestamptz not null default now()
);
-- RLS, trigger set_user_id, índices
```

### Paso 7 — Crear `services/inventory-movements.service.ts`

**Qué hacer**: Servicio con tipos y funciones para movimientos de inventario.

**Detalle**:
- `InventoryMovement` interface: id, product_id, type, quantity, reference_type, reference_id, notes, created_at, products? (embedded name, sku)
- `ManualMovementInput`: product_id, type, quantity, notes
- `fetchMovements(productId?: string)`: query a `inventory_movements` con join a `products(name, sku)`
- `createManualMovement(input)`: inserta movimiento + actualiza `products.stock_level` (`+quantity` si type='in', `-quantity` si type='out', `=quantity` si type='adjust')

### Paso 8 — Crear `stores/inventory-movements.store.ts`

**Qué hacer**: Store zustand estándar.

**Detalle**:
- State: `movements[]`, `loading`, `error`
- Actions: `fetchMovements`, `addMovement`

### Paso 9 — Crear `components/StockAdjustmentModal.tsx`

**Qué hacer**: Modal para ajuste manual de stock.

**Detalle**:
- Selector de producto (search + dropdown)
- Tipo: "Entrada" / "Salida" / "Ajustar a"
- Cantidad
- Notas opcionales
- Al confirmar: llama a `addMovement` del store

### Paso 10 — Crear `app/dashboard/inventory/movements/page.tsx`

**Qué hacer**: Página de historial de movimientos.

**Detalle**:
- Filtros: por producto (search), por tipo (in/out/adjust), por fecha
- Tabla: Fecha, Producto, Tipo, Cantidad, Referencia, Notas
- Botón "Ajustar Stock" que abre `StockAdjustmentModal`
- Enlace desde la página de inventario y desde la ficha del producto

### Paso 11 — Modificar `app/dashboard/inventory/product/page.tsx`

**Qué hacer**: Eliminar campo "Nivel de Stock" del formulario de creación.

**Detalle**:
- Quitar sección `Nivel de Stock` (líneas 414-424)
- En edición: mostrar el stock actual como texto informativo (read-only)
- Agregar link "Ver movimientos de este producto" → `/dashboard/inventory/movements?product_id=...`
- `NewProductInput` → `stock_level` queda opcional o se quita; `createProduct` usa `stock_level: 0`

### Paso 12 — Modificar `services/inventory.service.ts`

**Qué hacer**: Eliminar obligatoriedad de `stock_level`.

**Detalle**:
- `NewProductInput.stock_level` opcional (quitar del form input)
- `createProduct`: hardcodear `stock_level: 0`
- `updateProduct`: no modificar `stock_level`

### Paso 13 — Modificar `services/purchases.service.ts` (refactor stock)

**Qué hacer**: Al crear compra, también insertar en `inventory_movements`.

**Detalle**:
- En `createPurchaseInvoice`, después de `increment_stock` y antes de `return`:
  ```typescript
  await supabase.from("inventory_movements").insert(
    params.items.map((item) => ({
      product_id: item.product_id,
      type: "in",
      quantity: item.quantity,
      reference_type: "purchase",
      reference_id: invoiceId,
      notes: `Compra #${invoiceNumber}`,
    }))
  );
  ```

### Paso 14 — Agregar link en sidebar/navegación

**Qué hacer**: En `app/dashboard/layout.tsx`, agregar enlace "Movimientos" si existe un menú de navegación, o en la página de inventario `app/dashboard/inventory/page.tsx`.

---

## Fase 4: Mejoras de Usabilidad en Compras

### Paso 15 — Creación inline de producto desde compra

**Qué hacer**: El botón "+" en la línea de compra abre `ProductModal` inline (no redirect).

**Detalle**:
- En lugar de `window.location.href = "/dashboard/inventory/product"`, usar estado `showProductModal` que renderiza `ProductModal`
- `ProductModal` recibe `onCreated(product)` callback
- Al crearse el producto, se selecciona automáticamente en la línea actual
- Requiere pasar `onCreated` a `selectProduct` y actualizar `products` en el store local

### Paso 16 — Dropdown de productos informativo

**Qué hacer**: Mostrar stock actual y precios al buscar producto en compra.

**Detalle**:
- En el dropdown `filteredProducts` de la línea de compra, cada fila muestra: nombre, SKU, stock actual (`stock_level`), precio de compra anterior (`purchase_price`), precio de venta (`price`)
- Si `stock_level <= minimum_stock`, mostrar indicador visual (ej. texto rojo "Stock bajo")

### Paso 17 — Soporte de paquetes en compra

**Qué hacer**: Si el producto tiene `units_per_package > 1`, mostrar campo adicional "Paquetes".

**Detalle**:
- Al seleccionar un producto que tiene `units_per_package > 1`, mostrar debajo de cantidad: "1 paquete = N unidades" y un segundo campo opcional "Paquetes"
- Si el usuario llena "Paquetes", la cantidad se calcula como `packages * unitsPerPackage`
- Si solo llena "Cantidad", se usa ese valor directamente

### Paso 18 — Devolución/Anulación de compra

**Qué hacer**: Botón "Anular y devolver stock" en cada compra.

**Detalle**:
- En la tabla de compras, al lado del botón editar/ver, agregar botón "Anular"
- Al confirmar: cambia status a `"cancelled"`, inserta movimientos de tipo `'out'` con `reference_type = 'purchase_return'`, decrementa stock
- Confirmación con modal: "¿Estás seguro? Se devolverán N unidades al inventario"

### Paso 19 — Precargar última compra del proveedor

**Qué hacer**: Al seleccionar un distribuidor, sugerir productos de la compra anterior.

**Detalle**:
- Agregar botón "Cargar última compra" en el modal, visible solo cuando hay distribuidor seleccionado
- Buscar en `invoices` la compra más reciente del mismo distribuidor
- Si existe, cargar sus items en `lines` con misma cantidad y precio
- El usuario puede modificar antes de guardar

### Paso 20 — Precio de venta sugerido inline

**Qué hacer**: Mostrar precio de venta actual y sugerido al lado del campo de precio unitario en la línea de compra.

**Detalle**:
- Al seleccionar producto, mostrar debajo: "Venta actual: $X | Margen 30%: $Y | Margen 50%: $Z"
- Si el precio de compra actual (`unit_price`) difiere del `purchase_price` registrado, mostrar indicador y sugerir actualizar

---

## Fase 5: Filtros y Estados

### Paso 21 — Filtros en lista de compras

**Qué hacer**: Agregar filtro por proveedor.

**Detalle**:
- En la cabecera de la tabla, agregar select de distribuidor para filtrar
- Mantener el buscador por factura

### Paso 22 — Estado "Pagada parcialmente"

**Qué hacer**: Agregar opción de estado parcial.

**Detalle**:
- En el select de estado, agregar `"partial"` → "Parcial"
- Color: azul/cyan
- En el cálculo de total, opcionalmente agregar campo "Monto pagado" que se muestra en la tabla

---

## Archivos: Resumen

| # | Archivo | Acción |
|---|---|---|
| 6 | `supabase/migrations/20260707000000_create_inventory_movements.sql` | **Crear** |
| 7 | `services/inventory-movements.service.ts` | **Crear** |
| 8 | `stores/inventory-movements.store.ts` | **Crear** |
| 9 | `components/StockAdjustmentModal.tsx` | **Crear** |
| 10 | `app/dashboard/inventory/movements/page.tsx` | **Crear** |
| 1 | `services/purchases.service.ts` | **Modificar** |
| 2 | `stores/purchases.store.ts` | **Modificar** |
| 3 | `app/dashboard/purchases/page.tsx` | **Modificar** |
| 4 | `app/dashboard/inventory/product/page.tsx` | **Modificar** |
| 5 | `components/ProductModal.tsx` | **Modificar** |
| 12 | `services/inventory.service.ts` | **Modificar** |
| 13 | `stores/inventory.store.ts` | **Modificar** (si cambia interfaz) |
| 14 | `app/dashboard/inventory/page.tsx` | **Modificar** |
| - | `app/dashboard/layout.tsx` | **Modificar** (sidebar) |
| 15 | `components/PurchaseInvoiceDetailModal.tsx` | **Modificar** (si aplica devolución) |

---

## Orden de Ejecución Recomendado

1. **Paso 1-3**: IVA en compras (funcionalidad faltante)
2. **Paso 4-5**: UX precio con IVA incluido
3. **Paso 6-14**: Tabla movimientos + separar stock de producto
4. **Paso 15-20**: Usabilidad en compras
5. **Paso 21-22**: Filtros y estados

Cada paso es autónomo y se puede implementar sin romper lo anterior. Si quieres empezar con alguno en particular, dime cuál.

# Comparador de precios por proveedor + alerta al comprar más caro

Objetivo: ver, por producto, qué proveedor lo vende más barato, y avisar al cargar una compra si el precio ingresado supera el de otro proveedor.
Rama: `main` (push directo). Entrega: `ask-on-risk` (commits por unidad). Test runner: `npm test`.

## Specs

- **S1** — "Generar una sección de comparación de precios de productos según proveedores, para asi verificar que proveedor es mas competitivo". Una sección muestra, por producto, el último costo unitario pagado a cada proveedor (según el historial de compras no anuladas), marcando el más barato.
- **S2** — "valida si podemos emitir alertas al comprar si adquirimos algo mas caro y mostrar que proveedor vende a un mejor precio". Al cargar una línea de compra, si el costo unitario ingresado supera el mejor precio de OTRO proveedor para ese producto, se avisa y se muestra qué proveedor lo vende más barato.

### Supuestos (asumidos, no pedidos explícitos)

- "Precio" = **costo unitario** derivado de la línea, con la misma cuenta que `sync_products_last_cost`: si hay cajas con precio, `package_price / units_per_package`; si no, `unit_price`.
- El comparador usa el **último** costo por (producto, proveedor) — el precio que rige hoy —, no el mínimo histórico ni un promedio.
- La alerta compara contra el proveedor más barato DISTINTO del seleccionado en la compra.
- Solo compras no anuladas (`status <> 'cancelled'`).
- La sección vive en `/dashboard/purchases/comparar`, accesible desde Compras.

## Tasks

- T1 — RPC `product_prices_by_distributor`: último costo unitario por (producto, proveedor) desde el historial de compras no anuladas, espejo de la cuenta de `sync_products_last_cost`. (S1, S2) — inline
- T2 — Sección comparador: página `/dashboard/purchases/comparar` + tabla por producto/proveedor con el más barato resaltado. (S1) — inline
- T3 — Alerta en `PurchaseForm`: al cargar/editar una línea, comparar el costo unitario contra el mejor de otro proveedor y avisar. (S2) — inline
- T4 — Tests puros de la lógica de comparación + verificación (typecheck, suite). (S1, S2) — inline

## Log

- L1 (2026-10-23) — usuario: "Generar una sección de comparación de precios de productos según proveedores , para asi verificar que proveedor es mas competitivo, tambien valida si podemos emitir alertas al comprar si adquirimos algo mas caro y mostrar que proveedor vende a un mejor precio".
- L2 (2026-10-23) — Viabilidad de la alerta: SÍ. El historial de compras (`invoices.type='compra'` + `invoice_items`) ya guarda proveedor y precios por línea; se agregó la RPC `product_prices_by_distributor` que devuelve el último costo unitario por (producto, proveedor) y alimenta tanto el comparador como la alerta del formulario.
- L3 (2026-10-23) — Entregado a main: comparador en `/dashboard/purchases/comparar` + alerta "💡 X vende esto a $Y" en la línea de compra cuando el costo supera al de otro proveedor.

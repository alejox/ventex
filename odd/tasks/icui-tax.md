# ICUI — impuesto saludable en productos y compras

Objetivo: permitir marcar productos con ICUI y registrarlo en las compras, solo para el rubro `tienda`.
Rama: `feat/icui-tax`. Entrega: `ask-on-risk` (rama única, commits por unidad). Test runner: `npm test` (Node `tsx --test`).

## Specs

- **S1** — "creame una seccion en las tiendas que permita agregar el impuesto icui al crear los productos". Al crear/editar un producto (rubro `tienda`) se puede marcar **"Aplica ICUI"** (flag booleano `products.icui_applies`, default false). No toca `create_sale`.
- **S2** — "…o al agregar compras". En la compra se registra el ICUI como segundo impuesto, junto al IVA: selector "ICUI 20%" (Ninguno / ICUI), monto calculado por la base sobre las líneas de productos marcados con ICUI y sumado al total. El monto viaja a `invoices.icui_amount` con su tasa `invoices.icui_rate`.
- **S3** — Contexto de dominio (dato del usuario, no regla a implementar como cobro): "Impuesto a los Comestibles Ultraprocesados Industrialmente… creado por la Ley 2277 de 2022… Su tarifa actual es del 20 %"; "Es un impuesto monofásico… el consumidor final o el comerciante que revende el producto no debe liquidarlo de nuevo (ya viene incluido en el costo)"; "en la DIAN… se identifica bajo el código 35". Consecuencia de diseño: el ICUI NO se cobra en las ventas (ya viene en el costo); solo se marca en el producto y se registra en la compra.

### Supuestos (asumidos, no pedidos explícitos)

- La tasa ICUI es una constante fija `0.20` (no configurable en Ajustes por ahora; el dato "20 %" es del usuario).
- La UI de ICUI se muestra solo en `businessType === "tienda"`; las columnas existen para todos los rubros (default false/0, inofensivas).
- El ICUI de una compra se calcula sobre la suma de `line_total` de las líneas marcadas, SIN descontar el descuento de cabecera (el descuento es una negociación; el ICUI grava el valor de la mercadería marcada). Documentado para revisión.

## Tasks

- T1 — Migración: columnas `products.icui_applies`, `invoice_items.icui_applies`, `invoices.icui_rate`/`icui_amount`; función `purchase_icui_amount`; recrear `recompute_purchase_invoice_totals`, `replace_purchase_invoice_items`, `save_purchase_invoice` y `guard_purchase_invoice_write`. (S1, S2) — inline — `a20a14b`
- T2 — Cliente puro: `lib/icui.ts` (tasa, label, `icuiRateFor`, `icuiAmountFor`) + tests. (S2) — inline — `d51511f`
- T3 — Producto: `icui_applies` en `Product`/`NewProductInput`/`PRODUCT_COLUMNS`/`flagsPatch`/`createProduct`/`updateProduct` + switch "Aplica ICUI" en la ficha (tienda). (S1) — inline — `d51511f`
- T4 — Compra: `icui_rate`/`icui_amount` en el servicio de compras (tipos, select, header, paths legacy) + selector "ICUI" y totales en `PurchaseForm` (tienda). (S2) — inline — `d51511f`
- T5 — Traducción de `TASA_ICUI_INVALIDA` en `lib/errors.ts`; verificación completa (tests, typecheck). (S2) — inline — `d51511f`

## Log

- L1 (2026-10-23) — usuario: "creame una seccion en las tiendas que permita agregar el impuesto icui al crear los productos o al agregar compras En una factura en Colombia, ICUI significa Impuesto a los Comestibles Ultraprocesados Industrialmente. Es un impuesto saludable creado por la Ley 2277 de 2022 que grava los alimentos con alto contenido de azúcares añadidos, sodio o grasas saturadas. Su tarifa actual es del 20 %. … Es un impuesto monofásico. Se genera únicamente en la producción o importación, por lo que el consumidor final o el comerciante que revende el producto no debe liquidarlo de nuevo (ya viene incluido en el costo). … En la DIAN, este concepto se identifica bajo el código 35."
- L2 (2026-10-23) — usuario: "cuando termines, lo subes" (autoriza push al terminar).
- L3 (2026-10-23) — usuario: "este impuesto debe ir individual, ya que no todos los productos lo manejan". Confirmado en el diseño: ICUI por producto, no un impuesto global de la compra.
- L4 (2026-10-23) — usuario: "cuando termines sube todo a main" (push a main, no a rama).

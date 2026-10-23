# Descuento individual por línea en la compra

Objetivo: cada línea de una compra lleva su propio descuento, y el subtotal/total reflejan la suma de todos los descuentos de línea.
Rama: `main` (push directo). Entrega: `ask-on-risk` (commit único). Test runner: `npm test`.

## Specs

- **S1** — "agregar el descuento individual al realizar la compra". Cada línea de compra tiene un campo de descuento propio.
- **S2** — "en el subtotal y total se agregan el total de descuentos". El subtotal y el total descuentan la suma de los descuentos de línea. El descuento de cabecera (`invoices.discount_amount`) pasa a ser DERIVADO = suma de los descuentos de línea, y la UI lo muestra como "Descuentos" (solo lectura).

### Supuestos

- `line_total = bruto − descuento_línea` (bruto = cajas × precio caja + sueltas × precio unidad).
- El IVA se calcula sobre el subtotal YA descontado (el descuento ya está dentro de cada línea).
- El ICUI se calcula sobre las `line_total` (netas) de las líneas marcadas.
- El descuento por línea se valida `0 ≤ descuento ≤ bruto` (`DESCUENTO_LINEA_INVALIDO`).
- Compra vieja con descuento de cabecera: al reeditarla, ese descuento no se traslada a las líneas (limitación conocida; las líneas arrancan en 0).

## Tasks

- T1 — Migración: `invoice_items.discount_amount` + recrear `replace_purchase_invoice_items` (validar y restar descuento), `recompute_purchase_invoice_totals` (descuento derivado, IVA sobre neto), `save_purchase_invoice` (sin descuento de cabecera), `guard_purchase_invoice_write`. (S1, S2)
- T2 — Cliente: `lineTotalOf` resta descuento; tipos, select y `toRpcItems` llevan `discount_amount`; paths legacy derivan el descuento. (S1, S2)
- T3 — `PurchaseForm`: columna de descuento por línea, fila "Descuentos" (solo lectura) en totales, payload sin descuento de cabecera. (S1, S2)
- T4 — Traducción `DESCUENTO_LINEA_INVALIDO` + tests puros + verificación. (S1, S2)

## Log

- L1 (2026-10-23) — usuario: "Tengo que agregar el descuento individual al realizar la compra y en el subtotal y total se agregan el total de descuentos".
- L2 (2026-10-23) — usuario: "si, hazlo ahora".

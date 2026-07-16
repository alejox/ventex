# Gestión de turnos (caja) para empleados

## Contexto

Los empleados inician sesión con llave del negocio + usuario + contraseña y aterrizan en `/dashboard/pos`. Al ingresar, el empleado **abre turno declarando la base de caja** (efectivo inicial), **no puede cobrar sin turno abierto**, y al **cerrar turno** ve el arqueo: ventas del turno por método de pago, efectivo esperado vs contado y la diferencia. El dueño no abre turnos; ve el historial de turnos de su equipo en Ajustes → Trabajadores. Las horas de apertura/cierre quedan registradas de paso (asistencia implícita).

Hallazgo técnico que condiciona el diseño: `create_sale` usaba `auth.uid()` para buscar productos/settings y atribuir la venta. Para un empleado eso apunta a su propio uuid (no al negocio), por lo que el cobro de un empleado fallaba/atribuía mal. El arreglo mínimo es usar `get_effective_user_id()` (mapea empleado → dueño) como uid efectivo dentro de `create_sale`.

## 1. Base de datos (migración `create_shifts`)

**Tabla `public.shifts`** (RLS habilitado):
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null` → tenant (dueño), FK `auth.users`, default `get_effective_user_id()`
- `worker_id uuid not null` → quién abrió (auth uid del empleado), FK `auth.users`, default `auth.uid()`
- `opened_at timestamptz default now()`, `closed_at timestamptz null`
- `opening_cash numeric not null default 0` (base de caja)
- `closing_cash numeric null` (contado al cierre), `expected_cash numeric null`, `difference numeric null`
- `sales_total numeric null`, `sales_count int null`, `totals_by_method jsonb null` (snapshot al cierre)
- `notes text null`
- `status text not null default 'open' check (status in ('open','closed'))`
- Índice único parcial: **un solo turno abierto por empleado** → `unique (worker_id) where status='open'`

**RLS**: lectura para el tenant (`user_id = get_effective_user_id()`); insert solo del propio turno (`worker_id = auth.uid()`); update del propio turno o por el dueño (`user_id = auth.uid()`).

**Columna en ventas**: `alter table sales add column shift_id uuid null references shifts(id) on delete set null`.

**Funciones (RPC, security invoker sobre RLS, atómicas):**
- `open_shift(p_opening_cash numeric) returns json` — valida que el caller sea empleado (`profiles.is_worker`), que no tenga turno abierto (el índice único respalda), inserta y devuelve el turno.
- `current_shift() returns json` — turno abierto del caller (`worker_id = auth.uid()`) + acumulados en vivo: `count`, `sum(total)`, sumas por `payment_method` y efectivo esperado. Devuelve `null` si no hay.
- `close_shift(p_closing_cash numeric, p_notes text default null, p_shift_id uuid default null) returns json` — cierra el turno abierto del caller, o (si `p_shift_id` viene y el caller es el **dueño** del tenant) un turno olvidado de un empleado. Calcula: totales por método desde `sales`, `expected_cash = opening_cash + total efectivo`, `difference = closing_cash - expected_cash`; guarda snapshot y devuelve el resumen.

**Ajuste a `create_sale`** (misma migración):
- `v_uid := public.get_effective_user_id()` en lugar de `auth.uid()` (los lookups de productos/settings/clientes y la atribución de la venta pasan a ser del negocio; para el dueño no cambia nada).
- Sellado del turno del lado del servidor: si el caller es empleado sin turno abierto → `raise exception 'Debes abrir turno antes de cobrar'`; si tiene, `sales.shift_id := turno`. Dueño: `shift_id null`, vende libre.

Después de la migración: actualizar `utils/supabase/database.types.ts` (tabla `shifts`, columna `sales.shift_id`, funciones nuevas).

## 2. Capa de servicios y store (patrón obligatorio del repo)

**`services/shifts.service.ts`** (nuevo):
- Tipos: `Shift`, `ShiftSummary` (totales por método, esperado, contado, diferencia), `CurrentShift` (turno + acumulados).
- `fetchCurrentShift()` → rpc `current_shift`.
- `openShift(openingCash)` → rpc `open_shift`.
- `closeShift(closingCash, notes?, shiftId?)` → rpc `close_shift`.
- `fetchShifts()` → historial del tenant, orden descendente por apertura. El nombre del empleado se resuelve cruzando `worker_id` con la lista de `useWorkerStore.workers`.

**`stores/shifts.store.ts`** (nuevo):
- Estado: `currentShift`, `loading`, `submitting`, `shifts` (historial), `error`.
- Acciones: `fetchCurrentShift`, `openShift` (boolean), `closeShift` (devuelve `ShiftSummary` o null), `fetchShifts`.

## 3. POS: bloqueo y ciclo del turno

- Si `profile.isWorker`: `fetchCurrentShift()` al montar.
- **`components/shift/OpenShiftModal.tsx`**: overlay **bloqueante** (sin cerrar) cuando el empleado no tiene turno abierto. Campo "Base de caja" + botón "Abrir turno". Éxito → toast y el POS queda usable.
- **Indicador + cierre**: chip "Turno abierto desde HH:mm" y botón "Cerrar turno" en el header del POS (solo empleados con turno).
- **`components/shift/CloseShiftModal.tsx`**: resumen en vivo (nº de ventas, total, desglose por método, efectivo esperado) + input "Efectivo contado" y notas → al confirmar muestra la **diferencia** (color según signo) y finaliza.
- Defensa en profundidad: `create_sale` rechaza cobros de empleados sin turno aunque la UI falle.

## 4. Historial para el dueño (Ajustes → Trabajadores)

Sección **"Historial de turnos"** debajo de la lista de trabajadores:
- Tabla: Empleado · Apertura · Cierre · Ventas (nº y total) · Base · Esperado · Contado · **Diferencia** (color según signo) · Estado.
- Turnos abiertos: badge "Abierto" y botón "Cerrar" (dueño) → reutiliza `CloseShiftModal` con `shiftId`.

## Archivos

| Acción | Archivo |
|---|---|
| Nueva migración | `supabase/migrations/…_create_shifts.sql` |
| Actualizar tipos | `utils/supabase/database.types.ts` |
| Nuevo servicio | `services/shifts.service.ts` |
| Nuevo store | `stores/shifts.store.ts` |
| Nuevos componentes | `components/shift/OpenShiftModal.tsx`, `components/shift/CloseShiftModal.tsx` |
| Editar | `app/dashboard/pos/page.tsx` (gate + chip + modales) |
| Editar | `app/dashboard/settings/trabajadores/page.tsx` (historial + cierre por dueño) |

## Verificación

1. `npx tsc --noEmit`, ESLint de archivos tocados y `npm run build` (exit 0).
2. Script E2E con cliente **anónimo** (simula al empleado real):
   - login de empleado → `current_shift()` = null → `create_sale` **rechaza** ("Debes abrir turno").
   - `open_shift(50000)` → `create_sale` (efectivo) OK → la venta queda con `shift_id` y `user_id = dueño`.
   - `current_shift()` refleja la venta y el total.
   - `close_shift(contado)` → `expected_cash` y `difference` correctos; segundo `close_shift` falla.
   - Doble `open_shift` → rechazado.
   - RLS: el dueño ve los turnos; un empleado de otro tenant no.
3. Manual: entrar como empleado → modal bloqueante → abrir turno → cobrar → cerrar turno y revisar arqueo; como dueño revisar el historial.

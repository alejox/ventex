# Gestión de turnos (caja)

## Contexto

Los empleados inician sesión como cualquier usuario (correo + contraseña o Google; su cuenta nace al aceptar la invitación) y trabajan en `/dashboard/pos`. Al ingresar, el empleado **abre turno declarando la base de caja** (efectivo inicial), **solo necesita turno para cobrar si el administrador activa «Exigir turno activo para facturar»**, y al **cerrar turno** ve el arqueo: ventas del turno por método de pago, efectivo esperado vs contado y la diferencia. El dueño y los administradores no necesitan turno, pero pueden trabajar con su propia caja si activan «Abrir caja como administrador» (ver §5); el historial de turnos del equipo está en Equipo → Personal. Las horas de apertura/cierre quedan registradas de paso (asistencia implícita).

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
- Índice único parcial: **un solo turno abierto por membresía** → `shifts_one_open_per_workspace_membership` = `unique (user_id, membership_id) where status='open'` (hoy la tabla lleva `membership_id`; las RPC buscan el turno por `get_active_membership_id()`).

**RLS**: lectura para el tenant (`user_id = get_effective_user_id()`); insert solo del propio turno (`worker_id = auth.uid()`); update del propio turno o por el dueño (`user_id = auth.uid()`).

**Columna en ventas**: `alter table sales add column shift_id uuid null references shifts(id) on delete set null`.

**Funciones (RPC, security invoker sobre RLS, atómicas):**
- `open_shift(p_opening_cash numeric) returns json` — exige membresía activa y `worker_can('pos')` (el dueño y los administradores pasan; **no rechaza al dueño**), que esa membresía no tenga turno abierto (el índice único respalda), inserta y devuelve el turno.
- `current_shift() returns json` — turno abierto del caller (`worker_id = auth.uid()`) + acumulados en vivo: `count`, `sum(total)`, sumas por `payment_method` y efectivo esperado. Devuelve `null` si no hay.
- `close_shift(p_closing_cash numeric, p_notes text default null, p_shift_id uuid default null) returns json` — cierra el turno abierto del caller, o (si `p_shift_id` viene y el caller es el **dueño** del tenant) un turno olvidado de un empleado. Calcula: totales por método desde `sales`, `expected_cash = opening_cash + total efectivo`, `difference = closing_cash - expected_cash`; guarda snapshot y devuelve el resumen.

**Ajuste a `create_sale`** (misma migración):
- `v_uid := public.get_effective_user_id()` en lugar de `auth.uid()` (los lookups de productos/settings/clientes y la atribución de la venta pasan a ser del negocio; para el dueño no cambia nada).
- Sellado del turno del lado del servidor: si `settings.require_active_shift` está activo y el caller es empleado sin turno abierto → `raise exception 'Debes abrir turno antes de cobrar'`; si tiene, `sales.shift_id := turno`. Dueño/admin: nunca se les exige turno; si su membresía tiene uno abierto, la venta se sella con él (si no, `shift_id null`).

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
- Defensa en profundidad: cuando `settings.require_active_shift` está activo, `create_sale` rechaza cobros de empleados sin turno aunque la UI falle.

## 4. Historial para el dueño (Equipo → Personal)

Sección **"Historial de turnos"** debajo de la lista de trabajadores:
- Tabla: Persona (trabajador, administrador o el dueño) · Apertura · Cierre · Ventas (nº y total) · Base · Esperado · Contado · **Diferencia** (color según signo) · Estado.
- Turnos abiertos: badge "Abierto" y botón "Cerrar" (dueño) → reutiliza `CloseShiftModal` con `shiftId`.

## 5. Caja del dueño/administrador (`settings.owner_uses_shifts`)

- Ajuste **«Abrir caja como administrador»** en Configuración → General, apagado por defecto. Solo lo cambian el dueño y los administradores (`is_tenant_owner()`, trigger `settings_guard_owner_uses_shifts`).
- Encendido, el POS le muestra al dueño/admin la caja (Retiro / Cerrar caja) y, si entra sin caja abierta, el aviso **«Abre tu caja para empezar»** con «Abrir caja» e «Iniciar sin abrir caja». Saltarlo vale el resto del día LOCAL en ese dispositivo (localStorage, `lib/owner-shift-prompt.ts`); abrir una caja borra el salto, así que tras cerrarla vuelve a preguntar. Mientras vende sin caja ve un aviso discreto, nunca un bloqueo: `create_sale` no exige turno al dueño.
- El arqueo es por membresía: la caja del dueño solo cuenta lo suyo.
- **La plata no cae en la caja de otro** (`20261014100100`): con el ajuste encendido, un abono en efectivo del dueño/admin sin caja propia queda sin turno (no toma «el único turno abierto», que suele ser el de un trabajador). Una comisión pagada en efectivo sale primero de la caja de quien paga, después de la del que cobra, después del único turno abierto.

## Archivos

| Acción | Archivo |
|---|---|
| Nueva migración | `supabase/migrations/…_create_shifts.sql` |
| Actualizar tipos | `utils/supabase/database.types.ts` |
| Nuevo servicio | `services/shifts.service.ts` |
| Nuevo store | `stores/shifts.store.ts` |
| Nuevos componentes | `components/shift/OpenShiftModal.tsx`, `components/shift/CloseShiftModal.tsx` |
| Editar | `app/dashboard/pos/page.tsx` (gate + chip + modales) |
| Editar | `app/dashboard/staff/components/ShiftHistorySection.tsx` (historial + cierre por dueño; antes en Ajustes → Trabajadores) |

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

## Exigencia opcional de turno

En Configuración, el administrador del negocio puede activar **Exigir turno activo para facturar**.
`settings.require_active_shift` es `false` por defecto, también para negocios sin fila de ajustes.
El POS y el cobro de citas consultan este ajuste; `create_sale` lo valida en el servidor.
Un trigger impide que un empleado lo cambie aunque tenga permiso para editar otros ajustes.
La apertura y el cierre de caja siguen disponibles con la exigencia desactivada. Las ventas
sin turno conservan `shift_id = null` y no forman parte de un arqueo posterior. Los permisos
de POS y las validaciones de contexto de negocio, membresía y turno siguen vigentes.

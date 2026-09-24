-- Escuela de música: anular la venta que financió una matrícula la cierra en el
-- libro mayor sin borrar nada.
--
-- `school_enrollments.sale_id` ata la matrícula a su venta POS. Cuando esa
-- venta se anula (`void_sale`), la matrícula NO se borra (el comentario de la
-- fase U1 lo prometió: "la anulación la reconciliará el trigger de la fase U3")
-- y tampoco puede quedar 'active': el plan seguiría consumiendo créditos de una
-- compra que ya no existe. Este trigger reconcilia, con las mismas reglas que
-- `void_sale` y sin tocarla:
--
--  1. Las clases EXCLUSIVAS de esa matrícula (tienen participantes y TODAS las
--     participaciones son de ella) en 'scheduled'/'pending_close' se cancelan
--     con motivo legible. Las COMPARTIDAS no se tocan: la matrícula anulada
--     queda inerte y los demás alumnos siguen su clase sin que nadie se entere.
--  2. La matrícula pasa a 'voided'. El void revierte el 'assignment' con un
--     único movimiento 'void' por la suma total del libro mayor — no "resta lo
--     consumido" ni inventa el cero: el saldo se REconstruye desde el
--     histórico (mismo precedente que `recalc_haircut_counts`), y el histórico
--     no adivina. Si el saldo ya es cero no hay movimiento.
--  3. Los pedidos de reprogramación pendientes de la matrícula se cancelan.
--
-- Nada se borra: participaciones, asistencias, movimientos y pedidos quedan
-- como historia (los `on delete restrict` de movimientos/pedidos lo exigen).
-- `create_sale`/`void_sale` quedan INTACTOS: es un trigger aditivo en la misma
-- costura que `sales_release_credit_on_void` — la venta es la misma operación
-- crítica de siempre, y la escuela es su propia regla del negocio.

create or replace function public.school_reconcile_voided_sale()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_enr record;
  v_balance integer;
  v_reason text;
begin
  v_reason := 'Anulación de venta #' || new.sale_number::text;

  for v_enr in
    select enrollment.id
    from public.school_enrollments enrollment
    where enrollment.user_id = new.user_id
      and enrollment.sale_id = new.id
      and enrollment.status = 'active'
  loop
    -- 1) Clases exclusivas de esta matrícula (con participantes y TODOS de
    --    ella): se cancelan con motivo. Las compartidas quedan intactas.
    update public.school_lessons lesson
       set status = 'cancelled',
           cancel_reason = v_reason,
           cancelled_at = now()
     where lesson.user_id = new.user_id
       and lesson.status in ('scheduled', 'pending_close')
       and exists (
         select 1 from public.school_lesson_participants participant
         where participant.lesson_id = lesson.id
           and participant.user_id = new.user_id
       )
       and not exists (
         select 1 from public.school_lesson_participants stranger
         where stranger.lesson_id = lesson.id
           and stranger.user_id = new.user_id
           and stranger.enrollment_id <> v_enr.id
       );

    -- 2) Un 'void' por matrícula, solo si quedaba saldo: revierte el
    --    assignment completo (suma del libro mayor), no lo consumido.
    select coalesce(sum(movement.amount), 0) into v_balance
    from public.school_class_credit_movements movement
    where movement.enrollment_id = v_enr.id
      and movement.user_id = new.user_id;

    if v_balance <> 0 then
      insert into public.school_class_credit_movements (
        user_id, enrollment_id, kind, amount, reason, created_by
      )
      values (
        new.user_id, v_enr.id, 'void', -v_balance, v_reason, null
      );
    end if;

    -- 3) Pedidos de reprogramación pendientes: el plan se cayó con la venta.
    update public.school_reschedule_requests request
       set status = 'cancelled',
           decision_note = v_reason,
           decided_at = now()
     where request.user_id = new.user_id
       and request.enrollment_id = v_enr.id
       and request.status = 'pending';

    -- 4) La matrícula queda 'voided'; las filas nunca se borran.
    update public.school_enrollments enrollment
       set status = 'voided'
     where enrollment.user_id = new.user_id
       and enrollment.id = v_enr.id;
  end loop;

  return new;
end;
$$;

drop trigger if exists schools_reconcile_on_void on public.sales;
create trigger schools_reconcile_on_void
  after update of status on public.sales
  for each row
  when (old.status = 'completed' and new.status = 'void')
  execute function public.school_reconcile_voided_sale();
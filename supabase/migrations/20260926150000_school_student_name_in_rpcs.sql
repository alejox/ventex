-- Académico: el alumno tiene nombre propio (20260926140000). El enlace
-- familiar (`school_family_payload`, SECURITY DEFINER, ejecutable por anon)
-- todavía arma la respuesta con el nombre del CLIENTE (`v_cust.full_name`),
-- así que un alumno vinculado a la cuenta de un padre seguía mostrando el
-- nombre del padre en su propio enlace — el mismo bug que T8 corrige en la
-- app, pero del lado de este RPC. `v_cust` ya no hace falta: era la única
-- razón por la que se leía la fila de `customers`.

create or replace function public.school_family_payload(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hash   text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_link   public.school_access_links;
  v_student public.school_students;
  v_guards jsonb := '[]'::jsonb;
  v_next   jsonb;
  v_materials jsonb := '[]'::jsonb;
begin
  select * into v_link
  from public.school_access_links
  where token_hash = v_hash;
  if not found then
    raise exception 'LINK_INVALIDO' using errcode = '42501';
  end if;
  if v_link.purpose <> 'family_read' then
    raise exception 'LINK_INVALIDO' using errcode = '42501';
  end if;
  if v_link.revoked_at is not null then
    raise exception 'LINK_REVOCADO' using errcode = '42501';
  end if;
  if v_link.expires_at <= now() then
    raise exception 'LINK_VENCIDO' using errcode = '42501';
  end if;

  select * into v_student
  from public.school_students
  where id = v_link.student_id;
  if not found then
    raise exception 'LINK_INVALIDO' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'customer_id', g.customer_id,
      'relationship', g.relationship,
      'is_notice_receiver', g.is_notice_receiver
    ) order by g.created_at
  ), '[]'::jsonb) into v_guards
  from public.school_student_guardians g
  where g.student_id = v_student.id
    and g.user_id = v_link.user_id;

  -- Próxima clase del estudiante (vía sus matrículas participando).
  select jsonb_build_object(
    'lesson_id', l.id,
    'start_at', l.start_at,
    'end_at', l.end_at,
    'instrument', l.instrument,
    'room', l.room,
    'status', l.status
  )
  into v_next
  from public.school_lessons l
  join public.school_lesson_participants par on par.lesson_id = l.id
  where par.enrollment_id in (
    select e.id from public.school_enrollments e
    where e.user_id = v_link.user_id and e.student_id = v_student.id
  )
    and l.status in ('scheduled', 'pending_close')
    and l.end_at > now()
  order by l.start_at
  limit 1;

  -- Material dirigido a ESTE estudiante.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id, 'title', m.title, 'instructions', m.instructions,
      'kind', m.kind, 'created_at', m.created_at
    ) order by m.created_at desc
  ), '[]'::jsonb) into v_materials
  from public.school_materials m
  join public.school_material_recipients r on r.material_id = m.id
  where r.student_id = v_student.id
    and m.user_id = v_link.user_id;

  return jsonb_build_object(
    'student', jsonb_build_object(
      'id', v_student.id,
      'full_name', v_student.full_name,
      'instrument', v_student.instrument,
      'level', v_student.level,
      'status', v_student.status
    ),
    'guardians', v_guards,
    'next_lesson', v_next,
    'materials', v_materials
  );
end;
$fn$;

revoke all on function public.school_family_payload(text) from public, anon;
grant execute on function public.school_family_payload(text) to anon, authenticated, service_role;

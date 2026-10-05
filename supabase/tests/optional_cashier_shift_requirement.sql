-- Run manually in Supabase SQL editor. All fixture changes are rolled back.
begin;
do $$
declare
  member public.workspace_memberships%rowtype;
  service_id uuid;
  sale_id uuid;
  blocked boolean := false;
begin
  select * into member from public.workspace_memberships
  where status = 'active' and member_kind = 'member' and auth_user_id is not null limit 1;
  if not found then raise exception 'An active worker is required for this regression check'; end if;
  update public.workspace_memberships set permissions = permissions || '{"pos":true,"settings":true}'::jsonb where id = member.id;
  update public.shifts set status = 'closed' where membership_id = member.id and status = 'open';
  insert into public.services(user_id,name,price,duration_minutes,status)
  values(member.workspace_id,'Shift requirement regression fixture',100,30,'active') returning id into service_id;
  insert into public.settings(user_id,require_active_shift) values(member.workspace_id,false)
  on conflict(user_id) do update set require_active_shift = false;
  perform set_config('request.jwt.claims',json_build_object('sub',member.auth_user_id,'role','authenticated','session_id','shift-setting-regression')::text,true);
  insert into public.workspace_session_selections(session_id,auth_user_id,workspace_id,membership_id)
  values('shift-setting-regression',member.auth_user_id,member.workspace_id,member.id);

  sale_id := public.create_sale(p_customer_id=>null,p_payment_method=>'efectivo',
    p_discount_amount=>0,p_items=>jsonb_build_array(jsonb_build_object('service_id',service_id,'quantity',1)),
    p_expected_workspace_id=>member.workspace_id,p_expected_membership_id=>member.id,p_expected_shift_id=>null);
  if not exists(select 1 from public.sales where id=sale_id and shift_id is null and membership_id=member.id) then
    raise exception 'Disabled setting must allow a sale without a shift';
  end if;

  begin
    update public.settings set require_active_shift=true where user_id=member.workspace_id;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'A worker must not be able to change this setting'; end if;

  perform set_config('request.jwt.claims','{}',true);
  update public.settings set require_active_shift=true where user_id=member.workspace_id;
  perform set_config('request.jwt.claims',json_build_object('sub',member.auth_user_id,'role','authenticated','session_id','shift-setting-regression')::text,true);
  blocked := false;
  begin
    perform public.create_sale(p_customer_id=>null,p_payment_method=>'efectivo',
      p_discount_amount=>0,p_items=>jsonb_build_array(jsonb_build_object('service_id',service_id,'quantity',1)),
      p_expected_workspace_id=>member.workspace_id,p_expected_membership_id=>member.id,p_expected_shift_id=>null);
  exception when others then
    if sqlerrm <> 'Debes abrir turno antes de cobrar' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Enabled setting must reject a sale without a shift'; end if;

  perform public.open_shift(0);
  sale_id := public.create_sale(p_customer_id=>null,p_payment_method=>'efectivo',
    p_discount_amount=>0,p_items=>jsonb_build_array(jsonb_build_object('service_id',service_id,'quantity',1)),
    p_expected_workspace_id=>member.workspace_id,p_expected_membership_id=>member.id,
    p_expected_shift_id=>(public.current_shift()->>'id')::uuid);
  if sale_id is null then raise exception 'Enabled setting must allow a sale with a shift'; end if;
end;
$$;
rollback;


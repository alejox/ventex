-- Conserva la capacidad de dar descuentos a quienes ya tenían acceso al POS
-- antes de que existiera el permiso `pos_discount` (sin esto, la UI se lo
-- bloquea). Idempotente: no pisa un valor ya puesto.
update public.workspace_memberships
set permissions = permissions || '{"pos_discount": true}'::jsonb
where member_kind = 'member'
  and (permissions->>'pos') = 'true'
  and not (permissions ? 'pos_discount');

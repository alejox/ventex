-- El WITH CHECK de esta policy se evalúa sobre la fila NUEVA, donde
-- `business_type is null` ya es falso en cuanto el usuario completa el
-- onboarding (caso OAuth: handle_new_user inserta el perfil con business_type
-- NULL y ensure_owner_workspace no crea workspace todavía). El gate real de
-- "solo fila propia, en estado pre-onboarding o con tenant resuelto" lo hace
-- USING (fila vieja); WITH CHECK solo garantiza que el resultado sigue siendo
-- la fila del propio auth.uid(). La escalada de privilegios queda bloqueada
-- por guard_profile_privileges + los column grants (solo full_name,
-- business_type, modules, business_name, business_key).
drop policy if exists profiles_update_identity_or_selected_owner on public.profiles;

create policy profiles_update_identity_or_selected_owner on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    and (
      public.get_effective_user_id() is not null
      or business_type is null
    )
  )
  with check (
    id = auth.uid()
  );

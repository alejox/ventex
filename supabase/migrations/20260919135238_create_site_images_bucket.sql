-- Public images rendered by each tenant's landing page. Template-owned assets
-- remain in the application; this bucket only stores owner-uploaded content.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-images',
  'site-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets serve object URLs without a SELECT policy. This narrower
-- policy lets an owner list their own files and is also required for updates.
create policy "site_images_select_own" on storage.objects
  for select to authenticated
  using (
    public.is_tenant_owner()
    and bucket_id = 'site-images'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

create policy "site_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    public.is_tenant_owner()
    and bucket_id = 'site-images'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

create policy "site_images_update_own" on storage.objects
  for update to authenticated
  using (
    public.is_tenant_owner()
    and bucket_id = 'site-images'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  )
  with check (
    public.is_tenant_owner()
    and bucket_id = 'site-images'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

create policy "site_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    public.is_tenant_owner()
    and bucket_id = 'site-images'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

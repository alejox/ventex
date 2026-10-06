-- Tres diseños nuevos para salones y spa: luxia, lezar y zen.
-- Comparten el mismo LandingConfig y el flujo borrador/publicado; solo hay que
-- dejarlos pasar por los CHECK de `template`.
alter table public.business_sites
  drop constraint business_sites_draft_config_valid,
  add constraint business_sites_draft_config_valid check (
    jsonb_typeof(draft_config) = 'object'
    and draft_config @> '{"version": 1}'::jsonb
    and coalesce(
      draft_config ->> 'template' in (
        'rasm', 'fallspa', 'qutter',
        'barberia', 'barberia-artesanal', 'barberia-urbana',
        'luxia', 'lezar', 'zen'
      ),
      false
    )
  ),
  drop constraint business_sites_published_config_valid,
  add constraint business_sites_published_config_valid check (
    published_config is null
    or (
      jsonb_typeof(published_config) = 'object'
      and published_config @> '{"version": 1}'::jsonb
      and coalesce(
        published_config ->> 'template' in (
          'rasm', 'fallspa', 'qutter',
          'barberia', 'barberia-artesanal', 'barberia-urbana',
          'luxia', 'lezar', 'zen'
        ),
        false
      )
    )
  );

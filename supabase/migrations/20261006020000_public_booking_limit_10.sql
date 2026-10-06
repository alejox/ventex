-- Tope de reservas públicas por teléfono: de 3 a 10 en 24 horas.
--
-- `public_site_book` rechaza ("Ya tenés varias reservas pendientes...") cuando el
-- mismo teléfono ya creó 3 citas no canceladas en el negocio en las últimas 24 h.
-- Con 3 se bloqueaba a quien reserva corte + barba + manicure seguidos o agenda a
-- varias personas con un solo número. Sigue siendo un freno contra abuso.
--
-- Se parchea esa única condición sobre la definición viva y se aborta si no se
-- encuentra, en vez de copiar la función entera.
do $$
declare
  fn record;
  patched integer := 0;
  src text;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'public_site_book'
  loop
    src := pg_get_functiondef(fn.oid);
    if position('if v_recent >= 3 then' in src) > 0 then
      execute replace(src, 'if v_recent >= 3 then', 'if v_recent >= 10 then');
      patched := patched + 1;
    elsif position('if v_recent >= 10 then' in src) > 0 then
      patched := patched + 1; -- ya parcheada
    end if;
  end loop;

  if patched = 0 then
    raise exception 'public_site_book: no se encontró el chequeo de v_recent para parchear';
  end if;
end;
$$;

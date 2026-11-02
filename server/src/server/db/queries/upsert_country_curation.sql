insert into public.countries (code, default_language, catalog_enabled) values (%s, %s, %s)
on conflict (code) do update
set default_language = excluded.default_language, catalog_enabled = excluded.catalog_enabled
where (public.countries.default_language, public.countries.catalog_enabled)
  is distinct from (excluded.default_language, excluded.catalog_enabled)

-- M11.11: api.catalog_countries, the countries that have a catalog (countries.catalog_enabled).
-- The country choice in Settings and in "Not in your country yet" lists them; the app has no
-- other way to know. Names are drawn by the phone (Intl), so the view holds the code only.
-- Phones read the table through the view (security invoker): select and a read-all policy, no writes.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create view api.catalog_countries with (security_invoker = true) as
  select c.code, c.default_language
  from public.countries c
  where c.catalog_enabled;

grant select on public.countries to authenticated;
create policy read_all on public.countries for select to authenticated using (true);
grant select on api.catalog_countries to authenticated;

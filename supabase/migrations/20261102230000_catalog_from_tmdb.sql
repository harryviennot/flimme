-- squawk-ignore-file prefer-robust-stmts, prefer-bigint-over-int, ban-drop-not-null, ban-char-field, ban-drop-constraint
-- Why: Supabase runs each migration in one transaction, so a failure rolls it all
-- back (prefer-robust-stmts). parent_id matches providers.id, an integer from TMDB.
-- original_title loses not null on purpose (a cleared film, Q22), and nothing
-- written today is null. inferred_from is char(2) like every country column. The
-- old ingest_runs kind check is replaced by the new one in the same file.

-- M2.4: the catalog columns from tmdb.md#changes-to-the-data-model, and free
-- services counting for rooms (decisions.md: free services count for every room
-- unless the host turns them off). Variants, the picker list, free services,
-- the new refresh tiers and run kinds, and the server's right to edit countries.
--
-- Replaced whole from main's latest version: internal.refresh_room_providers
-- (baseline, nothing replaced it since) and the view api.country_providers
-- (baseline). The view keeps its columns, so there is no typegen.

-- set local: the timeouts end with this file's transaction instead of applying
-- to every later migration on the same connection.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A variant points at its main service ("Netflix basic with ads" at Netflix).
alter table public.providers add column parent_id integer;
alter table public.providers
  add constraint providers_parent_fk foreign key (parent_id) references public.providers (id) not valid;
alter table public.providers validate constraint providers_parent_fk;
alter table public.providers
  add constraint providers_parent_not_self check (parent_id <> id) not valid;
alter table public.providers validate constraint providers_parent_not_self;

-- is_listed: shown in that country's picker. free_for_all: only free or
-- ad-supported offers, counts for every room in the country.
alter table public.provider_regions
  add column is_listed boolean not null default false,
  add column free_for_all boolean not null default false;

-- The host can turn the country's free services off (the switch itself is M4.4).
alter table public.rooms add column include_free_services boolean not null default true;

-- Set when TMDB stops listing a film; the film is cleared, not deleted.
alter table public.titles add column tmdb_missing_since timestamptz;
-- A cleared film drops its title too.
alter table public.titles alter column original_title drop not null;
comment on column public.titles.refresh_tier is
  '1 = available in an enabled country (weekly fetch), 2 = the rest (monthly fetch)';

-- The country whose certification was used, null when it is the country's own.
alter table public.title_certifications add column inferred_from char(2);
alter table public.title_certifications
  add constraint title_certifications_inferred_from_format check (inferred_from ~ '^[A-Z]{2}$') not valid;
alter table public.title_certifications validate constraint title_certifications_inferred_from_format;

-- The run kinds the pipeline writes, and the counters M9.5 reads.
alter table public.ingest_runs drop constraint ingest_runs_kind_check;
alter table public.ingest_runs
  add constraint ingest_runs_kind_check check (kind in (
    'backfill', 'availability_sweep', 'popularity_daily', 'changes_daily',
    'details_weekly', 'details_monthly', 'reference_weekly', 'embeddings', 'moods'
  )) not valid;
alter table public.ingest_runs validate constraint ingest_runs_kind_check;
alter table public.ingest_runs add column stats jsonb not null default '{}';

-- The reference job enables countries and sets their language.
grant insert, update on public.countries to app_server;

-- The seats' services (union or intersection), plus the country's free services
-- while the host keeps them on. Distinct and sorted.
create or replace function internal.refresh_room_providers(p_room_id uuid) returns void
language sql security definer set search_path = ''
as $$
  with active as (
    select m.provider_ids from public.room_members m
    where m.room_id = p_room_id and m.left_at is null
  ),
  counts as (
    select p as provider_id, count(*) as n from active, unnest(active.provider_ids) p group by p
  ),
  chosen as (
    select c.provider_id
    from counts c, public.rooms r
    where r.id = p_room_id
      and (r.service_rule = 'any_member' or c.n = (select count(*) from active))
  ),
  free as (
    select pr.provider_id
    from public.provider_regions pr, public.rooms r
    where r.id = p_room_id and r.include_free_services
      and pr.country = r.country and pr.free_for_all
  )
  update public.rooms r
  set provider_ids = coalesce((
    select array_agg(x.provider_id order by x.provider_id)
    from (select provider_id from chosen union select provider_id from free) x
  ), '{}')
  where r.id = p_room_id
$$;

-- The picker lists the services curated for the country only.
create or replace view api.country_providers with (security_invoker = true) as
  select pr.country, p.id as provider_id, p.name, p.logo_path, pr.display_priority
  from public.provider_regions pr join public.providers p on p.id = pr.provider_id
  where pr.is_listed;

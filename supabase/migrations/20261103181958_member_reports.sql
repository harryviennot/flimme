-- squawk-ignore-file prefer-robust-stmts, require-concurrent-index-creation
-- M7.1: api.report_member stores a report on another player (store-listing.md#passing-review,
-- guideline 1.2). Any unremoved seat may report any other seat of its room, once per pair,
-- 10 an hour per profile. The reason is one of three presets, never free text, and the table
-- keeps ids only (no copy of the name: Harry reads display_name through the service role).
-- Nothing automatic happens, nothing is broadcast, and only the reporter gets an answer.
-- The alert to Harry is M9.5's (alerted_at is null until then); retention is M8.9's.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create type public.report_reason as enum ('offensive_name', 'spam', 'other');

-- Seats are anonymous once an account is deleted (room_members.profile_id is set null), so a
-- report outlives its reporter's account. Rows go with their room, as the seats do.
create table public.member_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  reporter_member_id uuid not null references public.room_members on delete cascade,
  reported_member_id uuid not null references public.room_members on delete cascade,
  reason public.report_reason not null,
  created_at timestamptz not null default now(),
  alerted_at timestamptz,                          -- set by M9.5's health check once Harry is told
  unique (reporter_member_id, reported_member_id),
  check (reporter_member_id <> reported_member_id)
);
create index member_reports_created_at_idx on public.member_reports (created_at);
create index member_reports_unalerted_idx on public.member_reports (created_at) where alerted_at is null;

-- Phones never read or write it: no policy, no grant.
alter table public.member_reports enable row level security;
revoke all on table public.member_reports from public, anon, authenticated;

create function api.report_member(p_room_id uuid, p_member_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile_id uuid := internal.my_profile_id();
  v_me uuid;
begin
  if v_profile_id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  -- Bad input raises before any limit counts.
  if p_room_id is null or p_member_id is null or p_reason is null then
    raise exception 'room, member and reason are required' using errcode = '22023';
  end if;
  if p_reason <> all (enum_range(null::public.report_reason)::text[]) then
    raise exception 'unknown reason' using errcode = '22023';
  end if;
  if exists (select 1 from public.room_members m where m.id = p_member_id and m.profile_id = v_profile_id) then
    raise exception 'you cannot report your own seat' using errcode = '22023';
  end if;

  if not internal.rate_limit('report:p:' || v_profile_id, 10, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select m.id into v_me from public.room_members m
  where m.room_id = p_room_id and m.profile_id = v_profile_id and m.removed_at is null;
  if v_me is null
     or not exists (select 1 from public.room_members t where t.id = p_member_id and t.room_id = p_room_id) then
    return jsonb_build_object('status', 'not_in_room');
  end if;

  insert into public.member_reports (room_id, reporter_member_id, reported_member_id, reason)
  values (p_room_id, v_me, p_member_id, p_reason::public.report_reason)
  on conflict (reporter_member_id, reported_member_id) do nothing;

  return jsonb_build_object('status', 'ok');
end
$$;

revoke execute on function api.report_member(uuid, uuid, text) from public, anon;
grant execute on function api.report_member(uuid, uuid, text) to authenticated;

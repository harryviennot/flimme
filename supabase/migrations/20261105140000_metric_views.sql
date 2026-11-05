-- M9.3: the five headline metrics as plain views in a new schema, analytics (analytics.md#every-metric).
-- Aggregates only: counts, rates and percentiles by UTC day (week for the two player metrics),
-- country, mode and group size, with no profile, seat or room id, name, code or title in any column.
-- The schema belongs to postgres and nobody else has a grant on it (no usage, no select), and it is
-- not in the Data API's schemas. M14.1 adds the nightly refresh and the read-only role.
-- Seats of deleted accounts (profile_id null) count in the room views and never in the player views.
-- A seat's first swipe is its earliest swipe_log vote, so a vote that was undone still counts.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema analytics;
revoke all on schema analytics from public;

-- Group size from rooms.stats.players: '2', '3_4', '5_10', and 'unknown' when it is missing or out of range.
create function analytics.group_size(p_players integer) returns text
language sql immutable
set search_path = ''
as $$
  select case when p_players = 2 then '2'
              when p_players between 3 and 4 then '3_4'
              when p_players between 5 and 10 then '5_10'
              else 'unknown' end
$$;
revoke all on function analytics.group_size(integer) from public;

-- Median and 90th percentile of decided_at minus started_at, rooms with a pick.
create view analytics.time_to_pick as
select (r.started_at at time zone 'UTC')::date as day,
       r.country::text as country,
       r.mode,
       analytics.group_size((r.stats->>'players')::integer) as group_size,
       count(*) as rooms,
       percentile_cont(0.5) within group (order by extract(epoch from r.decided_at - r.started_at)) as median_seconds,
       percentile_cont(0.9) within group (order by extract(epoch from r.decided_at - r.started_at)) as p90_seconds
from public.rooms r
where r.started_at is not null
  and r.decided_at is not null
  and r.stats->>'outcome' in ('match', 'finale')
group by 1, 2, 3, 4;
comment on view analytics.time_to_pick is
  'M9.3. Rooms with a pick (outcome match or finale), by UTC day of started_at, country, mode and group_size (2, 3_4, 5_10, unknown). rooms; median_seconds and p90_seconds of decided_at minus started_at. Target for 2 to 4 players: median under 300, p90 under 420.';

-- How started rooms ended. Started rooms without stats yet are pending and left out of the shares.
create view analytics.room_outcomes as
select (r.started_at at time zone 'UTC')::date as day,
       r.country::text as country,
       r.mode,
       analytics.group_size((r.stats->>'players')::integer) as group_size,
       count(*) as started,
       count(*) filter (where r.stats is null) as pending,
       count(*) filter (where r.stats->>'outcome' = 'match') as match,
       count(*) filter (where r.stats->>'outcome' = 'finale') as finale,
       count(*) filter (where r.stats->>'outcome' = 'no_pick') as no_pick,
       count(*) filter (where r.stats->>'outcome' = 'abandoned') as abandoned,
       count(*) filter (where r.stats->>'outcome' in ('match', 'finale')
                          and r.decided_at - r.started_at < interval '5 minutes') as picks_within_5_min,
       (count(*) filter (where r.stats->>'outcome' in ('match', 'finale')))::numeric
         / nullif(count(*) filter (where r.stats is not null), 0) as pick_share,
       (count(*) filter (where r.stats->>'outcome' = 'no_pick'))::numeric
         / nullif(count(*) filter (where r.stats is not null), 0) as no_pick_share,
       (count(*) filter (where r.stats->>'outcome' = 'abandoned'))::numeric
         / nullif(count(*) filter (where r.stats is not null), 0) as abandoned_share,
       (count(*) filter (where r.stats->>'outcome' in ('match', 'finale')
                           and r.decided_at - r.started_at < interval '5 minutes'))::numeric
         / nullif(count(*) filter (where r.stats is not null), 0) as pick_within_5_min_share,
       (count(*) filter (where r.stats->>'outcome' = 'match'))::numeric
         / nullif(count(*) filter (where r.stats->>'outcome' in ('match', 'finale')), 0) as instant_match_share
from public.rooms r
where r.started_at is not null
group by 1, 2, 3, 4;
comment on view analytics.room_outcomes is
  'M9.3. Started rooms by UTC day of started_at, country, mode and group_size. started = pending (no stats yet) + match + finale + no_pick + abandoned. Shares are over settled rooms (started minus pending): pick_share (match or finale), no_pick_share, abandoned_share, pick_within_5_min_share (picks under 5 minutes after started_at). instant_match_share is matches out of picks. picks_within_5_min is the count behind it.';

-- Each profile's first seat in a started room, and that seat's first vote.
create view analytics.onboarding_time as
with first_seat as (
  select distinct on (m.profile_id) m.profile_id, m.id as seat_id, m.role, m.joined_via
  from public.room_members m
  join public.rooms r on r.id = m.room_id and r.started_at is not null
  where m.profile_id is not null
  order by m.profile_id, m.joined_at, m.id
),
first_vote as (
  select s.profile_id,
         case when s.role = 'host' then 'host'
              when s.role = 'guest' and s.joined_via = 'link' then 'guest_link'
              when s.role = 'guest' and s.joined_via in ('code', 'qr') then 'guest_code' end as entry,
         (select min(l.created_at) from public.swipe_log l where l.room_member_id = s.seat_id and l.action = 'vote') as voted_at
  from first_seat s
)
select (date_trunc('week', p.created_at at time zone 'UTC'))::date as week,
       coalesce(p.country::text, 'unknown') as country,
       f.entry,
       count(*) as players,
       percentile_cont(0.5) within group (order by extract(epoch from f.voted_at - p.created_at)) as median_seconds
from first_vote f
join public.profiles p on p.id = f.profile_id
where f.entry is not null and f.voted_at is not null and p.managed_by is null
group by 1, 2, 3;
comment on view analytics.onboarding_time is
  'M9.3. New players (profiles, not managed seats) by UTC week of profiles.created_at, profile country (unknown if unset) and entry: host, guest_link (joined by link) or guest_code (code or qr), from the first seat in a started room. players; median_seconds of the first vote minus profiles.created_at. Target for guests: 60 seconds (placeholder).';

-- Link seats only: the first vote minus the tap on the invite link.
create view analytics.link_to_first_swipe as
select (m.link_opened_at at time zone 'UTC')::date as day,
       r.country::text as country,
       r.mode,
       analytics.group_size((r.stats->>'players')::integer) as group_size,
       count(*) as seats,
       percentile_cont(0.5) within group (order by extract(epoch from v.voted_at - m.link_opened_at)) as median_seconds
from public.room_members m
join public.rooms r on r.id = m.room_id
cross join lateral (
  select min(l.created_at) as voted_at
  from public.swipe_log l where l.room_member_id = m.id and l.action = 'vote'
) v
where m.joined_via = 'link' and m.link_opened_at is not null and m.profile_id is not null and v.voted_at is not null
group by 1, 2, 3, 4;
comment on view analytics.link_to_first_swipe is
  'M9.3. Seats that joined by link and swiped, by UTC day of link_opened_at, country, mode and group_size. seats; median_seconds of the first vote minus link_opened_at. Target: 35 seconds.';

-- New players (first seat in a started room that week) who play another started room within 14 days.
create view analytics.second_game as
with first_seat as (
  select distinct on (m.profile_id) m.profile_id, m.room_id, m.joined_at, r.started_at
  from public.room_members m
  join public.rooms r on r.id = m.room_id and r.started_at is not null
  where m.profile_id is not null
  order by m.profile_id, m.joined_at, m.id
),
cohort as (
  select f.*,
         exists (
           select 1
           from public.room_members m2
           join public.rooms r2 on r2.id = m2.room_id and r2.started_at is not null
           where m2.profile_id = f.profile_id
             and m2.room_id <> f.room_id
             and r2.started_at > f.started_at
             and r2.started_at <= f.joined_at + interval '14 days'
         ) as returned
  from first_seat f
)
select (date_trunc('week', c.joined_at at time zone 'UTC'))::date as cohort_week,
       count(*) as new_players,
       count(*) filter (where c.returned) as returned,
       (count(*) filter (where c.returned))::numeric / count(*) as share,
       (date_trunc('week', c.joined_at at time zone 'UTC') + interval '21 days' < now() at time zone 'UTC') as is_complete
from cohort c
group by date_trunc('week', c.joined_at at time zone 'UTC');
comment on view analytics.second_game is
  'M9.3. One row per UTC week of the first seat in a started room: new_players, returned (played another started room within 14 days of that seat), share, and is_complete (the week ended more than 14 days ago, so the share is final).';

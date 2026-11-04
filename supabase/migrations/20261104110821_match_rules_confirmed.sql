-- M6.1: the confirmed match_rules values and a fixed re-check order
-- (decisions.md rows 12 and 13, game-modes.md#time-to-a-pick, game-modes.md#when-its-a-match).
-- A 6-minute limit on every rule, 40 or 30 cards, 3 finalists for 2 players and 4 otherwise.
-- Only the table changes: rooms.rule is frozen at begin_swiping, so a room already swiping
-- keeps the rule it started with. Replaces internal.recheck_room_matches
-- (20261103173711_remove_member.sql) whole, with a total order.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

update public.match_rules
set finale_after_cards = 40, finale_after_seconds = 360, finale_size = 3
where mode = 'quick_match' and min_players = 2 and max_players = 2;

update public.match_rules
set finale_after_cards = 40, finale_after_seconds = 360, finale_size = 4
where mode = 'quick_match' and min_players = 3 and max_players = 4;

update public.match_rules
set finale_after_cards = 30, finale_after_seconds = 360, finale_size = 4
where mode = 'quick_match' and min_players = 5 and max_players = 10;

update public.match_rules
set finale_after_seconds = 360
where mode = 'date_night' and min_players = 2 and max_players = 2;

-- Final Cut: the 2 to 4 row splits into 2 and 3 to 4, so 2 players get 3 finalists.
update public.match_rules
set min_players = 3, finale_after_seconds = 360
where mode = 'final_cut' and min_players = 2 and max_players = 4;

insert into public.match_rules
  (mode, min_players, max_players, instant_rule, share_threshold, finale_kind, finale_after_cards, finale_after_seconds, finale_size)
values
  ('final_cut', 2, 2, 'all_like', null, 'final_cut', 30, 360, 3);

update public.match_rules
set finale_after_seconds = 360
where mode = 'final_cut' and min_players = 5 and max_players = 10;

-- If everyone still here liked a card, that's a match now (data-model.md#leaving-and-coming-back).
-- Active cards with likes, in a fixed order, until one decides: most likes (super likes count),
-- then most super likes, then the higher group score, then the lowest film id. Callers hold
-- the room lock and have already set the seat's left_at.
create or replace function internal.recheck_room_matches(p_room_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_title bigint;
  v_check jsonb;
begin
  for v_title in
    select c.title_id from public.room_cards c
    where c.room_id = p_room_id and c.state = 'active' and c.like_count + c.super_like_count > 0
    order by c.like_count + c.super_like_count desc,
             c.super_like_count desc,
             c.group_score desc,
             c.title_id asc
  loop
    v_check := internal.check_card_match(p_room_id, v_title);
    exit when (v_check->>'decided') = 'true';
  end loop;
end
$$;

revoke all on function internal.recheck_room_matches(uuid) from public, anon, authenticated;

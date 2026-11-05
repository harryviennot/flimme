-- M8.6: api.export_my_data matches the first release (privacy.md#players-rights-in-practice).
-- Replaces the version in 20261102212521_rate_limit_helper.sql. Every key it had stays; each game
-- gains the caller's own seat (name, how it joined, services), votes with titles, swipes, ballots,
-- the room's pick and the after-game answers. Only seats the caller owns (profile_id), never seats
-- they only control. Reports, other seats and the deck's own data (scores, sources) stay out.
-- Same signature and answers, so no _v2.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- GDPR export, 1 per profile per hour. Volatile: it counts, and PostgREST runs
-- stable functions read-only. The data comes with status ok (a compatible addition).
create or replace function api.export_my_data() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if internal.my_profile_id() is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if not internal.rate_limit('export:p:' || internal.my_profile_id(), 1, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  return (
  with me as (select internal.my_profile_id() as id)
    select jsonb_build_object('status', 'ok') || jsonb_build_object(
      'profile', (select to_jsonb(p) - 'auth_user_id' from public.profiles p, me where p.id = me.id),
      'services', (select coalesce(jsonb_agg(pp.provider_id), '[]') from public.profile_providers pp, me where pp.profile_id = me.id),
      'consents', (select coalesce(jsonb_agg(to_jsonb(c) - 'profile_id'), '[]') from public.consents c, me where c.profile_id = me.id),
      'linked_accounts', (
        select coalesce(jsonb_agg(jsonb_build_object('provider', la.provider, 'username', la.username,
                                                     'created_at', la.created_at, 'exported_at', la.exported_at,
                                                     'last_synced_at', la.last_synced_at)), '[]')
        from public.linked_accounts la, me where la.profile_id = me.id),
      'letterboxd_diary', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'film', e.film_name, 'year', e.film_year, 'watched_on', e.watched_on, 'rating', e.rating,
                 'rewatch', e.rewatch, 'source', e.source) order by e.watched_on), '[]')
        from public.letterboxd_entries e join public.linked_accounts la on la.id = e.linked_account_id, me
        where la.profile_id = me.id),
      'film_history', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'tmdb_id', t.tmdb_id, 'title', t.original_title, 'source', ut.source, 'seen', ut.seen,
                 'rating', ut.rating, 'on_watchlist', ut.on_watchlist,
                 'reaction', ut.reaction, 'last_watched_on', ut.last_watched_on)), '[]')
        from public.user_titles ut join public.titles t on t.id = ut.title_id, me
        where ut.profile_id = me.id),
      'taste', (select tp.affinities from public.taste_profiles tp, me where tp.profile_id = me.id),
      'games', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'room_id', m.room_id, 'joined_at', m.joined_at, 'left_at', m.left_at,
                 'display_name', m.display_name, 'avatar_key', m.avatar_key, 'role', m.role,
                 'joined_via', m.joined_via, 'services', to_jsonb(m.provider_ids),
                 'votes', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'tmdb_id', t.tmdb_id, 'title', t.original_title, 'answer', v.answer,
                                  'at', v.created_at) order by v.created_at, t.tmdb_id), '[]')
                           from public.votes v join public.titles t on t.id = v.title_id
                           where v.room_member_id = m.id),
                 'swipes', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'tmdb_id', t.tmdb_id, 'action', s.action, 'answer', s.answer,
                                   'at', s.created_at, 'dwell_ms', s.dwell_ms) order by s.created_at, s.id), '[]')
                            from public.swipe_log s join public.titles t on t.id = s.title_id
                            where s.room_member_id = m.id),
                 'ballots', (select coalesce(jsonb_agg(jsonb_build_object(
                                    'tmdb_id', t.tmdb_id, 'kind', b.kind, 'rank', b.rank,
                                    'at', b.created_at) order by b.created_at, b.id), '[]')
                             from public.round_ballots b left join public.titles t on t.id = b.title_id
                             where b.room_member_id = m.id),
                 'pick', (select jsonb_build_object('tmdb_id', t.tmdb_id, 'title', t.original_title, 'kind', mt.kind)
                          from public.matches mt join public.titles t on t.id = mt.title_id
                          where mt.room_id = m.room_id and mt.pick_order = 1),
                 'watched_answer', m.watched_answer,
                 'post_reaction', m.post_reaction) order by m.joined_at, m.id), '[]')
        from public.room_members m, me where m.profile_id = me.id)
    )
  );
end
$$;

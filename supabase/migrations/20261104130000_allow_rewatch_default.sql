-- M6.28: Quick Match and Final Cut rooms default to allow_rewatch (decisions.md row 30,
-- moments.md#the-swipe). Date Night keeps hide_seen. Data only: api.create_room already
-- reads game_modes.defaults->>'seen_rule' before its hide_seen fallback. Rooms that exist keep their rule.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

update public.game_modes
set defaults = defaults || '{"seen_rule": "allow_rewatch"}'
where slug in ('quick_match', 'final_cut');

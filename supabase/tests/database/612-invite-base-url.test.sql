-- M4.18: the invite domain. Invite links are https://flimme.com/join/<code>?r=<room id>, so a data
-- migration sets invite_base_url in app_config, the same value on staging and production (Q18.3).
-- The app builds the link from it (decisions.md, M4.12 Q12.1).

begin;
select plan(2);

select tests.create_player('guest1');
select tests.authenticate_as('guest1');

select is(
  (select value from api.app_config where key = 'invite_base_url'),
  '"https://flimme.com"'::jsonb,
  'T1 a guest reads invite_base_url as "https://flimme.com"');
select is(
  (select count(*) from api.app_config where key = 'invite_base_url'), 1::bigint,
  'T2 invite_base_url is one row');

select * from finish();
rollback;

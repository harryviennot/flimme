-- M4.3: names are saved clean and avatars are presets only (security.md#keeping-kids-safe-on-screen,
-- gap 4). T1 to T21 follow the brief's numbered tests. The blocklist answer is name_not_allowed.

begin;
select plan(80);

select tests.create_player('namer');

-- Acts as the player, saves a name and answers "status|name now stored".
create function pg_temp.save(p_who text, p_name text) returns text
language plpgsql as $$
declare
  v_status text;
begin
  perform tests.authenticate_as(p_who);
  v_status := api.update_profile(p_name)->>'status';
  return v_status || '|' || (select display_name from api.my_profile);
end
$$;
grant execute on function pg_temp.save(text, text) to public;

-- T1: a plain name is saved and the answer carries what was saved.
select tests.authenticate_as('namer');
select is((select api.update_profile('Sam')), jsonb_build_object('status', 'ok', 'display_name', 'Sam', 'avatar_key', 'default'),
  'T1 a plain name answers ok with the saved name and avatar');
select is((select display_name from api.my_profile), 'Sam', 'T1 the profile reads Sam');

-- T2: zero-width characters inside a name go.
select is(pg_temp.save('namer', 'Sa' || U&'\200B' || 'm'), 'ok|Sam', 'T2 a zero-width space inside the name is removed');
select is(pg_temp.save('namer', U&'\FEFF' || 'Sam' || U&'\200D'), 'ok|Sam', 'T2 a byte order mark and a joiner at the ends are removed');

-- T3: a name that ends up empty is refused and nothing changes.
select is(pg_temp.save('namer', U&'\200B\200D\FEFF'), 'invalid_name|Sam', 'T3 only zero-width characters answers invalid_name');
select is(pg_temp.save('namer', U&'\3164'), 'invalid_name|Sam', 'T3 the Hangul filler U+3164 answers invalid_name');
select is(pg_temp.save('namer', U&'\2800'), 'invalid_name|Sam', 'T3 the braille blank answers invalid_name');
select is(pg_temp.save('namer', E'  \t \n  '), 'invalid_name|Sam', 'T3 spaces and tabs answer invalid_name');
select is(pg_temp.save('namer', U&'\FFA0\115F\1160'), 'invalid_name|Sam', 'T3 the other blank-looking letters answer invalid_name');

-- T4: direction overrides and isolates go.
select is(pg_temp.save('namer', 'Sam' || U&'\202E' || 'live'), 'ok|Samlive', 'T4 a right-to-left override is removed');
select is(pg_temp.save('namer', 'Sa' || U&'\2066' || 'm' || U&'\2069'), 'ok|Sam', 'T4 isolates are removed');

-- T5: control characters.
select is(pg_temp.save('namer', E'Sa\nm'), 'ok|Sa m', 'T5 a newline becomes a space');
select is(pg_temp.save('namer', 'Sa' || U&'\0007' || 'm'), 'ok|Sam', 'T5 a bell character is removed');

-- T6: NFKC.
select is(pg_temp.save('namer', U&'\FF33\FF41\FF4D'), 'ok|Sam', 'T6 fullwidth letters become plain letters');
select is(pg_temp.save('namer', U&'\FB01' || 'ona'), 'ok|fiona', 'T6 the fi ligature is split');

-- T7: space runs collapse.
select is(pg_temp.save('namer', 'Jean    Luc'), 'ok|Jean Luc', 'T7 a run of spaces becomes one');
select is(pg_temp.save('namer', 'Jean' || U&'\00A0\2003' || 'Luc'), 'ok|Jean Luc', 'T7 non-breaking and wide spaces become one space');

-- T8: the 24 character limit applies after normalising.
select is(pg_temp.save('namer', repeat('a', 24)), 'ok|' || repeat('a', 24), 'T8 24 characters answer ok');
select is(pg_temp.save('namer', repeat('b', 25)), 'invalid_name|' || repeat('a', 24), 'T8 25 characters answer invalid_name');
select is(pg_temp.save('namer', repeat('c', 20) || repeat(U&'\200B', 10)), 'ok|' || repeat('c', 20),
  'T8 30 characters of which 10 are zero-width answer ok');

-- T9: real names are not touched.
select is(pg_temp.save('namer', U&'\00C9lodie'), 'ok|' || U&'\00C9lodie', 'T9 Élodie is saved unchanged');
select is(pg_temp.save('namer', 'Zo' || U&'\00EB'), 'ok|Zo' || U&'\00EB', 'T9 Zoë is saved unchanged');
select is(pg_temp.save('namer', 'Chlo' || U&'\00E9'), 'ok|Chlo' || U&'\00E9', 'T9 Chloé is saved unchanged');
select is(pg_temp.save('namer', U&'\0645\062D\0645\062F'), 'ok|' || U&'\0645\062D\0645\062F', 'T9 an Arabic name is saved unchanged');
select is(pg_temp.save('namer', U&'\7530\4E2D\592A\90CE'), 'ok|' || U&'\7530\4E2D\592A\90CE', 'T9 a Japanese name is saved unchanged');
select is(pg_temp.save('namer', 'Zoe' || U&'\0308'), 'ok|Zo' || U&'\00EB', 'T9 a letter and its mark are joined into one letter');

-- T10: stray combining marks.
select is(pg_temp.save('namer', 'Max' || repeat(U&'\0303', 5)), 'ok|Max' || U&'\0303', 'T10 five marks after a letter keep one');
select is(pg_temp.save('namer', U&'\0303' || 'Max'), 'ok|Max', 'T10 a name starting with a mark loses it');

-- T11: blocked words, as is, in capitals, with accents and with leet digits.
select is((select api.update_profile('slut')->>'status'), 'name_not_allowed', 'T11 an English entry answers name_not_allowed');
select is((select api.update_profile('SLUT')->>'status'), 'name_not_allowed', 'T11 in capitals');
select is((select api.update_profile('Sl' || U&'\00FC' || 't')->>'status'), 'name_not_allowed', 'T11 with an accent');
select is((select api.update_profile('$lu7')->>'status'), 'name_not_allowed', 'T11 with leet digits and a dollar sign');
select is((select api.update_profile('salope')->>'status'), 'name_not_allowed', 'T11 a French entry answers name_not_allowed');
select is((select api.update_profile('Encul' || U&'\00E9')->>'status'), 'name_not_allowed', 'T11 a French entry with an accent');
select is((select api.update_profile('S4L0P3')->>'status'), 'name_not_allowed', 'T11 a French entry with leet digits');
select is((select api.update_profile(U&'\FF33\FF4C\FF55\FF54')->>'status'), 'name_not_allowed', 'T11 a fullwidth entry is normalised first');

-- T12: separators and several words.
select is((select api.update_profile('s.l.u.t')->>'status'), 'name_not_allowed', 'T12 an entry spelled with dots');
select is((select api.update_profile('p u t a i n')->>'status'), 'name_not_allowed', 'T12 an entry spelled with spaces');
select is((select api.update_profile('Sam slut')->>'status'), 'name_not_allowed', 'T12 an entry as one word of several');
select is((select api.update_profile('xX_putain_Xx')->>'status'), 'name_not_allowed', 'T12 an entry between underscores');

-- T13: words that only contain an entry are fine.
select tests.clear_authentication();
insert into internal.name_blocklist (term, language) values ('con', 'fr');
select tests.authenticate_as('namer');
select is((select api.update_profile('Constance')->>'status'), 'ok', 'T13 Constance contains con and is fine');
select is((select api.update_profile('Scunthorpe')->>'status'), 'ok', 'T13 Scunthorpe is fine');
select is((select api.update_profile('Essex')->>'status'), 'ok', 'T13 Essex is fine');
select is((select api.update_profile('Con')->>'status'), 'name_not_allowed', 'T13 the word con itself is refused once listed');

-- T14: impersonation.
select is((select api.update_profile('Flimme')->>'status'), 'name_not_allowed', 'T14 Flimme');
select is((select api.update_profile('Admin')->>'status'), 'name_not_allowed', 'T14 Admin');
select is((select api.update_profile('Mod' || U&'\00E9' || 'rateur')->>'status'), 'name_not_allowed', 'T14 Modérateur');

-- T15: a refusal saves nothing, whatever else came with it.
select tests.clear_authentication();
select tests.create_player('refused');
update public.profiles set display_name = 'Kept', avatar_key = 'blue', country = 'FR', language = 'fr' where id = tests.uid('refused');
select tests.authenticate_as('refused');
select is((select api.update_profile('slut', 'red', 'GB', 'en')->>'status'), 'name_not_allowed', 'T15 a blocked name answers name_not_allowed');
select is((select api.update_profile(U&'\200B', 'red', 'GB', 'en')->>'status'), 'invalid_name', 'T15 an empty name answers invalid_name');
select is((select api.update_profile('Fine', 'fox', 'GB', 'en')->>'status'), 'unknown_avatar', 'T15 an unknown avatar answers unknown_avatar');
select tests.clear_authentication();
select is((select row(display_name, avatar_key, country, language)::text from public.profiles where id = tests.uid('refused')),
  '(Kept,blue,FR,fr)', 'T15 nothing was saved by the three refusals');

-- T16: the six avatars, and nothing else.
select tests.authenticate_as('namer');
select is((select api.update_profile(null, k)->>'status'), 'ok', 'T16 avatar ' || k || ' answers ok')
from unnest(array['blue', 'green', 'gold', 'red', 'violet', 'teal']) as k;
select is((select avatar_key from api.my_profile), 'teal', 'T16 the last avatar is saved');
select is((select api.update_profile(null, 'blue')->'avatar_key'), '"blue"'::jsonb, 'T16 the answer carries the saved avatar');
select is((select api.update_profile(null, 'default')->>'status'), 'unknown_avatar', 'T16 default is not a choice');
select is((select api.update_profile(null, '')->>'status'), 'unknown_avatar', 'T16 an empty key');
select is((select api.update_profile(null, 'fox')->>'status'), 'unknown_avatar', 'T16 an unknown key');
select is((select api.update_profile(null, 'Blue')->>'status'), 'unknown_avatar', 'T16 the wrong case');
select is((select avatar_key from api.my_profile), 'blue', 'T16 the avatar is unchanged after the refusals');

-- T17: null keeps the current value.
select is((select api.update_profile('Ines', null)->>'status'), 'ok', 'T17 a null avatar answers ok');
select is((select row(display_name, avatar_key)::text from api.my_profile), '(Ines,blue)', 'T17 the avatar stayed');
select is((select api.update_profile(null, 'gold')->>'display_name'), 'Ines', 'T17 a null name keeps the name, and the answer says so');

-- T18: the table enforces it too, and a new guest starts at default.
select tests.clear_authentication();
select throws_ok(
  $$update public.profiles set avatar_key = 'fox' where id = tests.uid('namer')$$,
  '23514', null, 'T18 a direct update to an unknown avatar is refused by the table'
);
select tests.create_player('fresh');
select is((select avatar_key from public.profiles where id = tests.uid('fresh')), 'default', 'T18 a new guest starts at default');

-- T19: phones reach none of it.
select ok(not has_table_privilege('authenticated', 'internal.name_blocklist', 'select'), 'T19 authenticated cannot read the blocklist');
select ok(not has_table_privilege('anon', 'internal.name_blocklist', 'select'), 'T19 anon cannot read the blocklist');
select ok(not has_function_privilege('authenticated', 'internal.normalise_display_name(text)', 'execute'), 'T19 authenticated cannot run normalise_display_name');
select ok(not has_function_privilege('authenticated', 'internal.is_blocked_name(text)', 'execute'), 'T19 authenticated cannot run is_blocked_name');
select ok(not has_function_privilege('anon', 'internal.is_blocked_name(text)', 'execute'), 'T19 anon cannot run is_blocked_name');

-- T20: the six keys are pinned, and the list is shaped as the matcher expects.
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'profiles_avatar_key_preset')) ~
  $$'default'.*'blue'.*'green'.*'gold'.*'red'.*'violet'.*'teal'$$, 'T20 the constraint lists default and the six keys');
select cmp_ok((select count(*) from internal.name_blocklist where term <> 'con'), '>=', 100::bigint, 'T20 the list has at least 100 entries');
select is((select count(*) from internal.name_blocklist where term !~ '^[a-z]+$'), 0::bigint, 'T20 every entry is folded: lowercase letters only');
select is((select count(*) from internal.name_blocklist where term = any (array[
  'flimme', 'admin', 'administrateur', 'moderateur', 'moderator', 'support', 'staff', 'official', 'officiel', 'system', 'systeme'
])), 11::bigint, 'T20 the eleven impersonation entries are listed');

-- T21: the lobby promise holds (040-lobby L1a and L1b run in their own file).
select tests.authenticate_as('namer');
select is((select api.update_profile('   ')->>'status'), 'invalid_name', 'T21 a blank name still answers invalid_name');
select is((select api.update_profile(' Sam ')->>'status'), 'ok', 'T21 a name with spaces around it still answers ok');

select * from finish();
rollback;

-- M8.12: api.set_analytics_choice and the legal links (analytics.md#analytics-consent,
-- privacy.md#consents). Each change revokes the active analytics row and inserts a new one, so
-- history stays. No row means on. The export already lists consents with to_jsonb, so it shows
-- the new column with no change.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.consents add column if not exists choice public.analytics_choice;

-- Analytics rows written before this column existed were the default mode.
update public.consents set choice = 'on' where kind = 'analytics' and choice is null;

-- squawk-ignore prefer-robust-stmts
alter table public.consents add constraint consents_choice_matches_kind
  check ((kind = 'analytics') = (choice is not null)) not valid;
-- squawk-ignore prefer-robust-stmts
alter table public.consents validate constraint consents_choice_matches_kind;

create function api.set_analytics_choice(p_choice public.analytics_choice, p_version text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me uuid := internal.my_profile_id();
  v_active public.consents;
begin
  if v_me is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if p_version is null or char_length(p_version) not between 1 and 40 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not internal.rate_limit('analytics_choice:p:' || v_me, 20, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into v_active from public.consents
  where profile_id = v_me and kind = 'analytics' and revoked_at is null;
  if found and v_active.choice = p_choice then
    return jsonb_build_object('status', 'ok', 'choice', p_choice);
  end if;

  update public.consents set revoked_at = now()
  where profile_id = v_me and kind = 'analytics' and revoked_at is null;
  insert into public.consents (profile_id, kind, version, choice)
  values (v_me, 'analytics', p_version, p_choice);
  return jsonb_build_object('status', 'ok', 'choice', p_choice);
end
$$;

revoke execute on function api.set_analytics_choice(public.analytics_choice, text) from public, anon;
grant execute on function api.set_analytics_choice(public.analytics_choice, text) to authenticated;

-- Q12.2: the policy, terms and deletion links per language, and the support address. M8.3 corrects
-- the paths by a later migration if its pages differ.
insert into public.app_config (key, value) values
  ('legal_urls', '{
    "privacy": {"fr": "https://flimme.com/fr/confidentialite", "en": "https://flimme.com/en/privacy"},
    "terms": {"fr": "https://flimme.com/fr/conditions", "en": "https://flimme.com/en/terms"},
    "deletion": {"fr": "https://flimme.com/fr/suppression", "en": "https://flimme.com/en/delete-account"},
    "support_email": "support@flimme.com"
  }'::jsonb);

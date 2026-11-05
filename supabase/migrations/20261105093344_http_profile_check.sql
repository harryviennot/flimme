-- M8.4: the HTTP API's token check ends with one question: does the token's user have a
-- profile? (security.md#the-servers-http-api-and-letterboxd-uploads: "sub is the user, whose
-- profile must exist".) app_http reads no table, so the answer goes through a definer function
-- only it can run.

set local lock_timeout = '3s';
set local statement_timeout = '10s';

create function internal.http_profile_exists(p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.auth_user_id = p_user)
$$;

revoke all on function internal.http_profile_exists(uuid) from public;
grant execute on function internal.http_profile_exists(uuid) to app_http;

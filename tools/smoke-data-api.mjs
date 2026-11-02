#!/usr/bin/env node
// After a deploy, checks the Data API settings that only the Supabase dashboard can set
// (security.md#supabase-settings): only `api` is exposed and GraphQL is off.
// Reads SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (GitHub environment variables, not secrets).
import { fileURLToPath } from 'node:url';

/** `public` must not answer: PostgREST refuses an unexposed schema with 406 (PGRST106). */
export function judgePublicRefused(status) {
  return status === 406 || status === 404
    ? null
    : `/rest/v1/rooms with Accept-Profile: public answered ${status}, expected 406: "public" is exposed`;
}

/** GraphQL must give no data: the extension is dropped, so the route errors out. */
export function judgeGraphqlSilent(status, body) {
  let data = null;
  try {
    data = JSON.parse(body)?.data ?? null;
  } catch {
    // not JSON: nothing answered
  }
  return data === null ? null : `/graphql/v1 answered ${status} with data: pg_graphql is on`;
}

/** The `api` schema must be reachable. A phone without a session is told "permission denied"
 * (401 or 403), which still proves the function was found; 404 or 406 mean `api` isn't exposed. */
export function judgeApiAnswers(status) {
  return [200, 204, 401, 403].includes(status)
    ? null
    : `/rest/v1/rpc/touch_room with Content-Profile: api answered ${status}: "api" is not exposed`;
}

async function main() {
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = process.env;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set (environment variables).');
    process.exit(2);
  }
  const base = url.replace(/\/$/, '');
  const send = async (path, init = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { apikey: key, ...init.headers },
    });
    return { status: res.status, body: await res.text() };
  };

  const pub = await send('/rest/v1/rooms?limit=1', { headers: { 'Accept-Profile': 'public' } });
  const gql = await send('/graphql/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' }),
  });
  const api = await send('/rest/v1/rpc/touch_room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Profile': 'api' },
    body: JSON.stringify({ p_room_id: '00000000-0000-0000-0000-000000000000' }),
  });

  const failures = [
    judgePublicRefused(pub.status),
    judgeGraphqlSilent(gql.status, gql.body),
    judgeApiAnswers(api.status),
  ].filter(Boolean);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log(`ok smoke (public ${pub.status}, graphql ${gql.status}, api ${api.status})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

# Security

A defensive review of Flimme's design before it's built: what we protect, who might attack or abuse it, what the drafted database already gets right, the concrete gaps found in [schema.sql](schema.sql), and the rules for room codes, guest accounts, the server's HTTP API, secrets, the app, kids on the couch, account deletion, logging and dependencies. It ends with a checklist for the closed beta and the launch. Written on 29 October 2026.

It builds on the [data model](data-model.md) (especially [Who sees what](data-model.md#who-sees-what)), the [recommendation server](recommendation-server.md), the [Letterboxd integration](../integrations/letterboxd.md), [app structure](app-structure.md), [onboarding](../product/onboarding.md) and [game modes](../product/game-modes.md). Legal matters, consent and retention law are in [privacy.md](../product/privacy.md); environments, monitoring and incident handling in [operations.md](operations.md). Facts about Supabase, Expo, Postgres, Python, Android and GitHub were checked on their live docs on 29 October 2026 (see [Sources](#sources)). Decisions are in [decisions.md](../decisions.md).

Every number marked as a starting value is a placeholder.

## Contents

1. [What we protect](#what-we-protect)
2. [Threat model](#threat-model)
3. [The database: what already holds](#the-database-what-already-holds)
4. [The database: gaps found](#the-database-gaps-found)
5. [Supabase settings](#supabase-settings)
6. [Room codes, joining and the host](#room-codes-joining-and-the-host)
7. [Guest accounts](#guest-accounts)
8. [The server's HTTP API and Letterboxd uploads](#the-servers-http-api-and-letterboxd-uploads)
9. [Secrets and the server's database logins](#secrets-and-the-servers-database-logins)
10. [The app](#the-app)
11. [Keeping kids safe on screen](#keeping-kids-safe-on-screen)
12. [Account deletion and data export](#account-deletion-and-data-export)
13. [Logging without personal data](#logging-without-personal-data)
14. [Dependencies and accounts](#dependencies-and-accounts)
15. [Checklist](#checklist)
16. [Changes this asks elsewhere](#changes-this-asks-elsewhere)
17. [Starting values](#starting-values)
18. [Sources](#sources)

## What we protect

| What | Why it matters | Where it lives |
| --- | --- | --- |
| Players' film history | Personal data: a Letterboxd diary says a lot about someone | `letterboxd_entries`, `user_titles`, `taste_profiles`, `card_history` |
| Each movie night | Who's in it, their names and services, and secret votes. A spoiled evening is the most likely harm | `rooms`, `room_members`, `votes`, the room's Realtime topics |
| Kids on the couch | What a 7-year-old sees on the screen | Posters, labels, names, reactions |
| The catalog | TMDB and JustWatch data, under their terms: we mustn't become a free mirror of it ([tmdb.md](../integrations/tmdb.md#terms-licence-and-attribution)) | `titles`, `title_availability` |
| Credentials | A leaked key is the fastest way to lose everything at once | The server, CI, the developer accounts |
| Training data | Pseudonymous swipes, valuable and easy to pollute | `swipe_log`, `rec` |

What the app deliberately doesn't have, and should keep not having: payments inside the app at launch, passwords (sign-in is guest, Apple or Google), photos, chat, public profiles or search for other players. Each of these would be a new attack surface and a new way to hurt a kid.

## Threat model

| Who | Wants | Can reach | Worst realistic outcome | Main defences |
| --- | --- | --- | --- | --- |
| **A curious player** | To see what the API gives away: other rooms, other people's votes, the whole catalog | Their own token, every `api` view and function | Reading data they shouldn't, scraping the catalog | The `api` schema boundary, row-level security, checks inside every function ([gaps](#the-database-gaps-found)) |
| **A troll** | To crash strangers' movie nights | Guessing room codes, old invite links, an offensive name, reaction spam | A ruined evening | Rate limits, room references on links, Remove player and Lock room ([joining](#room-codes-joining-and-the-host)), name rules ([kids](#keeping-kids-safe-on-screen)) |
| **An export faker** | To attach someone else's Letterboxd username, or to push junk | A hand-made export | Public data in their own account; wasted TMDB requests | The RSS check, upload limits, a matching budget ([uploads](#the-servers-http-api-and-letterboxd-uploads)) |
| **A scraper** | Our catalog or our app's like rates | `api.title_cards`, many guest accounts | Bulk copying of TMDB and JustWatch data through us | No catalog tables exposed, `api.title_cards` restricted, rate limits |
| **A sign-up bot** | Thousands of guests, to dodge per-player limits | Supabase anonymous sign-in | Bypassed rate limits, a bloated `profiles` table | Supabase's per-IP limit, a CAPTCHA kept ready, guest cleanup ([guests](#guest-accounts)) |
| **Someone with a stolen key** | Everything | The server's database login, a secret API key, the Expo or GitHub account | Data read or deleted; a malicious app update pushed to every phone | Least privilege, one key per component, rotation, 2FA ([secrets](#secrets-and-the-servers-database-logins), [accounts](#dependencies-and-accounts)) |
| **A lost or shared phone** | The player's data | The session stored on the device | Export or deletion of that player's account | 1-hour access tokens, refresh token reuse detection, encrypted session storage ([the app](#the-app)) |

Not an attacker, but a harm the design must prevent: a horror poster in front of a child in a room whose host set an age cap.

## The database: what already holds

Read against the draft [schema.sql](schema.sql):

- **One door.** Phones reach only the `api` schema. `anon` gets nothing at all (no usage on `api`); every phone signs in, as a guest at least, and uses `authenticated`.
- **Row-level security on every table** in `public` and `rec`, enabled in one loop, with a `server_all` policy for `app_server` and narrow read policies for phones. Phones have no insert, update or delete grant on any table.
- **Every function that runs with its owner's rights pins its search path.** All 44 `security definer` functions set `search_path = ''` and schema-qualify every name. The views run as the caller (`security_invoker`).
- **Votes stay secret.** Phones read only their own seat's votes (`own_seat`). `room_cards`, with its counters, scores and fits, has no phone grant at all. Near-miss counts are broadcast only in Party mode.
- **Nobody can list rooms.** A room is found only by its code, through `api.join_room`, which counts the attempt first and never raises on a wrong code, so a failed guess can't roll back the counter.
- **Realtime is split in two.** Phones can't send on `room:<id>`, so a fake `match` can't appear; they can only send on `room:<id>:live`.
- **The server writes decks through one function** (`internal.deal_cards`), never votes or room state.
- **`api.room_seats` hides profile ids**, showing only `is_me` and `is_mine`. Deleting an account blanks the name on past seats.

## The database: gaps found

Concrete issues in the draft SQL, with a fix and when it's needed.

| # | Where | Problem | Fix | When |
| --- | --- | --- | --- | --- |
| 1 | Grants for future objects | The script revokes function rights once, at the end, for the functions that exist then. In Postgres a new function is executable by `PUBLIC`, and Supabase also grants new objects in `public` to `anon` and `authenticated` on existing projects. Every function or table added by a later migration starts open | `alter default privileges` to revoke execute on functions from `PUBLIC` in `api`, `internal`, `rec` and `public`, and to revoke Supabase's default table grants in `public`. A CI check that lists tables without row-level security and functions executable by phones that aren't on an allowlist | Beta |
| 2 | `api.title_cards` | Returns cards for any film ids, 50 per call, for any country, with no limit. A guest can download the whole catalog, availability per country included, in about a thousand calls | Serve only films in the caller's rooms (pool, matches, finalists) and the taste check pool; take the country from the profile or the room, not an argument; rate-limit | Beta |
| 3 | `internal.is_room_member` | Ignores `left_at`, and there's no way to remove a player. Anyone who ever sat in a room keeps reading its seats, matches and rounds, keeps both Realtime topics, and can keep sending on `:live` | Add `room_members.removed_at`. Removed seats are not members at all; seats that left keep read access (for history and rejoining) but can't send on `:live` | Beta |
| 4 | `api.update_profile` | `avatar_key` accepts any text, though the column says "preset avatar". Display names are only length-checked | Validate avatars against a list of presets; normalise names ([kids](#keeping-kids-safe-on-screen)) | Beta |
| 5 | `api.update_room_settings` | Broadcasts the client's raw `p_settings` JSON to every phone in the room, whatever it contains, and doesn't range-check `runtime_max` or `max_age` | Broadcast the saved values, not the input; check ranges | Beta |
| 6 | Work anyone can trigger | `api.submit_calibration` queues a taste refresh on every call; `api.export_my_data` is a heavy query; the planned `api.rate_seen_films` and `api.report_unavailable` write on every call. None is rate-limited | One helper, `internal.rate_limit(key, max, window)`, used by all of them and by `api.join_room` | Beta |
| 7 | `rate_limits` keys | Keyed by profile, and a new guest is a new profile, so every per-player limit can be bypassed | Add per-IP keys, read from the `x-forwarded-for` request header (Supabase documents `current_setting('request.headers', true)`), with limits generous enough for a family on one Wi-Fi | Beta |
| 8 | `api.create_room` | Codes come from `random()`, which Postgres documents as not suitable for cryptographic use | Draw codes from `pgcrypto` | Launch |
| 9 | `api.cast_vote` | `p_dwell_ms` and `p_client_at` aren't validated; nonsense values land in the training data | Clamp both to plausible ranges | Launch |
| 10 | `api.set_seat_prefs`, `api.set_my_providers` | Arrays of any size; seat services aren't checked against the providers of the room's country | Cap array sizes; keep only services listed in the country | Launch |
| 11 | `app_server` | One role for all four server processes, including the internet-facing HTTP API, with read on every table and execute on `broadcast_room` and `enqueue` | Separate logins per process; a narrower role for the HTTP API ([secrets](#secrets-and-the-servers-database-logins)) | Launch |
| 12 | Realtime `:live` | Members may send any broadcast or presence payload there. That's by design, but the phones must not trust it | Phones accept only known events, emoji keys from the fixed set, and presence keyed by a current seat; everything else is dropped ([app structure](app-structure.md#realtime)) | Beta |

Two smaller notes: `api.join_room` answers `full`, `starting` or `in_finale` for a code that exists and `not_found` otherwise, which tells a guesser a code is live. That's acceptable behind the rate limits. And account deletion via the server is covered in [Account deletion and data export](#account-deletion-and-data-export).

## Supabase settings

Settings outside the SQL that the security above depends on. Checked against Supabase's docs on 29 October 2026.

| Setting | Value | Why |
| --- | --- | --- |
| Data API exposed schemas | `api` only | The whole surface the app can reach |
| Automatically expose new tables | Off, plus the default privileges of gap 1 | Supabase grants new objects in `public` to `anon` and `authenticated` on existing projects; functions stay callable through `PUBLIC` even with this off. Supabase says it's moving to opt-in exposure |
| GraphQL (`pg_graphql`) | Off | Unused. It follows grants and row-level security, but it's one more door. Supabase's GraphQL docs don't describe a switch-off, only revoking grants or dropping the extension: test on the project that it returns nothing |
| Realtime "Allow public access" | Off | Private channels, and so our topic policies, are only enforced when it's off |
| JWT signing keys | Asymmetric (ES256) | Supabase calls the shared-secret HS256 "not recommended for production". The server then verifies tokens against public keys and holds no signing secret |
| API keys | Publishable key in the app; secret keys on the server, one per component | Supabase is deprecating the legacy `anon` and `service_role` keys by the end of 2026, and new secret keys can be rotated one at a time |
| Access token lifetime | 1 hour, the default | Supabase advises against longer. Realtime and the server only notice a removed player when the token changes |
| Refresh token reuse detection | On, the default | Reusing a refresh token outside a 10-second window ends the whole session |
| Anonymous sign-ins per IP | 30 an hour, the default | See [Guest accounts](#guest-accounts) |
| CAPTCHA | Configured with Cloudflare Turnstile, switched off at launch | See [Guest accounts](#guest-accounts) |
| Security advisors | Run before every release | They flag tables without row-level security, among others ([operations.md](operations.md)) |

## Room codes, joining and the host

**The code space.** Six digits give a million codes, unique among open rooms. With N rooms open, a random guess finds one with probability N / 1,000,000: 1 in 10,000 at 100 open rooms, 1 in 1,000 at 1,000.

**How far a guesser gets today.** Each profile gets 10 tries every 10 minutes, but a new guest is a new profile, and Supabase allows 30 anonymous sign-ins an hour per IP address. That's on the order of a thousand guesses an hour from one address: with 500 rooms open, about one stranger's room every two hours. A room holds names, avatars, services and the deck, no contact details or history, so the harm is a spoiled evening, not a data leak. Still worth closing.

**Layers, all cheap:**

1. **Per-IP limits on joining** (gap 7): 30 attempts per 10 minutes per address, which a 10-person party on one Wi-Fi never reaches.
2. **Failed attempts count more**: 5 `not_found` answers per profile per 10 minutes, then `rate_limited`.
3. **Invite links carry a room reference** ([onboarding](../product/onboarding.md#the-link)): `api.join_room(code, ref)` answers `closed` when the code now belongs to another room, so an old link never lands in a stranger's newer room.
4. **Codes from a cryptographic generator** (gap 8).
5. **Alerts** when `not_found` answers or guest sign-ups spike ([operations.md](operations.md)).
6. **A CAPTCHA kept ready** for guest sign-up ([Guest accounts](#guest-accounts)).

**Remove player and Lock room.** Neither exists yet, and a host has no answer to a troll who got in.

- **Remove player** (`api.remove_member(room, member)`, host only): sets `removed_at`. The seat stops being a member (gap 3), its presence disappears, and `api.join_room` answers `removed` if it tries to come back. Its votes stay in the log but no longer count, because the seat is no longer present. One limit: Supabase evaluates Realtime policies when a channel is joined and caches them until a new token is sent, so a removed phone can keep receiving room events for up to the token's lifetime. It sees counts and matches, never votes, and the other phones ignore anything it sends on `:live`.
- **Lock room** (`rooms.locked`, host only): no new seats, by code or by link; players who already have a seat can still rejoin. Late joining stays the default, as decided.

**The host's powers**, all checked in the database: change settings (lobby only), start, the game-modes controls (Vote now, Keep swiping, Play again), remove a player, lock the room. The host never sees anyone's votes. When the host leaves, the role goes to a present player ([game modes](../product/game-modes.md#who-counts-presence-joining-and-leaving)).

**Abuse from inside the room**, and what covers it:

| Abuse | Cover |
| --- | --- |
| Adding every service to widen the deck (under "any member", every seat's services count) | Each seat's services show in the lobby; the host can remove the player |
| Reaction spam | A fixed emoji set; each phone shows at most 3 reactions a second per seat |
| Undo and re-vote loops to spam near-miss events | Undo takes back the last swipe only, once ([game modes](../product/game-modes.md#the-answers)) |
| An offensive name | Name rules and Remove player |

## Guest accounts

Every install starts as an anonymous Supabase user, and a trigger gives it a profile.

- **Sign-up limit.** Supabase limits anonymous sign-ins to 30 an hour per IP address by default (configurable). Keep the default: each phone signs in once, so even a large party on one Wi-Fi stays far below it.
- **CAPTCHA.** Supabase recommends invisible CAPTCHA or Cloudflare Turnstile against abuse of anonymous sign-ins. Its CAPTCHA guide only shows web examples, so a native app needs a small web view. A challenge in front of the 30-second join would hurt the core promise, so **configure Turnstile but leave it off at launch**, and switch it on if the sign-up alert fires.
- **Cleanup.** Supabase says automatic cleanup of anonymous users isn't available and suggests deleting them with SQL. The retention job in the [data model](data-model.md#retention) must therefore delete guests inactive for 90 days from `auth.users` itself, which cascades to the profile and blanks past seats.
- **What guests may do.** Everything a signed-in player can, including connecting Letterboxd: it's their own data, and it's deleted with the guest. The `is_anonymous` claim matters later, for the hosting cap ([monetization](../product/monetization.md)).

## The server's HTTP API and Letterboxd uploads

The [recommendation server](recommendation-server.md#processes) exposes two endpoints to phones: the Letterboxd export upload and account deletion. The trainer and the workers accept no inbound connections.

**Checking the phone's token**, on every request:

1. Verify the signature against the project's public keys at `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`, with ES256 signing keys.
2. Check `exp`, `iss` (the project's `/auth/v1` URL), `aud` = `authenticated` and `role` = `authenticated`; `sub` is the user, whose profile must exist. Guests (`is_anonymous`) are accepted on both endpoints.
3. Cache the keys for at most 10 minutes, with a way to flush the cache: Supabase's own edge caches them that long, and a revoked key stays trusted by any backend still holding it.

**Request limits** (starting values): a 10 MB body at most; JSON checked against a schema; at most 50,000 films and 50,000 diary entries; film names up to 300 characters; years, half-star ratings and dates in plausible ranges; film links matching `https://boxd.it/...`; 5 uploads per account per day.

**The ZIP stays on the phone.** [App structure](app-structure.md#letterboxd-on-the-phone) unzips and reads the export on the phone and uploads only the fields Letterboxd's doc lists. That's the safer design: the server never decompresses an untrusted archive, so a zip bomb can't hurt it, and less personal data leaves the phone. On the phone, cap what's read (at most 20 MB decompressed per file, 200 entries in the archive) so a crafted file can't crash the app. The server still treats the uploaded JSON as untrusted.

**What the RSS check proves, and what it doesn't** ([letterboxd.md](../integrations/letterboxd.md#the-rss-check)). It makes claiming someone else's username cost more than typing it: the upload must contain most of their public feed's older entries. Someone who copies a public feed into a hand-made export still passes, and an empty public diary proves nothing. That's acceptable only because of the earlier decision: every account keeps its own copy, so a faker only ever puts public data into their own account.

**Fetching the feed safely.** The server builds the URL from a username taken from an untrusted file:

- Accept only usernames of letters, digits and underscores, within a short length, before building `https://letterboxd.com/<username>/rss/`.
- Fetch only that host, follow no redirect to another host, time out after 10 seconds, read at most 2 MB.
- Parse the XML with a parser protected against entity expansion. In Python, Expat versions before 2.7.2 are open to "billion laughs" and related attacks, so check `pyexpat.EXPAT_VERSION`; use the equivalent safeguard in TypeScript if that's the server's language ([server-structure.md](server-structure.md)).

**A matching budget.** Each unmatched film costs a TMDB search. A crafted upload of 50,000 made-up titles would burn TMDB's rate for everyone. Cap TMDB searches at 2,000 per import (starting value); the rest stay unmatched for the fix screen.

## Secrets and the server's database logins

| Secret | Lives in | Never in | Rotation |
| --- | --- | --- | --- |
| The server's database logins | The host's secret store, one login per process | The repo, the app, logs | `alter role ... password`, then redeploy that process. Two logins per process allow a swap without downtime |
| A Supabase secret key (account deletion only) | The HTTP API process only | Workers, the trainer, the app, CI logs | Create a new key, deploy, delete the old one. Deletion is permanent |
| The TMDB API key | The pipeline worker | The app (posters load from TMDB's image servers without a key) | Regenerate in TMDB's settings |
| The Postgres owner password and a Supabase access token | CI only, for migrations | The server | Change in the dashboard; Supabase says this causes no downtime for its own services |
| Apple, Google Play and Expo credentials | EAS and the developer's password manager | The repo | Per store |
| Sentry's upload token | CI only | The app | In Sentry |

**Least privilege.** Supabase recommends a separate database user for every service. So: one login per process (deck worker, pipeline worker, trainer, HTTP API), all with the `app_server` role except the HTTP API. As the only process facing the internet, it gets a narrower role: `internal.start_letterboxd_import`, `internal.enqueue` and the few reads it needs. No process ever uses the Postgres owner password. The secret key, which bypasses row-level security, sits in the HTTP API alone.

**Storage.** The hosting provider's secret store for the server, EAS environment variables for build values, GitHub's encrypted secrets for CI. GitHub secret scanning with push protection on every repository.

## The app

**What ships inside it is public.** Anyone can unpack the app. The Supabase URL and publishable key, the Sentry DSN, the PostHog project key and the TMDB image address are public by design. Nothing else goes in: no TMDB key, no secret key, no database credentials.

**The session on the phone.** [App structure](app-structure.md#where-state-lives) stores Supabase's session in `expo-sqlite`, as in Supabase's quickstart: a plain file in the app's sandbox. It holds a refresh token that never expires on its own. Expo's SecureStore keeps values in the iOS Keychain and in Android's Keystore-encrypted storage, but Expo warns that some iOS releases refused values above about 2,048 bytes, and a session is bigger than that. **Recommended:** keep the session in SQLite encrypted, with the key in SecureStore, and leave it out of device backups. The data at stake is modest (no payments, no passwords), so this is a launch item, not a beta one.

**No certificate pinning in v1.** Pinning protects against a fraudulent certificate from a trusted authority. Android's docs warn that pins need a backup key, or connectivity only comes back with an app update. Supabase manages and rotates its certificates, and our threat model has no payments or passwords. The risk of locking every player out outweighs the gain. Revisit if the app ever handles payments itself.

**Links into the app** ([app structure](app-structure.md#invites-and-deep-links)):

- Invites use universal links and Android App Links, which Expo notes both require a file on our domain proving we control it. The custom URL scheme is only a fallback, and no link ever carries a token.
- Links are parsed strictly: `/join/<6 digits>` plus the room reference, nothing else. Anything that doesn't match opens Home.
- Joining from a link shows the host's name and the number of players before the player's first swipe, so a stale or forwarded link is visible for what it is.

**Over-the-air updates can push JavaScript to every phone.** Whoever controls the Expo account controls the app. 2FA on the Expo account, and only Harry can publish. Expo's end-to-end code signing for updates (the phone refuses updates not signed with our key) is only available on the EAS Production or Enterprise plans: worth it later, not needed for the beta.

**Not worth it in v1:** root and jailbreak detection, code obfuscation, blocking screenshots.

## Keeping kids safe on screen

An age cap on a room (`rooms.max_age`) has to hold everywhere a poster or a title can appear, not only in the deck.

| Where | Risk | Rule |
| --- | --- | --- |
| Deck cards | A film above the cap | Already filtered by certification, with the US fallback and "no certification, no card" ([tmdb.md](../integrations/tmdb.md#certifications-and-age)). Adult titles are always excluded |
| The taste check | Its pool has a horror pick on purpose | In a room with an age cap, skip films above the cap ([deck engine](deck-engine.md#the-taste-check)) |
| Reason labels | "Because Sam loved Hereditary" names a film that isn't on the card | In capped rooms, labels only name films within the cap ([deck engine](deck-engine.md#reason-labels)) |
| Trailers | The card back opens YouTube, whose next video isn't ours to choose | No trailer button in rooms capped under 13 (recommended) |
| Display names | Slurs, impersonation, invisible or right-to-left characters | Normalise (Unicode NFKC, strip control, zero-width and direction-override characters), reject names that end up empty, a short blocklist in English and French, and Remove player. Names never leave the room: no profiles, no search |
| Reactions | Free text sent as a "reaction" | Phones show only emoji from the fixed set and drop everything else |
| Avatars | Uploaded pictures | Presets only, enforced in the database (gap 4). Never photos |
| Contact | Strangers talking to kids | No chat, no direct messages, no public profiles: keep it that way |

Rules on kids' data (COPPA, parental consent under 15 in France, kid profiles later) are in [privacy.md](../product/privacy.md). The store age rating is in [store-listing.md](../product/store-listing.md).

## Account deletion and data export

**Deleting an account** ([data model](data-model.md#deleting-an-account-exporting-data)):

1. The phone calls the HTTP API with its token.
2. The server deletes exactly the token's `sub` through Supabase's auth admin API, using the HTTP API's secret key. Nothing in the request names whom to delete.
3. The database cascades: profile, services, consents, Letterboxd link, diary, film history, taste, card history. Past seats keep their votes, anonymous.
4. The server also asks analytics to forget the user. Crash reports carry no user id, so there is nothing to delete there ([privacy.md](../product/privacy.md#crash-reports)).
5. The phone signs out and wipes its local data: the session, the vote queue, cached cards.

Deletion is idempotent: a retry after a dropped connection succeeds quietly.

**Exporting data.** `api.export_my_data` only ever returns the caller's own data, by construction. It's a heavy query, so limit it to once an hour per profile. It must include everything the other docs add, `card_history` among them.

**A stolen session** gives export, deletion and playing as that player, nothing else. The covers: 1-hour access tokens, refresh token reuse detection (on by default), and the encrypted session on the phone.

## Logging without personal data

| Where | Logs | Never logs |
| --- | --- | --- |
| The server | Room, seat and profile ids, timings, status codes, error kinds | Tokens, request bodies (Letterboxd uploads especially), Letterboxd usernames, display names |
| Database function errors | Fixed messages ("not a member of this room") | Values from the request. The current messages already follow this |
| Sentry, app and server | Crashes with device and app version | Personal data: default PII off, breadcrumbs without request bodies ([app structure](app-structure.md#analytics-and-crash-reports)) |
| PostHog | Product events, after consent | Names, film history ([analytics.md](../product/analytics.md)) |
| Supabase's own logs | API and auth requests, with IP addresses | Retention and disclosure are in [privacy.md](../product/privacy.md) |
| `swipe_log`, `rec`, training exports | Seat ids | Profile ids, names, usernames (already the design) |

## Dependencies and accounts

One developer means one person's laptop and accounts are the whole perimeter.

- **Accounts.** 2FA on GitHub, Expo, Apple, Google Play, Supabase, TMDB, the server host, the domain registrar, and the email account behind all of them. Separate Supabase projects for development, staging and production ([operations.md](operations.md)).
- **Dependencies.** Lockfiles committed; Dependabot or Renovate weekly; `npm audit` and the server's equivalent in CI; few dependencies, preferring Expo SDK modules; a second look before adding any native module, since it runs with the app's permissions.
- **CI.** Pin third-party GitHub Actions to a full commit SHA, and make the `GITHUB_TOKEN` read-only by default, both as GitHub's security guide advises. Secrets only in jobs that need them.
- **Secret scanning** with push protection on both repositories.

## Checklist

**Before the closed beta**

- [ ] Default privileges revoked, and a CI check for tables without row-level security and functions open to phones (gap 1)
- [ ] `api.title_cards` restricted to the caller's rooms and the taste check (gap 2)
- [ ] `removed_at`, Remove player, Lock room; removed seats lose read and Realtime access (gap 3)
- [ ] Avatars from presets only; display names normalised, with a blocklist (gap 4)
- [ ] `api.update_room_settings` broadcasts saved values and checks ranges (gap 5)
- [ ] `internal.rate_limit` on joining, calibration, export and the new write functions, per profile and per IP (gaps 6 and 7)
- [ ] Phones drop unknown Realtime messages (gap 12)
- [ ] Supabase settings as listed: only `api` exposed, GraphQL off, public Realtime access off, ES256 signing keys, publishable and secret keys
- [ ] HTTP API: token checks, request limits, safe feed fetching, a matching budget
- [ ] Room references on invite links
- [ ] Age caps hold in the taste check and labels; no trailers under 13
- [ ] 2FA on every account; no secret in the app or the repos; secret scanning on

**Before the public launch**

- [ ] Room codes from `pgcrypto`; dwell times and client times clamped; array sizes capped (gaps 8 to 10)
- [ ] One database login per server process; a narrower role for the HTTP API (gap 11)
- [ ] The session stored encrypted on the phone, outside backups
- [ ] Guest cleanup after 90 days running, from `auth.users`
- [ ] Alerts on failed joins and guest sign-ups; Turnstile configured, ready to switch on
- [ ] Account deletion also clears analytics, and crash reports carry no user id; data export includes everything
- [ ] Security advisors clean; a written runbook for a leaked key ([operations.md](operations.md))
- [ ] CI actions pinned to commit SHAs, read-only tokens, dependency updates and audits running

**Later**

- [ ] EAS Update code signing (an EAS Production plan)
- [ ] A per-IP write limit before every request (Supabase's documented `db_pre_request` pattern), if abuse shows up
- [ ] Revisit certificate pinning if the app ever handles payments itself
- [ ] Kid profiles and pass and play: a fresh review of seats controlled by another profile

## Changes this asks elsewhere

| Where | Change |
| --- | --- |
| [schema.sql](schema.sql) and the [data model](data-model.md) | Gaps 1 to 11: default privileges; `api.title_cards` restricted; `room_members.removed_at`, `rooms.locked`, `api.remove_member`, `api.set_room_locked`; `internal.is_room_member` and `internal.can_use_room_topic` exclude removed seats (and seats that left, for sending); `api.join_room` takes the room reference and answers `closed`, `removed` and `locked`; `internal.rate_limit` with per-IP keys; an avatar list; name normalisation; settings broadcast from saved values; codes from `pgcrypto`; clamps and array caps; separate server logins and an `app_http` role |
| [app-structure.md](app-structure.md) | Encrypt the stored session with a key in SecureStore and keep it out of backups; drop unknown Realtime messages; parse links strictly; wipe local data on deletion |
| [onboarding.md](../product/onboarding.md) | Joining from a link shows the host and player count before the first swipe; "Remove player" and "Lock room" in the lobby's host menu |
| [game-modes.md](../product/game-modes.md) | Remove player and Lock room join the host's powers; a removed seat no longer counts as present |
| [deck-engine.md](deck-engine.md) | The taste check skips films above a room's age cap; labels in capped rooms only name films within the cap |
| [operations.md](operations.md) | Alerts on failed joins and guest sign-ups; security advisors before each release; a leaked-key runbook |
| [privacy.md](../product/privacy.md) | Kids' data rules, consent, retention law, deletion from analytics, crash reports without a user id |

## Starting values

All placeholders until playtests.

| Value | Start |
| --- | --- |
| Join attempts per profile | 10 per 10 minutes (already in the schema) |
| Failed joins (`not_found`) per profile | 5 per 10 minutes |
| Join attempts per IP address | 30 per 10 minutes |
| Anonymous sign-ins per IP address | 30 per hour (Supabase's default) |
| Data exports | 1 per hour per profile |
| Taste check submissions | 10 per hour per profile |
| Seen-film ratings, "Not there anymore?" reports | 30 and 10 per hour per profile |
| `api.title_cards` | 30 calls per 10 minutes per profile, 50 films a call |
| Letterboxd upload | 10 MB body, 50,000 films, 50,000 diary entries, 5 per account per day |
| TMDB searches per import | 2,000 |
| RSS fetch | 10-second timeout, 2 MB at most, no redirect to another host |
| Export ZIP on the phone | 20 MB decompressed per file read, 200 entries in the archive |
| Reactions shown | 3 per second per seat |
| Display names | 1 to 24 characters after normalisation |
| Services per call | 50 |
| Access token lifetime | 1 hour (Supabase's default) |
| JWKS cache on the server | 10 minutes, with a manual flush |

## Sources

All checked on 29 October 2026.

- Supabase: [anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous) (30 per hour per IP, CAPTCHA recommendation, no automatic cleanup), [auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha) (hCaptcha and Turnstile, web examples only), [API keys](https://supabase.com/docs/guides/api/api-keys) (publishable and secret keys, per-component rotation, legacy keys deprecated by the end of 2026), [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys) (JWKS endpoint, ES256, caching and revocation), [JWTs](https://supabase.com/docs/guides/auth/jwts) and [JWT claims](https://supabase.com/docs/guides/auth/jwt-fields) (`iss`, `aud`, `exp`, `sub`, `role`, `is_anonymous`), [sessions](https://supabase.com/docs/guides/auth/sessions) (1-hour default, refresh token reuse detection, time-boxing on Pro), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) (private channels only with public access off, policies cached per connection), [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [Postgres roles](https://supabase.com/docs/guides/database/postgres/roles) (a user per service), [securing the API](https://supabase.com/docs/guides/api/securing-your-api) (default privileges, `request.headers`, the `db_pre_request` rate limit pattern), [GraphQL](https://supabase.com/docs/guides/graphql) (follows grants and row-level security)
- [PostgreSQL mathematical functions](https://www.postgresql.org/docs/current/functions-math.html): `random()` not suitable for cryptographic use; use `pgcrypto`
- Expo: [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) (Keychain and Keystore, values above about 2,048 bytes refused on some iOS releases), [linking overview](https://docs.expo.dev/linking/overview/) (universal links and App Links need a domain file), [EAS Update code signing](https://docs.expo.dev/eas-update/code-signing/) (EAS Production or Enterprise plans)
- [Android network security configuration](https://developer.android.com/privacy-and-security/security-config): certificate pinning needs a backup key or an app update
- [Python XML security](https://docs.python.org/3/library/xml.html) (Python 3.15 docs): Expat before 2.7.2 open to "billion laughs" and related attacks
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use): pin actions to a commit SHA, minimal `GITHUB_TOKEN` permissions
- The draft [schema.sql](schema.sql), read in full for this review

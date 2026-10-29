# MovieMatch revival plan

Project review, 28 October 2026. A review of [MovieMatch](https://github.com/harryviennot/MovieMatch) and [MovieMatchServer](https://github.com/harryviennot/MovieMatchServer), with a plan to get MovieMatch to a public release.

- **This file** is the Markdown version of the report, to read on GitHub and edit.
- **Original report**: [archive/revival-plan-2026-10-28.html](../archive/revival-plan-2026-10-28.html) (download and open in a browser; it has an interactive checklist and a group-scoring demo). Live version: https://claude.ai/artifact/BtN7AF4dE9zfBTvZpxWckg (private until shared).
- **Design file**: https://www.figma.com/design/v2ZGLbGmzZ7032V9AI5vWM. 25 release screens plus a share card in 6 flows, and the design tokens: variables, text and effect styles, icons and components, including both movie cards with a tap-to-flip back side. Its section 07 compares the new card with an exact copy of the card from the [original MovieMatch Figma](https://www.figma.com/file/FemeYv6ANlWLGDvwfXAs7s).

> **Since this report.** Later decisions replaced parts of it. The rest still stands.
>
> - **Letterboxd**: players connect only by uploading their own export, not by typing a username; the RSS feed only keeps the diary up to date. Ratings come only from diary entries. See [integrations/letterboxd.md](../integrations/letterboxd.md).
> - **Backend**: Supabase still runs the game and realtime, but ranking, learning and every outside call move to a recommendation server around it, and the app reaches Supabase only through an `api` schema. No Edge Functions. The server's language is open. See [architecture/recommendation-server.md](../architecture/recommendation-server.md).
> - **Data model**: the table list in [A faster foundation](#data-model) is replaced by [architecture/data-model.md](../architecture/data-model.md).
> - **Deck engine**: the taste weights, the slate, moods and the taste check in [A smarter deck](#a-smarter-deck) are replaced by [architecture/deck-engine.md](../architecture/deck-engine.md).
> - **Game rules**: the modes, match rules and finale are worked through in [game-modes.md](game-modes.md).
> - **Catalog and where to watch**: the refresh schedule, provider data and embeddings are in [integrations/tmdb.md](../integrations/tmdb.md); gte-small now runs on the recommendation server, not as Supabase's built-in model. [integrations/streaming-availability.md](../integrations/streaming-availability.md) compares where-to-watch sources. Streaming Availability is dropped from v1: the winner screen says where the film is, with no "Open in Netflix" links.
> - **App and onboarding**: how the Expo app is built is in [architecture/app-structure.md](../architecture/app-structure.md); the path from install to the first pick is in [onboarding.md](onboarding.md), which recommends web guests at launch.
> - **Running and launching**: [architecture/server-structure.md](../architecture/server-structure.md), [architecture/operations.md](../architecture/operations.md), [architecture/security.md](../architecture/security.md), [privacy.md](privacy.md), [analytics.md](analytics.md) and [store-listing.md](store-listing.md). Together they replace the publishing checklist below.
>
> Every decision since the report is in [decisions.md](../decisions.md).

## Contents

1. [Verdict](#verdict)
2. [What the old code does](#what-the-old-code-does)
3. [Letterboxd: what's possible](#letterboxd-whats-possible)
4. [Picking the stack](#picking-the-stack)
5. [A faster foundation](#a-faster-foundation)
6. [A smarter deck](#a-smarter-deck)
7. [Making it fun](#making-it-fun)
8. [Upgrading Expo and packages](#upgrading-expo-and-packages)
9. [Publishing checklist](#publishing-checklist)
10. [Roadmap](#roadmap)
11. [Decisions for you](#decisions-for-you)
12. [Sources](#sources)

## Verdict

The app (shipped as *FilmFlicker* in `app.json`) last changed in November 2024, the server in March 2024. This review reads both repositories line by line, checks what Letterboxd allows today, and lays out what to change so MovieMatch is fast, understands taste, and is fun enough to publish.

MovieMatch: Expo 51, 41 files. MovieMatchServer: FastAPI, 836 lines. Facts checked against live docs.

| Area | Verdict | Summary |
| --- | --- | --- |
| Letterboxd | **Feasible.** Yes, without the official API | The API is by application only and Letterboxd says it is not granting access to recommendation or personal projects. Public RSS feeds (checked: they carry TMDB IDs, star ratings and likes) plus each user's own data export cover what the game needs. |
| Speed | **Root cause found.** Slow by design, fixable by design | The server built every deck live: a streaming search, then one TMDB call and one OMDb call per new title, awaited one after another. A catalog kept in your own database turns deck building into a single query. |
| Suggestions | **Root cause found.** The deck was alphabetical | Saved cursors in `test.json` show results paged by title: "A Brush with Christmas", "A Rose for Christmas", "Alone in the Dark 2". Replace the genre roulette with group-aware scoring that learns from every swipe. |
| Stack | **7 SDKs behind.** Expo 58 + Supabase, TypeScript end to end | Keep Expo for the apps and the web join page, as a fresh SDK 58 project (React Native 0.88). Replace Firebase, MongoDB and FastAPI with one Supabase project: Postgres with vectors, realtime rooms, guest sign-in and scheduled jobs. |

## What the old code does

The concept already works end to end: a host creates a room, friends join with a PIN, everyone swipes the same queue, and a ranked list comes out. The problems are in how the queue is built, how state is shared, and how the game ends.

### How a game runs today

1. Player types a name and is signed in anonymously with Firebase.
2. The host picks Movies or Series and the streaming services. The country comes from the host's device region. Guests skip this step.
3. A Firestore document holds the lobby, keyed by a random 6-digit PIN.
4. Each player picks at least 2 genres. Picks are summed into a vote count per genre.
5. The last player to finish calls `/initialize`. The server builds 25 titles, then 50 more in the background.
6. Clients fetch pages of 25 cards. Likes are sent to the server in batches of 5.
7. The host ends the game. The server picks a stop card and everyone swipes until they reach it.
8. The playlist screen ranks titles by raw like count.

### Architecture today

2 databases, 3 external APIs in the game path.

| Lane | Path |
| --- | --- |
| Room state | Expo 51 app (RN 0.74, React Navigation 6) ⇄ Firestore (lobby, players, genre votes, game state) |
| Deck | Expo 51 app (axios) → FastAPI on Cloud Run (no auth) ⇄ MongoDB (rooms, likes, title cache) |
| Per title | Streaming Availability (RapidAPI search by genres) → TMDB (1 call per new title) → OMDb (1 call per new title, 10 s timeout) |

### Network calls before the first card can appear

- **Today, cold room**: at least 54 calls, one after another: 2 streaming searches, each followed by 13 TMDB and 13 OMDb calls.
- **Proposed**: 1 database query, 0 external calls.

`/initialize` waits for more than 25 new titles; each new title costs a TMDB call and an OMDb call inside a `for` loop (`routes/media.py:150-203`). Cached titles skip those calls, so warm rooms are faster, but every new genre combination starts cold.

### Findings

**Critical: The deck is built at request time, one call at a time.**
Every new title triggers awaited TMDB and OMDb calls in sequence. Nothing runs in parallel, and a single slow OMDb response can add 10 seconds.
`routes/media.py:150-203` · `routes/get_from_apis.py:43-95`

**Critical: Blocking database calls freeze the whole server.**
`pymongo` is synchronous, but it runs inside `async` handlers. While one room waits on Mongo, every other room waits too. `wait_for_task_completion` also polls Mongo once a second, and `get_media` does one query per card.
`config/mongo.py` · `routes/media.py:219-227, 285-290` · `main.py:15-20`

**Critical: Results come back in alphabetical order, with no quality floor.**
The search never sets a sort order, so each genre combination pages through titles A to Z. The cursors saved in `test.json` read "A Brush with Christmas", "A Shoe Addict's Christmas", "A Christmas Miracle for Daisy", "365 dni". There is no minimum rating or vote count.
`routes/get_from_apis.py:23-30` · `test.json`

**High: Genre roulette wastes calls and ignores taste.**
The server picks 2 to 4 voted genres at random and joins them with AND or OR. 25 of the 43 genre combinations saved in `test.json` had already run dry. TV-only genres (News, Reality, Talk Show) are offered in movie mode and make AND queries return nothing.
`routes/page_genres.py:75-146` · `utils/genresMap.js`

**High: The combinations formula is wrong.**
`factorial(n) // factorial(k) * factorial(n-k)` evaluates as (n!/k!)·(n−k)!. With 4 room genres it returns 24 instead of 6, so the "discover a new genre" fallback kicks in far later than intended.
`routes/media.py:125-126`

**High: Concurrent actions overwrite each other.**
Joining, genre votes and likes all read a document, change it in memory and write the whole thing back. Two players acting together lose one update. The likes task reads the room before taking its lock, so likes are lost even with the lock.
`contexts/UserContext.jsx:329-351` · `screens/GenresScreen.jsx:34-98` · `routes/media.py:296-320`

**High: There is no match moment, and no natural end.**
Nobody is told when everyone liked the same film. The host decides when to stop, the "final content" is just the next unseen card on the host's page, and the winner is a raw like count where ties are common. Up to 4 queued likes per player are lost if the app closes, because they only post in batches of 5.
`routes/media.py:366-381` · `screens/GameScreen.jsx:118-129, 179-199`

**Medium: Two sources of truth, synced by the client.**
Room state lives in Firestore and MongoDB at once. The genre screen sleeps 500 ms "to make sure the last player's data is updated" before starting the game.
`screens/GenresScreen.jsx:69-72`

**Medium: Only the host's services and country count.**
Guests never choose services, so a friend's Disney+ is ignored. The country is the host's phone region.
`screens/HomeScreen.jsx:152-163` · `contexts/UserContext.jsx:353-371`

**Medium: Heavy rendering on the swipe screen.**
Every fetched card is mapped to a `MovieCard` with its own `Modal`, and the array grows by 25 each page. Posters load from TMDB's `/original` size, which is full resolution.
`screens/GameScreen.jsx:249-267` · `components/MovieCardFront.jsx:25`

**Medium: Open endpoints.**
`GET /` returns every room. No server route checks who is calling. No Firestore security rules are in the repo. The OMDb key travels over plain `http`.
`routes/media.py:15-18` · `routes/get_from_apis.py:68`

**Medium: Rejoining a running game lands in the lobby.**
The join screen switches on the first word of `"joined playing"`, which is always "joined", so a reconnecting player is sent to the lobby, which only navigates onward on the genres state.
`components/home/Join.jsx:60-78`

**Low: Leftovers.**
`TestScreen` is still in navigation, `test.json` is committed, the Invite button has no action, `[loaded] = useFonts(...)` creates an implicit global, the server hard-codes English, and `@app.on_event` is deprecated in FastAPI.
`screens/Navigation.jsx` · `App.js:15` · `routes/media.py:36` · `main.py:10`

### Worth keeping

- The PIN join flow: short, familiar, works out loud across a couch.
- Tap-to-flip card with poster front and details back.
- Staatliches as the display face and the dark cinema palette.
- English and French translations, already structured with i18next.
- The gesture math in `MovieCard.jsx` (rotation, velocity throw, stacked scale).
- Per-country service lists, now sourced from TMDB's provider list instead of a 64,000-line JSON file.

## Letterboxd: what's possible

You can get most of the value without Letterboxd's API. Treat a Letterboxd username as a public handle, read the user's RSS feed for recent activity, and let them upload their own data export once for full history.

> Superseded in part: players now connect only by uploading their export. See [integrations/letterboxd.md](../integrations/letterboxd.md).

**The official API is not an option for this app today.** Letterboxd's API page says access is by application, applications are read but not individually answered, and it is not granting access for recommendation projects, LLM or GPT use, private or personal projects, or anything that recreates features of its paid tiers. Its terms of use also forbid bots and scrapers. Build the plan without the API and treat any future approval as a bonus.

### Ways to get a player's film history

| Source | What you get | Effort for the player | Status |
| --- | --- | --- | --- |
| Official API (OAuth) | Everything, including logging films back | One-tap sign in | Closed to recommendation and personal projects |
| Public RSS feed | Last ~50 diary entries with TMDB ID, rating, like, rewatch, watched date | Type a username | Works, checked on a live feed today |
| Data export (ZIP of CSVs) | Full history: watched, ratings, diary, watchlist, likes. Title, year and Letterboxd link per row, no TMDB ID | Export on the website, upload the file, about a minute | Works, you match titles to TMDB yourself |
| Scraping profile pages | Everything public | None | Don't: forbidden by the terms, Cloudflare blocking reported |
| TMDB account | Ratings, watchlist, favorites kept on TMDB | Approve access on TMDB | Official, but few people rate on TMDB |
| Trakt | Watch history and ratings | OAuth sign in | Uncertain: reports say new API apps need a paid account and free users can connect one app |
| In-app signals | Seen it, likes, nopes, matches, what the group watched | None | Yours, grows with every game |

### Fields in a Letterboxd RSS item

Verified on a public feed, 28 October 2026.

| Field | Holds |
| --- | --- |
| `tmdb:movieId` | TMDB ID, so no title matching is needed |
| `letterboxd:memberRating` | Star rating, present only when the entry is rated (40 of 50 in the feed checked) |
| `letterboxd:memberLike` | Whether the member hearted the film |
| `letterboxd:rewatch` | Rewatch flag |
| `letterboxd:watchedDate` | Date watched |
| `letterboxd:filmTitle`, `filmYear` | Title and year, for display and fallback matching |

The feed lives at `letterboxd.com/{username}/rss/`, holds about the 50 most recent diary entries, and only includes films logged in the diary. Ratings given without a diary entry don't appear, which is why the export matters for full history.

### Connect flow

> Superseded: see [Connecting](../integrations/letterboxd.md#connecting).

1. **Add your Letterboxd username.** The server fetches the feed and shows a preview ("Found 50 recent films, 41 rated"). It's public data, so treat it as a handle rather than a login.
2. **Import full history (optional).** A short guide points to Letterboxd's export (Settings, Data). The player picks the ZIP with the document picker; the app unzips it on the phone and sends only titles, years, ratings, dates, likes and watchlist flags.
3. **Match to TMDB.** Look up a shared mapping table first (Letterboxd link to TMDB ID), then search TMDB by title and year (±1 year). Store every new match so each film is resolved once for all users. List unmatched rows for a quick manual fix.
4. **Stay fresh.** Re-read the RSS feed when the player opens the app or joins a room, at most every few hours. Disconnecting deletes everything imported.

### What the data unlocks

- **Seen filter.** Skip films anyone in the room has logged. Room setting: "Hide anything someone has seen" or "Allow rewatches rated 4★ or higher".
- **Taste without questions.** Ratings and likes build a taste profile, so genre picking becomes optional.
- **Watchlist overlap.** Films on two or more players' watchlists get a boost, and a whole mode built on them.
- **Social proof on cards.** "On Sam's watchlist", "Jo gave the director's last film 4.5★".
- **Log it afterwards.** `letterboxd.com/tmdb/{id}` redirects to the film's page (checked: `/tmdb/550` opens Fight Club), so the winner screen can link straight to logging it.
- **Better cold start for friends.** One connected player already improves the whole room's deck.

### Ground rules

- Fetch feeds from the server, cache them, send conditional requests, and name the app in the User-Agent. A few requests per user per day is plenty.
- Store only what the game uses: TMDB ID, rating, liked, rewatch, watched date, watchlist flag, source. No review text.
- Ask for consent before importing, and offer export and deletion. Watch history is personal data under GDPR for EU players.
- Present it as "Import from Letterboxd". No Letterboxd logo or wording that suggests a partnership.
- If you still apply for API access, lead with what helps Letterboxd (sending people to log films and add to watchlists). The stated exclusions make approval unlikely, so nothing in the plan depends on it.

## Picking the stack

Nothing from the old stack stays by default. Each layer is chosen for what this game needs: rooms that react instantly, a catalog you can filter and rank in one query, guests who join from a link, and as few moving parts as possible for one developer.

> Superseded in part: a recommendation server now runs around Supabase. See [architecture/recommendation-server.md](../architecture/recommendation-server.md).

### What the stack has to do

- **Live rooms.** Presence, a vote that saves and checks for a match in one step, and the match pushed to every phone in well under a second.
- **One deck query.** Filter tens of thousands of titles by country, services, genres, runtime and "nobody here has seen it", then rank by taste.
- **Guests first.** Play without an account, keep the same identity when signing in with Apple or Google later.
- **Background work.** Nightly catalog refresh, embeddings and Letterboxd syncs, all off the game path.
- **Phones and a browser.** iOS and Android apps, plus a web page so a friend can join from a link.
- **Small to run.** One developer, low fixed cost, little to operate.

### The app: Expo stays, on its merits

| Option | Strengths | Costs |
| --- | --- | --- |
| **Expo (React Native), the pick** | One TypeScript codebase for iOS, Android and the web join page. Native-feeling swipes with Reanimated and Gesture Handler. EAS handles builds, store submission and over-the-air fixes. Your card and gesture code ports over. | Gestures on the web build need testing; native modules need development builds. |
| Flutter | Smooth custom UI from one codebase. | A full rewrite in Dart, and its web output is heavy for a page whose job is "tap a link, start swiping". |
| Swift + Kotlin | Best platform feel. | Two codebases for one developer, and no web guests. |
| Web app only | Anyone joins from a link, no install. | No store presence, weaker haptics and notifications on iPhone. |

### The backend: four complete options, each with Expo in front

| Need | Supabase | Convex | Cloudflare | Firebase, cleaned up |
| --- | --- | --- | --- | --- |
| Deck query | Strong. One SQL query with indexes, ranked with pgvector. | OK. Index scans merged in TypeScript; vector search returns at most 256 results, with equality filters only. | OK. SQL in D1 (SQLite), vectors in a separate Vectorize index, joined in code. | Weak. Several Firestore queries merged in code before ranking. |
| Live rooms | Strong. Presence and broadcast; the vote function saves, checks the match and broadcasts in one transaction. | Strong. Reactive queries push every change to every phone; writes are transactional. | Strongest. One Durable Object per room keeps state in memory, holds the WebSockets and runs timers. | OK. Snapshot listeners; match logic in Cloud Functions. |
| Guests now, accounts later | Strong. Anonymous sign-in; linking Apple or Google keeps the same user ID. | OK. Through Convex Auth or a provider such as Clerk. | Weak. Bring your own auth. | Strong. Anonymous auth with account linking. |
| Jobs and embeddings | Good. Cron, Queues, Edge Functions, built-in gte-small embeddings. | Good. Crons, scheduled functions, actions for outside calls. | Good. Cron Triggers, Queues, Workers AI. | OK. Scheduled Cloud Functions. |
| Moving parts | Few. One platform, one database. | Few. One platform. | More. Several products wired together. | Few, but the query model works against the deck. |
| Starting cost | $0 while building, $25/month Pro once testers rely on it. | Free tier, then $25 per developer per month. | Generous free tier, $5/month minimum on paid. | Free tier, then pay as you go. |
| Leaving later | Easy. It's Postgres. | Harder. Convex-specific data model and functions. | Medium. Workers-specific runtime. | Harder. Firestore data model. |

### Recommendation: Expo + Supabase, TypeScript end to end

Supabase is the only option where the hardest query in the app, the deck, is a single indexed SQL query with vector ranking inside it. It also brings presence, broadcast, guest sign-in, cron and functions in the same place. Because it's plain Postgres, leaving later means a database dump, not a rewrite. Convex is a close second if you'd rather write everything as reactive functions and model the catalog around its limits.

### The stack, layer by layer

| Layer | Choice |
| --- | --- |
| App | Expo SDK 58, Expo Router, TypeScript. Reanimated 4 and Gesture Handler for the card stack, expo-image for posters. |
| App state | TanStack Query for server data, a small Zustand store for the card stack. |
| Web guests | The same Expo Router screens exported for web (`/join/[code]`), on EAS Hosting or any static host. |
| Sign-in | Supabase Auth: anonymous for guests, Sign in with Apple and Google to keep history. |
| Database | Supabase Postgres with pgvector and row-level security on every table. |
| Live rooms | Supabase Realtime: presence for who's here, broadcast from the database for matches and progress. |
| Server logic | Postgres functions for join, vote and match, so they're transactional. TypeScript Edge Functions for outside calls (Letterboxd feeds, Streaming Availability, TMDB fallback) and deck refills. |
| Jobs | Supabase Cron and Queues for nightly catalog deltas in small batches. Edge Functions are built for short requests, so the first 40,000-title backfill runs once as a script from your machine or CI. |
| Embeddings | Supabase's built-in gte-small model (384 dimensions) to start, with no separate charge. Swap in a larger model later if taste matching needs it. |
| Movie data | TMDB for catalog, images and JustWatch provider data. Streaming Availability for the winner's deep links only. |
| Ship | EAS Build, Submit and Update. |
| Watch | Sentry for crashes, PostHog for product analytics. |

### What goes away

- Firebase Auth and Firestore
- MongoDB Atlas
- The FastAPI server on Cloud Run
- RapidAPI search and OMDb calls in the game loop
- The 64,000-line `countries.json` (TMDB lists providers per country)
- axios, react-native-dotenv and the Metro `.env` workaround

### Why TypeScript instead of Python for the engine

One language from the database types to the swipe screen. Supabase generates TypeScript types from the schema, Edge Functions run TypeScript, and the app shares those types, so a renamed column breaks the build instead of a live game. Python's machine-learning strengths matter little here: refilling a deck means scoring a few hundred titles for up to ten players, which Postgres and pgvector do directly. Keep Python only for a notebook to tune scoring weights on logged games.

> Reopened: with a trained recommender as the core of the product, the server's language is an open question. See [decisions.md](../decisions.md).

### Sizing on Supabase

About 40,000 movies with English and French text come to a few hundred megabytes, and their embeddings add roughly 60 MB (40,000 × 384 numbers × 4 bytes) before indexes. That fits easily in Pro's 8 GB but is tight in Free's 500 MB. Free projects also pause after a week without activity, so move to Pro ($25/month) when testers start relying on it. Pro includes 500 concurrent realtime connections and, each month, 5 million realtime messages, 2 million function calls and 100,000 active users.

### When to add a room server

Supabase Realtime is messaging: the database decides, and messages fan out. If the game grows timed rounds that must fire exactly on time, synced reveals, rapid live reactions, or hidden per-player queues managed on the server, give each room its own Cloudflare Durable Object. PartyServer, the successor to PartyKit, keeps this short. The object holds the room in memory, owns the WebSockets and runs timers, while Supabase keeps auth, catalog and history. Idle rooms hibernate and aren't billed for duration. Not needed for launch.

## A faster foundation

Do the slow work before anyone opens a room. Keep a catalog of titles and where to watch them in your own database, refreshed on a schedule, so starting a game is one query instead of a chain of API calls.

### Proposed architecture

1 database, external calls moved off the game path.

| Lane | Path |
| --- | --- |
| Nightly | Supabase Cron + Queues (nightly deltas in small batches) → TMDB (1 call per title: details, keywords, credits, certifications, trailer, watch providers) → catalog in Postgres (titles, availability by country, embeddings, image placeholders) |
| Live game | Expo 58 app (iOS, Android, web guests) ⇄ Supabase (auth, Postgres with row-level security, realtime presence and broadcast) ⇄ deck engine (SQL + edge function, scores and re-ranks) |
| On demand | Letterboxd RSS (per linked player, cached); Streaming Availability (winner only, for "Open in Netflix" deep links); TMDB (fallback for a title missing from the catalog) |

### The catalog

- **What to store.** The ~40,000 most popular movies to start (series later), using TMDB's popularity lists and daily ID exports. That covers nearly everything a group would actually pick.
- **One request per title.** TMDB's `append_to_response` returns details, keywords, credits, release certifications, videos and watch providers together.
- **Refresh rhythm.** Providers for popular titles daily, the long tail weekly, plus TMDB's changes feed for edits. At a polite 15 to 20 requests per second, the first full load takes about 35 to 45 minutes; TMDB documents a ceiling around 40 per second.
- **Precompute.** A quality score (rating weighted by vote count), a tiny image placeholder hash per poster, and one embedding per title for taste matching.
- **Ratings.** Show TMDB's score on the card, plus a group member's Letterboxd rating when someone in the room has rated the film. Drop OMDb entirely: no IMDb or Rotten Tomatoes scores, so there is no extra ratings API to pay for or keep in sync.
- **Deep links.** TMDB's provider link points to a TMDB page powered by JustWatch. Call Streaming Availability only for the winning title to get "Open in Netflix" links: one call per game instead of dozens per deck.

### Data model

> Superseded: the full design is [architecture/data-model.md](../architecture/data-model.md).

| Table | Holds |
| --- | --- |
| titles | TMDB ID, type, localized title and overview, year, runtime, genres, keywords, certifications by country, popularity, quality score, poster and placeholder, trailer key |
| title_availability | Title, country, provider, kind (subscription, free, ads, rent, buy), last checked |
| title_vectors | Title, embedding |
| profiles | Player, display name, avatar, country, own streaming services |
| linked_accounts | Player, source (Letterboxd), username, last sync, consent date |
| user_titles | Player, title, seen, rating, liked, on watchlist, source, date |
| rooms | Code, host, mode, country, settings (service rule, runtime cap, seen rule, quality floor), state, expiry |
| room_members | Room, player, joined at, calibrated, done |
| room_cards | Room, title, position, score, reason shown on the card |
| votes | Room, player, title, answer (nope, like, super like, seen it), time. One per player per title |
| matches | Room, title, kind (unanimous, majority, finale), time |

Votes go through one database function that inserts the row and checks the match rule in the same transaction, then broadcasts. That removes every read-modify-write race in the old code.

### Room lifecycle

1. **Lobby.** Presence shows who's here. Each player adds their own services; the room uses everything anyone has (you're watching on one screen), with an "everyone has it" option for long-distance watching.
2. **Calibrate.** Players without Letterboxd rate a handful of well-known films while waiting for friends.
3. **Swipe.** The deck streams from the engine. Votes save instantly; matches broadcast to everyone.
4. **Finale.** If no unanimous match arrives in time, the top picks go head to head.
5. **Done.** Winner, where to watch, share card, and later a "Did you watch it?" prompt that feeds the next game.

### Performance budget

| Step | Today (from the code) | Target |
| --- | --- | --- |
| Calls before the first card | At least 54 sequential external calls on a cold room | 1 database query, no external calls |
| Building a deck | Grows with every call; one slow OMDb request adds up to 10 s | Under 150 ms |
| Poster images | Full-resolution `/original` files | w500 or w780, disk-cached, placeholder hash, next 3 prefetched |
| Cards mounted | Every card fetched so far, each with a Modal | 3 at a time |
| Saving a like | Batched every 5 likes over REST, lost if the app closes | One row per swipe, optimistic, retried offline |
| Detecting a match | Not detected; the host ends the game | Under 300 ms after the deciding swipe |
| Places room state lives | Firestore and MongoDB | One database |

### On the phone

- expo-image for posters: memory and disk cache, placeholder while loading, prefetch of the next three.
- Keep only the top 3 cards mounted; the rest of the deck is plain data.
- Gestures stay on the UI thread with Reanimated 4 worklets; a haptic tick when a swipe crosses the commit line.
- The UI never waits on the network to show the next card. Votes queue and retry.
- Refill the deck when 15 cards remain, based on what the engine has learned, not on page numbers.
- Titles and overviews in the device language from the catalog (the server hard-codes English today).

## A smarter deck

> Superseded in detail: see [architecture/deck-engine.md](../architecture/deck-engine.md).

The old engine picks genre combinations at random and shows whatever the search returns, A to Z. The new one scores every eligible title for each player, combines those scores for the group, and keeps learning while people swipe.

1. **Eligible.** On the room's services in the room's country, right type and runtime, above the quality floor, not seen by anyone if that rule is on, certification suitable for Family mode.
2. **Player fit.** Score each title for each player from their taste profile, tonight's genre or mood picks, their watchlist and a popularity prior.
3. **Group score.** Combine player scores with "average without misery": the group average, after dropping titles anyone is predicted to dislike.
4. **Diversify.** Choose the opening cards with a diversity rule so the deck doesn't start with five superhero sequels. Keep about 1 card in 8 as a wildcard.
5. **Learn live.** Every swipe updates the room's model. Upcoming cards are re-ranked, and liked titles move into other players' next few cards.

### Taste profiles

**With Letterboxd.** Turn ratings into signed weights. Starting values to tune: 5★ = +1, 4★ = +0.6, 3★ = +0.1, 2★ = −0.5, 1★ or less = −1, a heart adds +0.3, logged without a rating = +0.2. The profile is the recency-weighted average of those films' embeddings, plus readable affinities (genres, decades, directors, languages) that power the "why this card" labels.

**Without Letterboxd.** Calibrate in the lobby while waiting for friends: 8 to 10 well-known films picked to split tastes (a horror, a romcom, an arthouse pick, a blockbuster, an animated film), each answered Love, Fine, Nope or Haven't seen. It takes about 30 seconds and replaces most genre picking. Genre and mood chips stay as a quick "tonight I want…" filter.

**Embeddings.** Build one short text per film (title, year, genres, top keywords, director, main cast, overview) and embed it once during ingest with a small open-source sentence-embedding model. Cosine similarity between a player's profile and a film gives their fit score. It's a one-off batch, with no per-game cost.

### Why the group step matters

Averaging scores lets one person's strong dislike get outvoted. Group recommender research names several ways to combine people's preferences; here they are on the same three players. Predicted fit is out of 5.

| Film | Alex | Sam | Jo | Average | Least misery | Average without misery |
| --- | --- | --- | --- | --- | --- | --- |
| Hereditary (2018) | 4.9 | 4.6 | 0.6 | 3.37 | 0.6 | dropped |
| Dune: Part Two (2024) | 4.7 | 4.3 | 2.1 | **3.70** | 2.1 | dropped |
| The Grand Budapest Hotel (2014) | 4.2 | 3.6 | 2.9 | 3.57 | 2.9 | **3.57** |
| Paddington 2 (2017) | 3.4 | 3.3 | 3.6 | 3.43 | **3.3** | 3.43 |

- **Average**: the highest average wins: Dune: Part Two. But Jo is predicted at 2.1, so one person sits through a film they don't want.
- **Least misery**: the film with the best worst score wins: Paddington 2. Nobody suffers, but the group is less excited than it could be.
- **Average without misery**: titles where anyone falls below 2.5 are dropped, then the highest average wins: The Grand Budapest Hotel. Everyone is fine with it, and the group is happier overall than with the safest pick.

Recommended default: average without misery, with the misery line around 2.5 out of 5. Use the Final Cut vote (below) to break near-ties.

### Learning during the game

- **Room model.** Start from the combined profiles. After each swipe, adjust weights on readable features (genre, decade, runtime band, language, top keywords) and nudge the room's taste vector toward liked films and away from noped ones.
- **Explore, then narrow.** Thompson sampling, or a simple 85/15 split, lets early cards test different directions and later cards focus on what the room agrees on.
- **Like propagation.** When one player likes a title, slot it into the next 2 to 4 cards of everyone who hasn't seen it. Matches need overlap, so this is the biggest single lever on time to match.
- **Shared opening.** Everyone sees the same first 10 cards in the same order, which creates early overlap. After that, order personalizes.
- **Fast exits.** If everyone nopes two films from the same genre quickly, drop that genre for the rest of the session.
- **Seen it is its own answer.** A swipe up records the film as seen (feeding the seen filter and the profile) without counting as a dislike.

```
group_score = average(player_fit) + 0.3 × watchlist_overlap + 0.2 × live_room_signal + 0.1 × quality
only when min(player_fit) ≥ misery_line
```

Weights are starting points. Log every swipe with the score that produced the card so you can tune them on real games.

### When is it a match?

> Superseded in detail: see [game-modes.md](game-modes.md#when-its-a-match).

| Players | Instant match when | Otherwise |
| --- | --- | --- |
| 2 | Both like it | Final Cut after 40 cards |
| 3 to 4 | Everyone likes it | Final Cut after 50 cards or 8 minutes |
| 5 to 10 | At least 70% like it and nobody used a super nope | Ranked vote among the top 4 |

Thresholds are starting values. Count only players currently present, so someone leaving doesn't block every match.

### Quality and trust

- **Quality floor.** By default require roughly 150+ TMDB votes and a weighted rating above about 6.2, which removes most of the filler the old deck surfaced. Toggles: "Hidden gems" (fewer votes, high rating) and "Guilty pleasures" (lower rating floor).
- **Say why.** A small label on each card: "Because you all liked Arrival", "On Sam and Jo's watchlists", "94 min", "Wildcard". Reasons make the deck feel smart and make yes easier.
- **Later: learn from your own games.** Once you have thousands of sessions, "people who liked X in a room also liked Y" improves scoring. Don't bootstrap with MovieLens or IMDb datasets in a commercial app: both licenses are non-commercial.

## Making it fun

The store already has many swipe-to-match movie apps. The fun comes from moments (the match, the near miss, the finale) and from finishing fast. Items marked **Launch** belong in the first public version.

### The match moment

- **"It's a match"** (Launch). Full-screen poster, haptic burst, everyone's avatar, where to watch and a Watch now button. The old app has no match moment at all.
- **Near-miss teasers** (Launch). "2 of 3 of you liked this" without saying who. Party mode only, off in Blind mode.
- **Recap card** (Launch). A shareable image: "Paddington 2 in 3 min 42 s, 3 people, 41 swipes", with an app link. Free marketing every movie night.

### Swiping

- **Four answers** (Launch). Nope, Like, Super like (1 or 2 per game), and Seen it (swipe up).
- **Undo** (Launch). The rewind button is already drawn in `GameScreen.jsx`, commented out.
- **Buttons too** (Launch). Like and Nope buttons with screen-reader labels, next to the gestures.
- **Richer card back** (Launch). Keep tap-to-flip. Add trailer link, runtime, director, main cast, and the room's services highlighted.

### Modes

- **Quick Match** (Launch). Ends at the first match. The default.
- **Final Cut** (Launch). After N cards, the top 3 or 4 face off. One veto per player, then a ranked vote.
- **Date Night** (Launch). Two players, tighter deck, "something neither of us has seen".
- **Watchlist Showdown** (Later). A deck built only from the overlap of players' Letterboxd watchlists.
- **Family** (Later). Certification filter by country from TMDB release data.
- **Pick for me** (Later). Solo mode from your own taste profile.

### Tonight's constraints

- **Time budget** (Launch). "We have 2 hours" becomes a runtime cap.
- **Mood chips** (Launch). Cozy, Mind-bending, Laugh, Scary, Background noise, mapped to genres, keywords and runtime.
- **Era and language** (Later). Decade range, original language, "subtitles are fine".

### Together

- **Live presence** (Launch). Avatars with a progress ring, "Sam is done", and rejoin after a dropped connection or app restart.
- **Reactions** (Launch). Quick emoji reactions that pop up on everyone's screen.
- **Crews and history** (Later). Saved groups with their settings, what they watched, and how often they agree.

### Joining and after

- **Links and QR** (Launch). Invite link like `/join/482913` and a QR code. The Invite button finally does something.
- **Web guests** (Later). Friends join from the browser without installing, using Expo Router's web build of the swipe screen.
- **Watch and log** (Launch). "Open in Netflix" deep link for the winner, and "Log on Letterboxd".

### What similar apps already do

From their store listings.

| App | What stands out |
| --- | --- |
| CineMatch | Group rooms, genre and rating filters, shared matches revealed automatically |
| MatchFlicks | Filters by your streaming services; swipe together, match automatically |
| ReelMatch | Swipe through trailers instead of posters; 15 swipes a day on the free plan |
| MatchMovie | Android, 6-digit room PINs, instant match alerts, TMDB data, no ads |
| Movie Night | Group rooms joined by QR code or manual code |
| LazyWatch | Group swiping with a place to talk afterwards |

### Where MovieMatch can stand out

Decks that know each player's taste from Letterboxd. Never showing a film someone has already seen. A defined finish (a match or the Final Cut) instead of open-ended swiping. Guests who join from a link. No daily swipe cap.

## Upgrading Expo and packages

| | From | To | Note |
| --- | --- | --- | --- |
| Expo SDK | 51 | 58 | Released 15 October 2026 |
| React Native | 0.74 | 0.88 | New Architecture only |
| React | 18.2 | 19.2 | Baseline since SDK 55 |

### Recommendation: start a fresh project and port

No `ios/` or `android/` folders are committed, so there's no native code to migrate. The client is about 20 screens and components, and their shape changes anyway (Expo Router, the new room flow, the new backend). Stepping through seven SDKs means seven upgrade guides, the Legacy to New Architecture switch, React Navigation to Expo Router, and Reanimated 3 to 4. Create the project with `npx create-expo-app --template default@sdk-58` and a development build: Expo Go for SDK 58 reaches the stores a few weeks after release. If a library you need isn't ready for 58, SDK 57 (React Native 0.86) is a safe fallback.

### Package by package

| Package | Now | Target | Notes |
| --- | --- | --- | --- |
| expo | ^51.0.38 | ^58.0.0 | Run `npx expo-doctor@latest` after every change |
| react-native | 0.74.5 | 0.88 | Strict TypeScript API by default; deep imports from `react-native/Libraries` are errors; InteractionManager and the Modal `animated` prop are removed |
| react | 18.2.0 | 19.2 | Set by the SDK |
| Architecture | Legacy (default in 51) | New Architecture | Legacy removed in SDK 55 |
| JS engine | Hermes | Hermes V1 | Default since SDK 56; its memory regression was fixed in SDK 57 |
| @react-navigation/* | 6.x | expo-router | File-based routes give invite deep links for free. Since SDK 56 Expo Router no longer depends on React Navigation |
| react-native-reanimated | ~3.10.1 | 4.x | Requires New Architecture; worklets live in react-native-worklets. Drop the manual Babel plugin line, the Expo preset handles it |
| react-native-gesture-handler | ~2.16.1 | SDK version | 2.32 bundled with SDK 57 |
| react-native-screens | 3.31.1 | SDK version | Install with `npx expo install` |
| react-native-safe-area-context | 4.10.5 | SDK version | SDK 58 asks for an update for iOS 27 scenes |
| react-native-svg | 15.2.0 | SDK version | |
| expo-blur | ~13.0.2 | SDK version | `experimentalBlurMethod` renamed `blurMethod` in SDK 55 |
| @react-native-community/blur | ^4.4.0 | Remove | Duplicates expo-blur |
| expo-localization | ~15.0.3 | SDK version | SDK 58 no longer forces right-to-left from the locale on iOS |
| expo-status-bar | ~1.12.1 | SDK version | Most styling props are no-ops under Android edge-to-edge |
| expo-updates | ~0.25.27 | SDK version | `eas update` requires `--environment` since SDK 55 |
| expo-insights | ~0.7.0 | Review | Pick one analytics path: Expo Observe (new in 58) or PostHog (EAS CLI has a setup command) |
| firebase | 10.7.1 | @supabase/supabase-js | Or Firebase 12 if you stay on Firebase |
| axios | ^1.6.7 | Remove | `expo/fetch` is the default fetch since SDK 56; add TanStack Query for caching |
| react-native-dotenv | ^3.4.9 | Remove | Use `EXPO_PUBLIC_` variables and EAS environment variables; delete the Metro `.env` hash hack and `resetCache: true` |
| async-storage | 1.23.1 | SDK version | Or expo-sqlite's key-value store |
| typescript | ~5.3.3 | 6.0 | Bumped in SDK 56; convert `.jsx` files as you port them |
| Babel extras | 5 packages | Remove | metro-react-native-babel-preset, @react-native/babel-preset, @react-native-community/cli, @types/react-native, @babel/plugin-transform-private-methods; babel-preset-expo covers them |
| New | none | Add | expo-image, expo-haptics, expo-linking, expo-sharing, expo-document-picker (Letterboxd ZIP), a small unzip library, @tanstack/react-query, zustand, @sentry/react-native, posthog-react-native, @expo/vector-icons if you use icons (no longer bundled since SDK 56) |

### Project configuration

- `main`: `node_modules/expo/AppEntry.js` → `expo-router/entry`, plus a `scheme` for links.
- `userInterfaceStyle` is `"light"` while the app is dark. Set `"dark"` or `"automatic"`.
- Runtime version policy `appVersion` → `fingerprint`, so OTA updates never reach an incompatible build.
- Android: edge-to-edge is mandatory (Android 16), R8 minify is on by default in SDK 58 release builds.
- iOS: minimum 16.4 since SDK 56; SDK 58 generates the scene life cycle at prebuild. You have no custom AppDelegate, so nothing to migrate.
- Tooling: Node 22.13+, 24.3+ or 26+. Builds for iOS 27 need Xcode 27, which EAS Build provides.

### Server side

With the recommended stack the FastAPI service retires: nightly ingest runs on Supabase Cron and Queues, and the engine lives in Postgres functions and Edge Functions. If you keep Python for ingest or embeddings, move to Python 3.13 and current FastAPI with a lifespan handler, use an async database driver, share one httpx client, run fan-out with `asyncio.gather` under a rate limiter, and log with structure instead of print.

## Publishing checklist

Tick items here as you go.

> Replaced: the Store items by the [release checklist](store-listing.md#release-checklist), privacy and account items by [privacy.md](privacy.md), security items by [security.md](../architecture/security.md). The load test is planned in [operations.md](../architecture/operations.md#load-test).

### Data and licensing

- [ ] TMDB notice and an approved TMDB logo in About: "This product uses the TMDB API but is not endorsed or certified by TMDB."
- [ ] JustWatch credited wherever streaming availability appears (TMDB requires it for provider data)
- [ ] TMDB commercial license if the app earns money (TMDB's API is free for non-commercial use)
- [ ] Streaming Availability plan sized for winner-only lookups
- [ ] No IMDb datasets or MovieLens data in a commercial build
- [ ] Letterboxd named only as a data source, no logo or partnership wording

### Privacy and accounts

- [ ] Privacy policy that covers imported watch history
- [ ] Consent before importing; export and delete on request (GDPR)
- [ ] In-app account deletion (App Store guideline 5.1.1(v))
- [ ] Sign in with Apple offered if Google sign-in is offered (guideline 4.8)
- [ ] App Privacy labels and Google Play Data safety form

### Security

- [ ] Row-level security on every table; no endpoint that lists rooms
- [ ] Rate limits on join attempts so 6-digit codes can't be guessed
- [ ] API keys only on the server, HTTPS everywhere

### Quality

- [ ] Crash reporting and funnel analytics (room created → first card → match)
- [ ] Rejoin after network drops and app restarts
- [ ] Buttons and screen-reader labels alongside every gesture
- [ ] English and French complete, including TMDB titles and overviews
- [ ] Load test with 50 rooms at once

### Store

- [ ] Final name, icon, screenshots and a short video of a match
- [ ] Universal links and Android App Links for invite URLs
- [ ] Age rating questionnaires
- [ ] Closed testing with 5 to 10 real friend groups

## Roadmap

Sizes are relative (S, M, L) for one developer. Each phase ends with something you can play.

1. **Groundwork (S).** Confirm the name and the stack. Contact TMDB about commercial terms if you plan to earn money. Send a Letterboxd API application as upside only. Create the SDK 58 project with Expo Router and port the Figma design tokens, fonts and components.
   *Done when* an empty app builds through EAS for iOS and Android.
2. **Catalog and rooms (M).** Ingest job and schema. Anonymous sign-in. Create and join by code, link and QR. Lobby presence. Deck query with filters and the quality floor. Votes, instant match, winner screen.
   *Done when* three phones on real data reach a match in under 2 minutes.
3. **Smarter deck (L).** Lobby calibration, embeddings and taste profiles, group scoring, like propagation, live re-ranking, "why this card" labels, Final Cut.
   *Done when* median time to first match beats phase 2 in playtests.
4. **Letterboxd (M).** Username and RSS sync, ZIP import with the shared TMDB mapping, seen filter, watchlist overlap, consent, export and delete.
   *Done when* a connected player never sees a film they've logged.
5. **Polish and launch (M).** Haptics, recap share card, trailers, deep links, onboarding, analytics, crash reporting, store listings, privacy policy, TestFlight and Play closed testing with real friend groups.
   *Done when* testers run real movie nights without help.
6. **After launch (ongoing).** Crews and history, series mode, web guests, signals from your own games, more languages.
   *Done when* crews come back on their own.

### Measure these from day one

| Metric | Why it matters |
| --- | --- |
| Time to first card | The old app's biggest complaint; should feel instant |
| Median time to first match | The core promise: decide fast |
| Rooms that end with a match | Whether the engine and match rules work |
| Swipes per match | Deck quality, independent of how fast people swipe |
| Guests who install | Growth from every movie night |
| Crews back within 30 days | Whether it became the way the group picks |

> Defined, with sources and targets, in [analytics.md](analytics.md#every-metric). "Crews back within 30 days" is measured as groups back within 30 days until crews exist.

## Decisions for you

As the report left them. Where each one stands now is in [decisions.md](../decisions.md).

- **Name.** `app.json` says FilmFlicker, the repo says MovieMatch, and the stores already list MatchMovie, Match Movie and similar names. Pick something distinctive before making store listings.
- **Stack.** Recommended: Expo + Supabase. Expo for the apps and the web join page, one Supabase project behind it, TypeScript everywhere. Convex is the runner-up if you prefer writing everything as reactive functions. Add a Cloudflare Durable Object per room only if the game outgrows plain realtime messaging.
- **Movies only at launch.** Decided: yes. Letterboxd data is film-only, and "seen it" is fuzzy for series. Series can come later as a mode. The Figma release screens are movies only.
- **Money.** A free app with an optional Pro tier (crews, history, extra modes) counts as commercial use under TMDB's terms and needs their license. Decide before launch so licensing isn't a surprise. The options are worked through in [monetization.md](monetization.md).

## Sources

- [Letterboxd API access](https://letterboxd.com/api-beta/): who can apply and the excluded uses
- [Letterboxd terms of use](https://letterboxd.com/legal/terms-of-use/): bots and scrapers
- [Letterboxd: importing your data](https://letterboxd.com/about/importing-data/): CSV format
- [lettarrboxd issue #37](https://github.com/ryanpag3/lettarrboxd/issues/37): reports of scraping blocks
- Expo [SDK 58](https://expo.dev/changelog/sdk-58), [57](https://expo.dev/changelog/sdk-57), [56](https://expo.dev/changelog/sdk-56), [55](https://expo.dev/changelog/sdk-55): versions and breaking changes
- [TMDB FAQ](https://developer.themoviedb.org/docs/faq): attribution and commercial use
- [TMDB watch providers](https://developer.themoviedb.org/reference/movie-watch-providers): JustWatch attribution
- [TMDB rate limiting](https://developer.themoviedb.org/docs/rate-limiting)
- [Supabase pricing](https://supabase.com/pricing): plan limits, free-project pausing
- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous): linking keeps the user ID
- [Supabase broadcast from database](https://supabase.com/blog/realtime-broadcast-from-database)
- [Supabase built-in embeddings](https://supabase.com/docs/guides/ai/quickstarts/generate-text-embeddings): gte-small, 384 dimensions
- [Convex limits](https://docs.convex.dev/production/state/limits) and [pricing](https://www.convex.dev/pricing): vector search caps
- [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): hibernation, free plan
- [PartyKit joins Cloudflare](https://blog.partykit.io/posts/partykit-is-joining-cloudflare/): PartyServer
- [Streaming Availability API](https://github.com/movieofthenight/streaming-availability-api): deep links per service
- [Trakt free-tier limits](https://alternativeto.net/news/2025/2/trakt-tv-has-set-stricter-limits-for-free-users-and-raised-vip-subscription-prices-by-100-/): secondary report
- Store listings: [CineMatch](https://play.google.com/store/apps/details?id=com.travisapps.cinematch), [MatchFlicks](https://play.google.com/store/apps/details?id=com.matchflicks.app&hl=en_US), [ReelMatch](https://reelmatch.app/), [MatchMovie](https://matchmovie.sadik.work/), [Movie Night](https://play.google.com/store/apps/details?id=by.levankou.kino&hl=en), [LazyWatch](https://www.lazywatch.app/blog/best-apps-to-pick-a-movie-with-friends)
- Checked directly on 28 October 2026: a public Letterboxd RSS feed (field names) and the `letterboxd.com/tmdb/550` redirect.

Based on harryviennot/MovieMatch (last commit 10 Nov 2024) and harryviennot/MovieMatchServer (last commit 6 Mar 2024). File references point to those commits.

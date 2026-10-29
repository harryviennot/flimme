# Recommendation server

The service around Supabase that chooses every card: it ranks decks, learns from swipes, Letterboxd ratings and global ratings, and makes every call to an outside service (TMDB, Letterboxd, Streaming Availability). Written in October 2026.

The split with Supabase is one rule: **Postgres decides the game, the server decides the deck.** Why, and what each side owns, is in the data model's [Who does what](data-model.md#who-does-what). The tables the server reads and writes are in the [data model](data-model.md), its own data in [`rec`](data-model.md#6-recommendation-data). Decisions and open questions (including the server's language) are in [decisions.md](../decisions.md).

## Contents

1. [Processes](#processes)
2. [The contract with the database](#the-contract-with-the-database)
3. [The algorithm, stage by stage](#the-algorithm-stage-by-stage)
4. [Letterboxd data](#letterboxd-data)
5. [Hosting](#hosting)

## Processes

One codebase, four processes, deployed together:

| Process | Triggered by | Does | Needs to be fast |
| --- | --- | --- | --- |
| deck worker | `deck_requests` queue | Start and refill: retrieval, ranking, `deal_cards` | Yes: well under a second, behind 15 cards of buffer |
| pipeline worker | the other 6 queues | Catalog ingest, embeddings, Letterboxd sync and matching, taste profiles, winner deep links, end-of-room work | No |
| HTTP API | Phones, with their Supabase access token | Letterboxd export upload (with the RSS check); account deletion | Request and response |
| trainer | Nightly | Rebuilds `rec.title_stats`, exports training data, trains and evaluates models, registers versions | No |

The server never needs Supabase Edge Functions; everything outside the database runs here.

> Catalog ingest and where-to-watch data are detailed in [tmdb.md](../integrations/tmdb.md) and [streaming-availability.md](../integrations/streaming-availability.md).

## The contract with the database

The server connects with its own login, granted the `app_server` role, through Supabase's connection pooler.

- **Reads** anything in `public` and `rec`.
- **Writes directly**: the catalog, taste profiles, room models, `rooms.stats`, film matches on `import_rows`, and everything in `rec`.
- **Writes Letterboxd data through three functions**: `internal.start_letterboxd_import` (link, consent, staged films, diary), `internal.finish_letterboxd_import` (after matching: per-film rows, diary folded in, next sync in 14 days) and `internal.apply_letterboxd_feed` (new entries, rating changes, gap detection, sync times).
- **Writes decks only through `internal.deal_cards(room, payload)`.** Under the room lock it adds cards to the pool, appends to each seat's deck or re-ranks it (keeping the next `keep` cards and any card moved up by a like), logs the request and every ranked card, clears the refill flag, and starts the game if the room was dealing. It returns `closed` if the room moved on, so a late answer is harmless.
- **Never writes** votes, matches, rounds or room state.
- **Consumes queues** with a visibility timeout: a message that isn't deleted after processing comes back, so a crashed worker loses nothing.
- **Broadcasts** through `internal.broadcast_room` when it has news for a room (deep links are ready, for example).

The payload `deal_cards` takes:

```json
{
  "request": {"kind": "refill", "model_version": "ranker-2026-11-03", "room_member_id": "…",
              "experiment": "launch-ranker", "variant": "b", "strategy": {"explore": 0.15},
              "candidates": 300, "latency_ms": 120},
  "pool":  [{"title_id": 812, "group_score": 4.1, "min_fit": 2.6, "fits": {"<seat>": 4.4},
             "source": "ranked", "reason_code": "watchlist_overlap",
             "reason_params": {"member_ids": ["…", "…"]}, "member_ratings": []}],
  "decks": [{"room_member_id": "…", "keep": 3,
             "cards": [{"title_id": 812, "source": "ranked", "score": 0.83,
                        "explore": false, "propensity": 0.85, "features": {"sim": 0.71, "tmdb": 7.8}}]}]
}
```

## The algorithm, stage by stage

> **The details are in [deck-engine.md](deck-engine.md):** how taste is built, the scoring formulas, freshness between games, moods, the deck builder, recipes per mode and every starting value. Where it differs from this section, it wins: moods are set by the host on the room rather than per seat, the variety rules apply to every deal rather than only the opening, and exploration falls from 20% in the warm-up to 5% at the end rather than staying at 1 card in 8.

**Signals**

| Kind | What | Where it lives |
| --- | --- | --- |
| Swipes | Like, super like, nope, seen it, undo, time on card, in the room and across every past game | `votes`, `swipe_log`, linked to profiles through seats |
| Player answers | Calibration (love, fine, nope), "Did you watch it?" | `user_titles` with source `calibration` or `app` |
| Letterboxd | Per diary entry: watched date, half-star rating (or none), rewatch, growing with every sync. Per film, from the export: watched (seen only) and on the watchlist | `letterboxd_entries`, `user_titles` with source `letterboxd` |
| Global | TMDB vote average and count (as `quality_score`), TMDB popularity, the app's own like rate per film and country | `titles`, `rec.title_stats` |
| Content | Embedding, genres, keywords, director, cast, decade, runtime, language | Catalog tables, `title_vectors` |
| Context | Tonight's moods and genres, time budget, group size, services, room mode | `room_members`, `rooms` |

**Stages**

1. **Retrieval (SQL, `internal.deck_candidates`)**: everything eligible tonight (services, country, time budget, quality floor, age cap, seen rule, dropped genres), each scored with the baseline: a per-seat fit from taste-profile similarity, then the plan's "average without misery" group score. Returns about 300 candidates with every seat's fit. It stays in SQL because it filters 40,000 films with indexes next to the data.
2. **Per-seat prediction (server)**: the chance each seat likes each candidate. Version 1 is the plan's hand-tuned formula; later versions are a trained ranker using the signals above, for example this player's ratings of similar films or of the director's other films, their swipe history by genre and decade, the film's TMDB score and in-app like rate.
3. **Group score (server)**: average without misery over the seat predictions, plus the watchlist overlap and live room terms.
4. **The slate (server)**: the shared opening of 10 with the diversity rule (at most 2 per main genre, 1 per collection), about 1 card in 8 as exploration with its propensity recorded, the reason labels.
5. **Learning during the game**: each refill recomputes `room_models` from the votes so far, drops genres the room rejected fast, and re-ranks everything after the 3 mounted cards. Like propagation stays in the database because it must happen inside the vote.
6. **Learning between games (trainer)**: joins `rec.request_items` to votes for labels, trains, evaluates offline (ranking quality, and how fast it would have reached a match), registers the model as `shadow`, then gives it a traffic share. Rooms are assigned to a variant at start and the assignment is logged on every request, so time to match, matches per room and swipes per match can be compared per variant.

## Letterboxd data

What the algorithm may and may not do with Letterboxd data is in [integrations/letterboxd.md](../integrations/letterboxd.md#using-the-data).

## Hosting

- Always-on processes (workers hold queue connections), so a container host with persistent machines rather than per-request serverless, in the same region as the Supabase project (the EU for French players).
- Secrets: the database login, TMDB and Streaming Availability keys, the Supabase service key only for account deletion (it calls Supabase's auth admin API).
- The HTTP API checks the phone's Supabase access token against the project's signing keys, so it needs no session of its own.

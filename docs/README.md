# Docs

Everything written about the MovieMatch revival: what we're building, how it works, and what has been decided.

## Start here

1. [Revival plan](product/revival-plan.md): why the old app was slow and dull, the stack, the catalog, the deck engine, game design, the publishing checklist and the roadmap.
2. [Decisions](decisions.md): what has been decided since, the defaults waiting for a yes, and the open questions.
3. [Data model](architecture/data-model.md): how the backend actually works.
4. [Deck engine](architecture/deck-engine.md): how every card is chosen.

## All docs

| Doc | Covers | Status |
| --- | --- | --- |
| **Product** | | |
| [revival-plan.md](product/revival-plan.md) | Audit of the old app and server, Letterboxd feasibility, the stack, the catalog, the deck engine, game design, the Expo upgrade, the publishing checklist, the roadmap | Snapshot of 28 Oct 2026. Superseded in parts, noted at the top |
| [monetization.md](product/monetization.md) | The family bet, kids' safety, free vs Host Pro, the hosting cap, affiliate payouts, break-even | Proposal, snapshot of 29 Oct 2026 |
| **Architecture** | | |
| [data-model.md](architecture/data-model.md) | Every table, how the game runs through them, the app's API, who sees what, realtime, queues, retention, where later features plug in | Draft for review |
| [schema.sql](architecture/schema.sql) | Reference DDL for the data model: tables, security, the api schema, game and Letterboxd functions | Draft, 120 checks pass on Postgres 16 |
| [recommendation-server.md](architecture/recommendation-server.md) | The server around Supabase: its processes, its contract with the database, the algorithm stage by stage, hosting | Draft for review |
| [deck-engine.md](architecture/deck-engine.md) | How every card is chosen: taste from Letterboxd, the taste check and past games; scoring for a player and the group; freshness between games; moods; how a game narrows; recipes per mode; the SQL fallback; logging and upgrades; starting values | Draft for review. Its data model changes aren't applied yet |
| **Integrations** | | |
| [letterboxd.md](integrations/letterboxd.md) | What Letterboxd allows, the export file format, connecting, the RSS check, syncing, storage, rules for using the data | Draft for review |
| **Decisions** | | |
| [decisions.md](decisions.md) | Decided, defaults, open, dropped | Kept up to date |
| **Archive** | | |
| [revival-plan-2026-10-28.html](archive/revival-plan-2026-10-28.html) | The original revival plan report, with its interactive checklist and group-scoring demo. Download and open in a browser | Frozen |

Outside the repo: the [design file in Figma](https://www.figma.com/design/v2ZGLbGmzZ7032V9AI5vWM) (release screens and design tokens).

## Where new docs go

| Folder | For | Examples to come |
| --- | --- | --- |
| `product/` | What we build and why: game design, modes, onboarding, pricing, the store listing | `game-modes.md`, `onboarding.md` |
| `architecture/` | How the system works: backend, app structure, the recommendation algorithm, operations | `app-structure.md`, `operations.md` |
| `integrations/` | One file per outside service: what it allows, how we call it, its rules | `tmdb.md`, `streaming-availability.md`, `revenuecat.md` |
| `decisions.md` | One line per decision or open question, linking to the doc with the details | |
| `archive/` | Frozen snapshots. Never edited | |

## Conventions

- One topic per file, with a lowercase, hyphenated name (`deck-engine.md`).
- Open each doc with a short paragraph: what it covers, when it was written, and links to the docs it builds on.
- When a doc replaces part of another, say so at the top of the old one and link forward rather than deleting it.
- Decisions and open questions go in [decisions.md](decisions.md), not scattered across docs.
- Diagrams in Mermaid; GitHub renders them.
- Add every new doc to the table above.

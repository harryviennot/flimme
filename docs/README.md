# Docs

Everything written about the MovieMatch revival: what we're building, how it works, and what has been decided.

## Start here

1. [Revival plan](product/revival-plan.md): why the old app was slow and dull, the stack, the catalog, the deck engine, game design, the publishing checklist and the roadmap.
2. [Decisions](decisions.md): what has been decided since, the defaults waiting for a yes, and the open questions.
3. [Data model](architecture/data-model.md): how the backend actually works.
4. [Deck engine](architecture/deck-engine.md): how every card is chosen.
5. [Game modes](product/game-modes.md): the rules of play, from the start to the night's pick.
6. [Roadmap](product/roadmap.md): every milestone and task, in the order to build them, with progress.

## All docs

| Doc | Covers | Status |
| --- | --- | --- |
| **Product** | | |
| [revival-plan.md](product/revival-plan.md) | Audit of the old app and server, Letterboxd feasibility, the stack, the catalog, the deck engine, game design, the Expo upgrade, the publishing checklist, the roadmap | Snapshot of 28 Oct 2026. Superseded in parts, noted at the top |
| [monetization.md](product/monetization.md) | The family bet, kids' safety, free vs Host Pro, the hosting cap, affiliate payouts, break-even | Proposal, snapshot of 29 Oct 2026 |
| [roadmap.md](product/roadmap.md) | Every step from an empty repo to launch and beyond: the first release's scope, 25 milestones with their status, and 245 tasks with dependencies and the docs to read | Kept up to date: tick tasks as they're done |
| [game-modes.md](product/game-modes.md) | The rules of play: modes, answers, match rules, presence, joining and leaving, Party and Blind, the finale, every way a game ends, the winner screen and "Did you watch it?", later modes, time to a pick, specs for the game functions still to write | Draft for review. Its data model changes aren't applied yet |
| [privacy.md](product/privacy.md) | Privacy and the legal ground: a data map with bases and retention, consents, analytics without a prompt, training across players, players' rights, children by market, Letterboxd and TMDB terms, processors and data locations, store privacy forms, privacy policy and terms outlines, questions for a lawyer | Draft for review; needs a lawyer's read before launch |
| [analytics.md](product/analytics.md) | How we know the app works: the questions, every metric defined once with its source and target, the PostHog event list, identity, consent and kids, funnels, first dashboards, reading A/B tests, PostHog's plan and EU hosting | Draft for review. Its data model changes aren't applied yet |
| [store-listing.md](product/store-listing.md) | Getting into the App Store and Google Play: choosing the name, developer accounts, store records, the listing in English and French, screenshots and video, age ratings, passing review, invite links, price and countries, the closed beta, a release checklist | Draft for review |
| [onboarding.md](product/onboarding.md) | From install or an invite link to the first pick, and coming back: first launch, joining by link, code or QR, hosting, the lobby and taste check, first-game hints, where Letterboxd is offered, when to ask for sign-in, permissions, empty and error states, Figma changes | Draft for review |
| **Architecture** | | |
| [data-model.md](architecture/data-model.md) | Every table, how the game runs through them, the app's API, who sees what, realtime, queues, retention, where later features plug in | Draft for review |
| [schema.sql](architecture/schema.sql) | Reference DDL for the data model: tables, security, the api schema, game and Letterboxd functions | Draft, 120 checks pass on Postgres 16 |
| [recommendation-server.md](architecture/recommendation-server.md) | The server around Supabase: its processes, its contract with the database, the algorithm stage by stage, hosting | Draft for review |
| [deck-engine.md](architecture/deck-engine.md) | How every card is chosen: taste from Letterboxd, the taste check and past games; scoring for a player and the group; freshness between games; moods; how a game narrows; recipes per mode; the SQL fallback; logging and upgrades; starting values | Draft for review. Its data model changes aren't applied yet |
| [server-structure.md](architecture/server-structure.md) | How the recommendation server's code is built: the language, folder layout, the four processes, the deck engine as modules, consuming queues safely, the database layer, the deck worker's latency budget, the HTTP API and token checks, configuration, local development, testing, hosting and deploys | Draft for review. Its backend changes aren't applied yet |
| [operations.md](architecture/operations.md) | How the system is run: environments, migrations, Supabase settings, secrets, CI, releasing and rollback, monitoring and alerts, backups, retention jobs, the load test, monthly costs, incidents | Draft for review. Its data model changes aren't applied yet |
| [security.md](architecture/security.md) | A defensive review before building: what we protect, the threat model, what schema.sql gets right and 12 gaps, Supabase settings, room codes and host powers, guest accounts, the HTTP API and Letterboxd uploads, secrets and logins, the app, kids on screen, deletion and export, logging, dependencies, a beta and launch checklist | Draft for review. Its schema changes aren't applied yet |
| [groundwork.md](architecture/groundwork.md) | Everything set up before the first feature: the monorepo, tools, the local stack, cloud sessions, CI and repository settings, accounts, every secret, and the app's foundations (structure, styling engine, tokens, components, consistency rules, motion, haptics and sound, the app shell) | Proposal for discussion, 29 Oct 2026 |
| [app-structure.md](architecture/app-structure.md) | How the Expo app is built: setup, routes and navigation, state, the api client and types, sign-in, realtime, the vote queue, the card stack, Letterboxd on the phone, invites and links, translations, analytics, testing, builds and updates, folder structure | Draft for review. Its backend changes aren't applied yet |
| **Design** | | |
| [design/components.md](design/components.md) | The Figma library's components as built in code, with the Figma's own description of each | Extracted 29 Oct 2026; the code is the source of truth |
| [design/figma-map.md](design/figma-map.md) | Node ids of every page, screen, component, poster and icon in the Figma file | Extracted 29 Oct 2026 |
| **Integrations** | | |
| [letterboxd.md](integrations/letterboxd.md) | What Letterboxd allows, the export file format, connecting, the RSS check, syncing, storage, rules for using the data | Draft for review |
| [tmdb.md](integrations/tmdb.md) | The catalog from TMDB: terms and the machine-learning clause, which films, one request per film, the daily availability sweep, services and variants, the refresh schedule, the first load, images, certifications, translations, embeddings, failures, countries at launch | Draft for review. Its data model changes aren't applied yet |
| [streaming-availability.md](integrations/streaming-availability.md) | Where-to-watch sources compared and the choice; Streaming Availability's data, terms and attribution; deep links and the last check on the winner screen; the staleness metric; service mapping; cost | Not used in v1: kept as the comparison of sources and a plan B |
| **Decisions** | | |
| [decisions.md](decisions.md) | Decided, defaults, open, dropped | Kept up to date |
| **Process** | | |
| [pipeline.md](pipeline.md) | How to run the agents: the one-time setup, the daily loop, a task, a slice, parallel tasks, calling an agent, reviewing and merging, feel checks and playtests, token use, troubleshooting, the first tasks | Kept up to date |
| [agent-workflow.md](agent-workflow.md) | How we build with agents: full stack or split, the agents and skills, how a task flows from brief to merge, slices for the first release, design and game feel, testing per layer, where agents run, tracking, guardrails, models and token budgets, a timeline to the beta | Proposal for discussion, 29 Oct 2026 |
| **Archive** | | |
| [revival-plan-2026-10-28.html](archive/revival-plan-2026-10-28.html) | The original revival plan report, with its interactive checklist and group-scoring demo. Download and open in a browser | Frozen |

Outside the repo: the [design file in Figma](https://www.figma.com/design/v2ZGLbGmzZ7032V9AI5vWM) (release screens and design tokens).

## Where new docs go

| Folder | For | Examples to come |
| --- | --- | --- |
| `product/` | What we build and why: game design, modes, onboarding, pricing, the store listing | `playtests.md` |
| `architecture/` | How the system works: backend, app structure, the recommendation algorithm, operations | `notifications.md` |
| `integrations/` | One file per outside service: what it allows, how we call it, its rules | `revenuecat.md` |
| `design/` | Specs extracted from the Figma and written by the designer agent: components, screens, moments | `screens/lobby.md`, `moments.md` |
| `decisions.md` | One line per decision or open question, linking to the doc with the details | |
| `archive/` | Frozen snapshots. Never edited | |

## Conventions

- One topic per file, with a lowercase, hyphenated name (`deck-engine.md`).
- Open each doc with a short paragraph: what it covers, when it was written, and links to the docs it builds on.
- When a doc replaces part of another, say so at the top of the old one and link forward rather than deleting it.
- Decisions and open questions go in [decisions.md](decisions.md), not scattered across docs.
- Diagrams in Mermaid; GitHub renders them.
- Add every new doc to the table above.

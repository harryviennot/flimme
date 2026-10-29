# movie-swipe-backend

Backend for the MovieMatch revival, in two parts:

- **Supabase** runs the game: Postgres with pgvector, Auth for guests and accounts, Realtime for rooms, Queues and Cron. The app reaches it only through the `api` schema.
- **The recommendation server** runs around it: it ranks every deck, learns from swipes, Letterboxd ratings and global ratings, and handles TMDB and Letterboxd.

## Docs

Everything is in [docs/](docs/README.md). The main ones:

- [Roadmap](docs/product/roadmap.md): every milestone and task, in order, with progress.
- [Revival plan](docs/product/revival-plan.md): the audit of the old app, the stack, the deck engine, game design and the original roadmap.
- [Decisions](docs/decisions.md): what's decided, what's waiting for a yes, what's open.
- [Data model](docs/architecture/data-model.md) and its [schema.sql](docs/architecture/schema.sql).
- [Recommendation server](docs/architecture/recommendation-server.md).
- [Deck engine](docs/architecture/deck-engine.md): how every card is chosen.
- [Letterboxd integration](docs/integrations/letterboxd.md).
- [Monetization options](docs/product/monetization.md).

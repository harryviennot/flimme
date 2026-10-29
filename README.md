# movie-swipe-backend

Backend for the MovieMatch revival, in two parts:

- **Supabase** runs the game: Postgres with pgvector, Auth for guests and accounts, Realtime for rooms, Queues and Cron. The app reaches it only through the `api` schema.
- **The recommendation server** runs around it: it ranks every deck, learns from swipes, Letterboxd ratings and global ratings, and handles TMDB, Letterboxd and Streaming Availability.

## Docs

- [Data model](docs/data-model/README.md): every table for the first release, the app's API, the contract with the recommendation server, how they all interact, and where later features plug in. Reference DDL in [schema.sql](docs/data-model/schema.sql).
- [Revival plan](docs/revival-plan/README.md): audit of the old app and server, stack choice, catalog, deck engine, game design, roadmap.
- [Monetization options](docs/monetization/README.md): free vs Host Pro, family modes, packs, kids' safety.

# Flimme

A group movie-picking game: friends join a room on their phones, swipe on films they can all watch, and get a pick in under 5 minutes. One repository for everything:

| Folder | What |
| --- | --- |
| [`mobile/`](mobile/) | The Expo SDK 58 app: Expo Router, Uniwind (Tailwind 4), Reanimated, the design system and its gallery |
| [`supabase/`](supabase/) | Supabase runs the game: config, migrations, pgTAP tests, the lite database for cloud sessions |
| [`server/`](server/) | The Python recommendation server: ranks decks, learns, makes every outside call (TMDB, Letterboxd) |
| [`packages/contract/`](packages/contract/) | Types and answers shared by the app and the bot players |
| [`tools/`](tools/) | `next`, `doc-section`, `check`, `typegen`, `roadmap-tick`, `check-links`, the cloud setup script |
| [`docs/`](docs/README.md) | Everything we know: product, architecture, integrations, design, decisions |
| [`.claude/`](.claude/) | The agents, skills and hooks that build it |

## Start here

- **The plan:** [docs/product/roadmap.md](docs/product/roadmap.md). What's ready to start: `node tools/next.mjs`.
- **What's decided:** [docs/decisions.md](docs/decisions.md).
- **How agents build it:** [docs/agent-workflow.md](docs/agent-workflow.md); how to run them day to day: [docs/pipeline.md](docs/pipeline.md).
- **What was set up and why:** [docs/architecture/groundwork.md](docs/architecture/groundwork.md).

## Setup

On a Mac with Xcode, Android Studio, a Docker runtime and [mise](https://mise.jdx.dev):

```bash
mise install        # Node, pnpm, Python, uv, the Supabase CLI, flyctl, gitleaks
mise run setup      # dependencies, .env.local files, the local Supabase stack, types
mise run check:all  # lint, types and tests for everything
mise run dev        # the local stack and Metro for the development builds
```

Cloud sessions use `tools/cloud-setup.sh` instead (see [docs/pipeline.md](docs/pipeline.md#5-cloud-sessions)).

# Flimme

A group movie-picking game: friends join a room on their phones, swipe on films they can all watch, and get a pick in under 5 minutes. France first, French and English. One developer (Harry) and a team of agents.

Everything we know is in `docs/` (index: docs/README.md). The plan is docs/product/roadmap.md; docs/decisions.md wins over any other doc. How agents work here: docs/agent-workflow.md. How to run the pipeline: docs/pipeline.md.

## Map

| Folder | What | Read first |
| --- | --- | --- |
| `mobile/` | The Expo SDK 58 app (Expo Router, Uniwind, Reanimated) | mobile/CLAUDE.md |
| `supabase/` | Migrations, pgTAP tests, the lite database for cloud sessions | supabase/CLAUDE.md |
| `server/` | The Python recommendation server | server/CLAUDE.md |
| `packages/contract/` | Types and answers shared by the app and the bot players | |
| `tools/` | `next`, `doc-section`, `check`, `typegen`, `roadmap-tick`, `check-links` | |
| `docs/` | Product, architecture, integrations, design | docs/README.md |

## How work happens

- One roadmap task, one branch, one pull request. Run a task with the `task` skill (`/task M4.8`); plan a feature with `/slice`.
- Agents: `planner`, `designer`, `game-designer`, `backend-dev`, `app-dev`, `reviewer`, `qa`, `scribe` (in .claude/agents/).
- **Read docs by section, never whole:** `node tools/doc-section.mjs docs/architecture/data-model.md#the-room` (`--toc` lists headings). Never read `docs/architecture/schema.sql` in full: grep it.
- **A choice nobody made stops the task.** Ask Harry; the answer goes in docs/decisions.md.
- If a doc turns out wrong, fix it in the same pull request and say so.

## Commands

| | |
| --- | --- |
| `node tools/next.mjs` | Tasks ready to start; `--task M4.8` for one in full |
| `mise run check` | Lint, types and tests for what this branch changed (the hooks run it too) |
| `mise run db:lite` / `db:lite:test` | The schema and pgTAP tests on plain Postgres (cloud sessions) |
| `mise run db:test` | pgTAP on the local Supabase stack (Mac, CI) |
| `mise run typegen` | Regenerate the `api` types after a schema change |
| `mise run tokens` | Regenerate the theme after changing `mobile/src/theme/tokens.json` |

## Rules nobody breaks

1. Postgres decides the game, the server decides the deck, the phone shows what they say.
2. The app reaches Supabase only through the `api` schema. An incompatible change ships as `_v2`.
3. Statuses are answers, not errors.
4. Every rule a doc states gets a test in the same pull request.
5. The phone never waits on the network to show the next card.
6. Nobody ever sees who noped a film; swipes never reach other phones while a game runs.
7. No TMDB data in git. No personal data in logs or analytics. No secrets anywhere in the repo.
8. Every visible string exists in French and English.
9. Migrations only add; mistakes are fixed forward. Never edit a merged migration, a generated file or `docs/archive/`.
10. Never skip, disable or delete a test to get green.

## Writing

Plain, short sentences. No em dashes or en dashes anywhere (docs, comments, copy, commits): use commas, colons or parentheses. Docs follow the conventions in docs/README.md.

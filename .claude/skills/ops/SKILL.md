---
name: ops
description: How environments, CI, deploys, builds and secrets work here (GitHub Actions, Supabase CLI and projects, Fly.io, EAS builds and updates, the cloud sessions' setup). Use when changing a workflow, a deploy, build profiles, environment variables or secrets, or when a task's type is ops.
---

# Operations

Background: docs/architecture/operations.md and docs/architecture/groundwork.md, by section.

## Environments

| | Local | Staging | Production |
| --- | --- | --- | --- |
| Supabase | `supabase start` (Docker) on the Mac; the lite Postgres in cloud sessions | Its own project, Paris | Pro project, Paris |
| Server | `uv run server <command>` | Fly.io, Paris | Fly.io, Paris |
| App | Development build (`.dev`) | Preview builds (`.preview`), EAS channel `preview` | Store builds, channel `production` |

## Releasing

Order: **database, then server, then app.** Each must work with the one before and after it. Staging deploys on every merge to main; production by hand (`production.yml`, Harry approves). Migrations fix forward; the server rolls back by redeploying the previous image; an app update rolls back with `eas update:rollback`.

## CI (.github/workflows/)

- `ci.yml`: path filters, then only the changed parts: mobile (`expo install --check`, tokens, translations, gallery, lint, types, Jest), server (ruff, pyright, pytest), database (lite Postgres now; the full local stack, Squawk and the types check once migrations exist), docs (links), the title, gitleaks.
- `roadmap.yml`: ticks the task in the merged pull request's title.
- To add (roadmap tasks): `staging.yml` and `production.yml` (M1.15, M2.12), `nightly.yml` (Maestro, bot game), `backup.yml` (M9.6).
- Actions get pinned to commit SHAs in M1.15; Dependabot keeps them current.
- Never put a secret in a workflow file. Pass untrusted text (titles, branch names) through `env:`, never inline `${{ }}` in `run:`.

## Builds and updates

- EAS profiles: development, preview, production; the runtime version uses the fingerprint policy, so an update never reaches a build it doesn't fit.
- JavaScript-only changes ship as EAS Updates; a changed fingerprint needs a build. The free plan has 15 builds per platform a month: daily development builds are made on the Mac (`npx expo run:ios`).
- `min_app_version` in `api.app_config` blocks builds below it.

## Secrets

The table is in docs/architecture/groundwork.md#secrets. Every secret starts in Harry's password manager; copies live in GitHub environments, EAS, Fly and Supabase. Agents never handle real secrets: they name the variable, Harry sets it.

## Commands

`mise run setup`, `mise run dev`, `mise run check`, `supabase db reset`, `supabase test db`, `npx eas-cli@latest build --profile preview`, `npx eas-cli@latest update --channel preview`, `fly deploy --config server/fly.staging.toml` (once M2.12 adds it).

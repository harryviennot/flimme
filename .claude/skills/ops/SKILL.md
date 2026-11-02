---
name: ops
description: How environments, CI, deploys, builds and secrets work here (GitHub Actions, Supabase CLI and projects, Fly.io, EAS builds and updates, the cloud sessions' setup). Use when changing a workflow, a deploy, build profiles, environment variables or secrets, or when a task's type is ops.
---

# Operations

Background: docs/architecture/operations.md and docs/architecture/groundwork.md, by section.

## Environments

| | Local | Staging | Production |
| --- | --- | --- | --- |
| Supabase | `supabase start` (Docker) on the Mac; the lite Postgres in cloud sessions | Its own project, Ireland | Its own project, Frankfurt |
| Server | `uv run server <command>` | Fly.io, London: `flimme-api-staging`, `flimme-workers-staging` | Fly.io, Frankfurt: `flimme-api-production`, `flimme-workers-production` |
| App | Development build (`.dev`) | Preview builds (`.preview`), EAS channel `preview` | Store builds, channel `production` |

Both Supabase projects are on the Free plan until M2.15 moves the organization to Pro: a project pauses after a week without activity (restore it from the dashboard) and the database is capped at 500 MB.

## Releasing

Order: **database, then server, then app.** Each must work with the one before and after it. Staging deploys on every merge to main; production by hand (`production.yml`, Harry approves). Migrations fix forward; the server rolls back by redeploying the previous image; an app update rolls back with `eas update:rollback`.

## CI (.github/workflows/)

- `ci.yml`: path filters, then only the changed parts: mobile (`expo install --check`, tokens, translations, gallery, lint, types, Jest), server (ruff, pyright, pytest), database (lite Postgres now; the full local stack, Squawk and the types check once migrations exist), docs (links), the title, gitleaks.
- `roadmap.yml`: ticks the task in the merged pull request's title, pushing to main with the `ROADMAP_DEPLOY_KEY` deploy key (the main ruleset lets deploy keys bypass it).
- `staging.yml` (merge touching migrations: link, `db push`, Data API smoke test) and `production.yml` (by hand, the `production` environment holds it for Harry's approval). M2.12 adds the server deploy to both.
- To add (roadmap tasks): `nightly.yml` (Maestro, bot game), `backup.yml` (M9.6).
- **Every `uses:` is a full commit SHA with a `# vX.Y.Z` comment**; every workflow sets top-level `permissions`. `node tools/check-ci.mjs pins` checks it (CI runs it). To add an action: `gh api repos/<owner>/<repo>/commits/<tag> -q .sha` (this follows annotated tags to the commit).
- A new migration must sort after every migration on main (`node tools/check-ci.mjs migration-order`), or `db push` stops the staging deploy.
- Never put a secret in a workflow file. Pass untrusted text (titles, branch names) through `env:`, never inline `${{ }}` in `run:`.

## Builds and updates

- EAS profiles: development, preview, production; the runtime version uses the fingerprint policy, so an update never reaches a build it doesn't fit.
- JavaScript-only changes ship as EAS Updates; a changed fingerprint needs a build. The free plan has 15 builds per platform a month: daily development builds are made on the Mac (`npx expo run:ios`).
- `mobile/eas.json`: each profile's `channel` and `environment` equal its name (a test checks it); `appVersionSource` is `remote` and only production auto-increments. The marketing version stays in `app.config.ts`.
- `APP_VARIANT` is an EAS environment variable per environment (`development`, `preview`, `production`). `app.config.ts` throws on any other value. A build and its updates must see the same value, because the app config counts in the fingerprint: always `eas update --channel <name> --environment <name>`.
- Variant icons (`icon-dev.png`, `icon-preview.png` and the Android foregrounds) are placeholders drawn by `mobile/scripts/make-variant-icons.swift` until M11.2.
- `min_app_version` in `api.app_config` blocks builds below it.

## Secrets

The table is in docs/architecture/groundwork.md#secrets. Every secret starts in Harry's password manager; copies live in GitHub environments, EAS, Fly and Supabase. Agents never handle real secrets: they name the variable, Harry sets it.

## Commands

`mise run setup`, `mise run dev`, `mise run check`, `supabase db reset`, `supabase test db`, `npx eas-cli@latest build --profile preview`, `npx eas-cli@latest update --channel preview`, `fly deploy --config server/fly.staging.toml` (once M2.12 adds it).

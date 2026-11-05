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
| Invite page | `docker build -f mobile/web.Dockerfile .` | Shares production's (Q18.3) | flimme.com on Harry's VPS with Dokploy (Traefik does TLS); DNS at OVH |

Both Supabase projects are on the Free plan until M2.15 moves the organization to Pro: a project pauses after a week without activity (restore it from the dashboard) and the database is capped at 500 MB.

## Releasing

Order: **database, then server, then app.** Each must work with the one before and after it. Staging deploys on every merge to main; production by hand (`production.yml`, Harry approves). Migrations fix forward; the server rolls back by redeploying the previous image; an app update rolls back with `eas update:rollback`.

## CI (.github/workflows/)

- `ci.yml`: path filters, then only the changed parts: mobile (`expo install --check`, tokens, translations, gallery, lint, types, Jest), server (ruff, pyright, pytest), database (lite Postgres now; the full local stack, Squawk and the types check once migrations exist), docs (links), the title, gitleaks.
- `roadmap.yml`: ticks the task in the merged pull request's title, pushing to main with the `ROADMAP_DEPLOY_KEY` deploy key (the main ruleset lets deploy keys bypass it).
- `staging.yml` (merge touching migrations: link, `db push`, Data API smoke test) and `production.yml` (by hand, the `production` environment holds it for Harry's approval). M2.12 adds the server deploy to both.
- The invite page (M4.18): `ci.yml`'s `web` job builds `mobile/web.Dockerfile`, runs it and checks it with `node tools/check-well-known.mjs http://localhost:8080 --allow-placeholders` (the files, the page, the redirects through a Host header), and fails if the container logged a request. `production.yml`'s `web` job calls Dokploy's `application.deploy` (`DOKPLOY_API_KEY` secret, `DOKPLOY_URL` and `DOKPLOY_APPLICATION_ID` variables) and retries `node tools/check-well-known.mjs https://flimme.com` for 10 minutes. Dokploy's auto-deploy and its Requests view stay off. `pnpm install` inside an image runs with `--ignore-scripts`: the root's `lefthook install` fails there.
- `backup.yml` (M9.6): the weekly encrypted dump to Tigris, skipped green with a warning until its settings exist; runbook in operations.md#backups-and-restore. To add (roadmap tasks): `nightly.yml` (Maestro, bot game).
- **Every `uses:` is a full commit SHA with a `# vX.Y.Z` comment**; every workflow sets top-level `permissions`. `node tools/check-ci.mjs pins` checks it (CI runs it). To add an action: `gh api repos/<owner>/<repo>/commits/<tag> -q .sha` (this follows annotated tags to the commit).
- A new migration must sort after every migration on main (`node tools/check-ci.mjs migration-order`), or `db push` stops the staging deploy.
- Never put a secret in a workflow file. Pass untrusted text (titles, branch names) through `env:`, never inline `${{ }}` in `run:`.

## Builds and updates

- EAS profiles: development, preview, production; the runtime version uses the fingerprint policy, so an update never reaches a build it doesn't fit.
- JavaScript-only changes ship as EAS Updates; a changed fingerprint needs a build. The free plan has 15 builds per platform a month: daily development builds are made on the Mac (`npx expo run:ios`).
- `mobile/eas.json`: each profile's `channel` and `environment` equal its name (a test checks it); `appVersionSource` is `remote` and only production auto-increments. The marketing version stays in `app.config.ts`.
- `APP_VARIANT` is an EAS environment variable per environment (`development`, `preview`, `production`). `app.config.ts` throws on any other value. A build and its updates must see the same value, because the app config counts in the fingerprint: always `eas update --channel <name> --environment <name>`.
- Preview delivery: `staging.yml`'s `app` job runs `tools/preview-update-plan.mjs` (`eas fingerprint:generate --environment preview`, then `eas build:list --fingerprint-hash`): a matching finished preview build means `eas update`, then `pnpm exec sentry-expo-upload-sourcemaps dist` with `APP_VARIANT=preview`; no match means no build, only a job summary. Builds start by hand from `preview-build.yml` (`eas build --no-wait`). Both call EAS through `EXPO_TOKEN`; the source maps need the `SENTRY_AUTH_TOKEN` GitHub secret (skipped with a warning without it).
- Variant icons (`icon-dev.png`, `icon-preview.png` and the Android foregrounds) are drawn by `mobile/scripts/make-app-icons.swift` from `assets/images/flimme-icon-1024.png` and `flimme-mascot.png`; production iOS uses `assets/flimme.icon` (Icon Composer). A new icon needs a new EAS build.
- `min_app_version` in `api.app_config` blocks builds below it.

## Secrets

The table is in docs/architecture/groundwork.md#secrets. Every secret starts in Harry's password manager; copies live in GitHub environments, EAS, Fly and Supabase. Agents never handle real secrets: they name the variable, Harry sets it.

One exception to the password manager: the server's four database logins. Harry runs `node tools/server-logins.mjs staging` (or `production`), which generates their passwords, sends Postgres only a SCRAM hash, tests each login and stages its URL on the right Fly app. The passwords exist only on Fly. It runs once per project after the migrations create the logins, after any restore, and to rotate; then both apps are redeployed. Agents never run it.

## Commands

`mise run setup`, `mise run dev`, `mise run check`, `supabase db reset`, `supabase test db`, `npx eas-cli@latest build --profile preview`, `npx eas-cli@latest update --channel preview`, `fly deploy --config server/fly.staging.toml` (once M2.12 adds it).

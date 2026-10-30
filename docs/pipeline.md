# Running the pipeline

How to run the agents day to day: the one-time setup, the daily loop, running a task, a slice or several tasks at once, reviewing and merging, feel checks and playtests, keeping token use down, what to do when something goes wrong, and the first tasks to run. Written on 29 October 2026, when the groundwork landed.

The design behind it is in [agent-workflow.md](agent-workflow.md) (the roster, sizes, the loop) and [groundwork.md](architecture/groundwork.md) (the repository, tools, CI and the app's foundations). This doc is the how-to.

## Contents

1. [What's in place](#whats-in-place)
2. [One-time setup](#one-time-setup)
3. [The daily loop](#the-daily-loop)
4. [Running one task](#running-one-task)
5. [Running a slice](#running-a-slice)
6. [Several tasks at once](#several-tasks-at-once)
7. [Calling an agent directly](#calling-an-agent-directly)
8. [Reviewing and merging](#reviewing-and-merging)
9. [Feel checks and playtests](#feel-checks-and-playtests)
10. [Keeping token use down](#keeping-token-use-down)
11. [When something goes wrong](#when-something-goes-wrong)
12. [Looking after the pipeline](#looking-after-the-pipeline)
13. [The first tasks to run](#the-first-tasks-to-run)

## What's in place

| Piece | Where | What it does |
| --- | --- | --- |
| Agents | `.claude/agents/` | `planner`, `designer`, `game-designer` (Opus), `backend-dev`, `app-dev`, `reviewer`, `qa` (Sonnet), `scribe` (Haiku) |
| Skills | `.claude/skills/` | Procedures (`task`, `slice`, `brief`, `review`, `playtest`, `feel-check`) and conventions (`supabase-sql`, `realtime-contract`, `python-server`, `expo-app`, `design-system`, `motion`, `copy`, `figma`, `privacy-and-kids`, `ops`) |
| Hooks | `.claude/hooks/` | Format every edited file; refuse edits to generated files, merged migrations, `.env` files and `docs/archive/`; run the checks before an agent stops with unpushed work |
| Settings | `.claude/settings.json` | Permissions, the hooks and the Expo plugin (turned on in step 3 below) |
| CLAUDE.md | Root, `mobile/`, `server/`, `supabase/` | What every session reads; the folder ones load only when an agent works there |
| Tools | `tools/` | `next` (what can start), `doc-section` (one section of a doc), `check` (the checks for what changed), `typegen`, `roadmap-tick`, `check-links`, `cloud-setup.sh` |
| CI | `.github/workflows/` | `ci.yml` checks only what a pull request changed; `roadmap.yml` ticks the task after a merge |
| The app | `mobile/` | Expo SDK 58 with Uniwind, the tokens from the Figma, the components and their gallery, every route stubbed |
| The database | `supabase/` | The CLI's config, pgTAP helpers and tests, the lite database for cloud sessions |
| The server | `server/` | The uv project, settings, the command line, `GET /healthz`, tests |

## One-time setup

### 1. Merge the groundwork

Two branches are waiting: `claude/agent-workflow` (the docs) and `claude/groundwork` (everything else, built on top of it). Open a pull request for each (or one for `claude/groundwork`, which contains both), read it, merge with a squash.

### 2. One repository on GitHub

1. Rename `movie-swipe-backend` to `flimme` (Settings, General, Repository name). GitHub keeps redirecting the old address. Locally: `git remote set-url origin git@github.com:harryviennot/flimme.git`.
2. Archive `movie-swipe-app` (Settings, Danger zone, Archive).
3. Turn on: Dependabot alerts and security updates (Settings, Code security); "Allow auto-merge" and "Automatically delete head branches" (Settings, General); squash merging only.
4. A ruleset for `main` (Settings, Rules, Rulesets): require a pull request, require the CI checks to pass (`changes`, `title`, `secrets`, and `mobile`, `server`, `database-lite`, `database`, `docs`: a job skipped by its path filter counts as passed), require branches to be up to date before merging, block force pushes. Add **GitHub Actions** to the bypass list so `roadmap.yml` can push the tick; without it, tick boxes by hand with `node tools/roadmap-tick.mjs M4.8` in the next pull request.
5. Environments `staging` and `production` (Settings, Environments), with "Required reviewers: Harry" on `production`. Their secrets come with M1.15.

### 3. Turn the settings on

The session that built the groundwork wasn't allowed to write `.claude/settings.json` itself: it grants agents permissions and runs hooks, so you decide. Read `.claude/settings.proposed.json`, change what you don't want, then rename it:

```bash
git mv .claude/settings.proposed.json .claude/settings.json
```

What it does: allows the check, test and read-only git commands without asking; refuses reading or editing `.env` files, deploying, submitting to the stores and force-pushing; turns on the three hooks; enables Expo's Claude Code plugin. Claude Code asks you to trust the folder once before the allow rules apply.

### 4. The Mac

1. Install Xcode (with an iOS simulator), Android Studio (with an emulator), [OrbStack](https://orbstack.dev) for Docker, and [mise](https://mise.jdx.dev).
2. In the repository: `mise install`, then `mise run setup` (dependencies, `.env.local` files, the local Supabase stack, types).
3. A development build on each phone: from `mobile/`, `npx expo run:ios --device` and `npx expo run:android --device`.
4. In Claude Code (`claude` from the repository's root): `/mcp` to sign in to Figma; `/plugin` to check the Expo plugin is on. Optional: Uniwind's own skill with `npx skills add uni-stack/uniwind`.
5. Check it all works: `mise run check:all`, then `mise run dev` and open the gallery from the app (`/dev/gallery`).

### 5. Cloud sessions

In claude.ai/code, edit the cloud environment (the environment menu in the session's title bar, then Edit):

- **Setup script:** `bash "$(find /home/user -maxdepth 3 -path '*/tools/cloud-setup.sh' | head -1)"`. It installs the dependencies and Postgres with pgTAP, then loads the lite database. It needs no secrets.
- **Network:** npm, PyPI and the Ubuntu package archive must be reachable (they are with the default policy).
- **Secrets:** none for now. Later, read-only tokens only (staging Supabase, PostHog), never production.

A new session then runs every check except the full Supabase stack and the simulators.

### 6. Your day-one list (M0)

Apple Developer enrolment (M0.3), Google Play account (M0.4), the TMDB email (M0.5), the service accounts with two-factor authentication (M0.6), a password manager, and a low-end Android phone if you don't have one. These take days of waiting, so they go first.

## The daily loop

About half an hour in the morning and a few minutes whenever a pull request is ready.

1. **See what can start:** `node tools/next.mjs` (or `--milestone M1`). Pick up to three tasks, following the [slices](agent-workflow.md#slices-for-the-first-release) and keeping one per lane (backend game, catalog server, app).
2. **Start each in a fresh session** with `/task <id>` (below). Cloud sessions for backend, server and app logic; the Mac for screens.
3. **Answer what comes back:** questions from briefs (each answer goes into decisions.md; you can tell the session "record it"), and a yes or no on large briefs.
4. **Review and merge** pull requests as CI turns green ([below](#reviewing-and-merging)).
5. **Feel checks** on your phones for UI pull requests, from the checklist in each.
6. **Once a week:** look at what the agents spent and where they got stuck, and adjust a skill ([Looking after the pipeline](#looking-after-the-pipeline)).

## Running one task

```
/task M1.10
```

In a fresh session (cloud, or `claude` on the Mac). The `task` skill then:

1. Reads the task with `tools/next.mjs --task`, stops if a need is open, creates the branch.
2. Sizes it if the roadmap line has no size (S, M or L).
3. Writes the brief (small tasks itself, others through the `planner`), and stops on any open question.
4. Gets a screen spec from the `designer` if a screen changes (and a beat from the `game-designer` for a signature moment).
5. **Large tasks wait for your yes on the brief.**
6. Writes the tests first, then the code.
7. Runs `mise run check` until it passes (the Stop hook insists).
8. Gets one review (`/code-review` for small tasks, the `reviewer` agent otherwise) and fixes what's blocking.
9. Pushes and opens the pull request: title `M1.10 <title>`, the brief and how it was tested in the body.

**In a cloud session**, ask for it the same way: "/task M1.10". To be told when CI or a review comes in, ask the session to watch the pull request; it fixes red CI by itself.

**Resuming:** a task's brief is kept in `.claude/state/briefs/<id>.md`, so a new session given the same `/task <id>` on the same branch carries on.

## Running a slice

```
/slice joining
```

or with ids: `/slice M4.1 M4.8 M4.14 M4.15`. The planner writes one plan for the whole feature (the shared contract, then a short brief per task), the designer and game designer write the specs it needs, and you get back the order, what can run in parallel, and the open questions. Then run its tasks with `/task` in that order: backend first, app on the merged contract.

## Several tasks at once

- **At most three at a time**, one per lane. More than that and the review queue becomes the bottleneck.
- **Never two tasks that touch the same SQL function or the same screen.** Each brief lists its SQL functions; a second migration replacing the same function would silently undo the first. The ruleset's "up to date before merging" makes CI run on what will actually land.
- **Cloud sessions** run in parallel by default: one per task.
- **On the Mac**, one worktree per task so sessions don't share a working copy: `git worktree add ../flimme-m4-8 -b m4-8-join-with-a-code origin/main`, then `claude` in that folder.

## Calling an agent directly

In any session, by name: "Use the designer agent to write the spec for screen 05 (join with a code)", "Ask the game-designer to simulate the match rules for 8 players", "Have the reviewer look at this branch at high effort", "Get the scribe to record this decision". Or run a whole session as one: `claude --agent backend-dev`.

| Agent | Ask it for |
| --- | --- |
| `planner` | A brief, a slice plan, sizing a milestone |
| `designer` | A screen spec, a new component's spec, a UI review from screenshots, a Figma update |
| `game-designer` | A moment's beat, a rules simulation, a playtest plan or write-up, tuning proposals |
| `backend-dev`, `app-dev` | A whole task in its own context |
| `reviewer` | A review of a branch against its brief |
| `qa` | Bot players, a Maestro flow, a staging bot game, triage of a failing end-to-end run |
| `scribe` | Recording decisions, fixing links, filling translation gaps, release notes |

## Reviewing and merging

For each pull request:

1. **CI is green**, and the title starts with the task id.
2. **Read the brief first** (it's the body), then check its numbered tests exist and test what they say. That's most of the review.
3. **Skim the diff** for anything outside the brief.
4. **UI:** look at the screenshots and run the feel check on both phones.
5. **Merge with a squash.** The roadmap Action ticks the task.

Merge everything yourself for the first two weeks. After that, small backend tasks may merge themselves once CI and the review pass: tell the session "auto-merge if green" and it turns on GitHub's auto-merge for that pull request.

## Feel checks and playtests

- **Feel checks:** every UI pull request ends with a checklist of five to eight lines (the `feel-check` skill). Run it on the iPhone and the low-end Android, tick it in the pull request, and comment on anything that feels wrong; the designer turns your notes into a spec change.
- **Playtests:** before one, ask the `game-designer` for the plan; after, give it your notes and the numbers and it writes up `docs/product/playtests.md` with proposed changes to the starting values. Changes you agree with go into decisions.md and become tasks.

## Keeping token use down

**Do:**

- One task per session; start a new session (or `/clear`) for the next one.
- Let the hooks and `mise run check` find formatting and test failures; they cost nothing.
- Point sessions at a section, not a doc: `node tools/doc-section.mjs <file>#<anchor>`.
- Keep implementation sessions on Sonnet (`/model sonnet`); the planner, designers and security reviews bring Opus in only where it's needed.
- Answer brief questions quickly: a stalled session waiting costs nothing, but a guess costs a rewrite.

**Don't:**

- Paste whole docs or the Figma into a session.
- Ask for several reviewers on one pull request.
- Let an agent loop on screenshots; judge feel on the phone.
- Use multi-agent workflows for everyday tasks; keep them for big one-off jobs (sizing the roadmap, writing all the screen specs).

**Measure:** for the first two weeks, note each task's token use in its pull request (Claude Code shows the session's usage). Rough targets: an S task under about 100,000 tokens, an M about 200,000 to 300,000, an L up to about a million, mostly cached. A task far above its target points at a skill or a brief to improve.

## When something goes wrong

| Problem | What to do |
| --- | --- |
| The Stop hook keeps the agent fixing | It gives up after three failed rounds. If the failure isn't the agent's (a broken main, a flaky test), say so and start the session with `CLAUDE_SKIP_STOP_CHECK=1` |
| CI is red on main itself | Fix main first, in its own pull request; every other pull request waits |
| Two migrations changed the same function | The later merge undid the earlier change. Write a new migration that has both, with tests for both |
| A brief turned out wrong | Stop the task, fix the brief (and the doc if it was the doc's fault), restart from the build step |
| The agent asks about something already decided | decisions.md is missing it: have the scribe record it |
| A cloud session can't run the database tests | Check the setup script ran (the session's first output); `mise run db:lite` by hand shows the error |
| The local stack won't start on the Mac | `supabase stop --no-backup`, then `mise run setup` again |
| Types out of date in CI | `mise run typegen` with the local stack running, and commit the file |
| A component looks different on one screen | That's a review miss: add a variant to the component, never restyle it on the screen |

## Looking after the pipeline

- **Skills are the pipeline's memory.** When a task sets or changes a convention, its pull request updates the skill. When an agent gets something wrong twice, the fix is a line in a skill, not a longer prompt next time.
- **Weekly:** read the slowest or most expensive pull request of the week and ask why. Usually a brief was too thin or a doc section too long.
- **New agent or skill:** only when a job keeps coming back and doesn't fit an existing one. Add it to the tables here and in agent-workflow.md.
- **Models:** the agents' `model` and `effort` lines are in their files. Try a cheaper model on an agent for a week before keeping the change.

## The first tasks to run

What the groundwork built, and what's left before its roadmap tasks are ticked (tick them by hand with `node tools/roadmap-tick.mjs <ids>` once done):

| Task | Built and checked here | Left to do |
| --- | --- | --- |
| M0.10 One repository | The layout, mise, pnpm workspaces, lefthook, editor settings | Rename and archive on GitHub (step 2); `mise run check:all` on the Mac |
| M0.11 The agent setup | 8 agents, 16 skills, 3 hooks (each tested), 4 CLAUDE.md files, `.mcp.json` | Turn the settings on (step 3); run a first small task through `/task` |
| M1.3 The Supabase folder | `config.toml` from the CLI's own template (2.122), `seed.sql` placeholder | `supabase start` on the Mac |
| M1.16 The lite database and pgTAP helpers | `schema.sql` loads on Postgres 16 with stand-ins; 26 checks pass | The same tests with `supabase test db` on the Mac |
| M2.1 The server skeleton | uv project, settings, commands, `GET /healthz`, 16 tests, ruff and pyright clean, Dockerfile | `docker build`, and CI's first run |
| M3.1 The Expo project | SDK 58, Expo Router, TypeScript, ESLint, Jest; the iOS bundle compiles | A development build on both phones |
| M3.3 App CI | The `mobile` job in `ci.yml` | The ruleset (step 2) so a failing test blocks a merge |
| M3.4 Tokens, fonts, icons | `tokens.json` from the Figma, the generated theme, `tokens.ts` and icon map, the three fonts | Every type style checked on both phones |
| M3.8 Translations | i18next, French and English, typed keys, plurals, the key check; tests pass | Switching the phone's language switches the app |
| M3.13 Components and gallery | The Figma library's 20 components and 11 more built from its tokens, each with its gallery entry, checked against the Figma on the web build | The gallery on both phones against the Figma |
| M3.14 Motion, haptics, sound | Motion tokens, the haptic vocabulary, the sound helper, the gallery's motion section | Feel each on a phone; the sound files are M6.24 |
| M3.15 The app shell | Providers, fonts, the error screen, every route stubbed, the room layout, server time | The dev menu; `api.app_config` at launch comes with M3.10 |
| M3.16 Consistency checks | Lint for theme classes, arbitrary values, raw colors and type, primitives, tiers, strings; the gallery check. Each fails on a bad example | Nothing: tick it once merged |
| M3.12 The card stack spike | | On the low-end Android; it also confirms Uniwind |

Then, in this order (each with `/task`):

1. **Harry, day one:** M0.3, M0.4, M0.5, M0.6, then finish M0.1 (the name is Flimme; the trademark search and the handles are left) and M0.2 (buy the domain).
2. **The game designer:** the rules simulation for M0.7, then you confirm M0.7 and M0.8.
3. **The planner:** size every first-release task in one run ("Use the planner to size M0 to M13 and write the sizes into the roadmap").
4. **Lane A, backend:** M1.4 (the 120 checks as pgTAP, large), M1.5 (the baseline migration), then M1.6 to M1.14.
5. **Lane C, app:** M3.12 (the spike, with you on the Android), M3.2, M3.3, M3.5 to M3.10.
6. **Lane B, server:** M2.2, M2.3, then the catalog (M2.4 waits for M1.5).
7. **The designer, in parallel:** screen specs for slices 4 to 7 (first launch, hosting, joining, the lobby), so M4's app tasks can start the day their backend lands.

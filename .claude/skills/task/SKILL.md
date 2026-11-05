---
name: task
description: Run one roadmap task end to end, from reading it to an open pull request. Use whenever asked to do, start, continue or finish a roadmap task such as "M4.8", or when invoked as /task M4.8.
argument-hint: <task id, e.g. M4.8>
---

# Run a roadmap task

Task: $ARGUMENTS

The loop is in docs/agent-workflow.md#how-a-task-flows. Follow these steps in order.

## 1. Read the task, not the docs

- `node tools/next.mjs --task <id>` prints the title, type, size, needs, linked docs and "Done when".
- **Blocked** (a need is open): stop and say which.
- **Harry's types** (decision, legal, publishing, product, or a Figma edit): draft what helps (a comparison, an email, a checklist), then stop. Don't decide for him.
- Branch from an up-to-date main: `git fetch origin main && git switch -c m4-8-join-with-a-code origin/main` (task id with dashes, then a few words).
- If `.claude/state/briefs/<id>.md` exists, a slice plan or a previous session wrote it: read it and continue from there, with no new planner.

## 2. Size it, if the roadmap line has no size

| Size | Means | Ceremony |
| --- | --- | --- |
| S | One function or one component; the rules sit in one doc section | No planner, `/code-review` |
| M | A function with several rules, or a screen with its states | Planner brief, reviewer agent |
| L | Game logic, concurrency, access rules across tables, the signature screens (swipe, match, Final Cut) | Brief approved by Harry, spec, reviewer at high effort, feel check |

When unsure, size up.

## 3. The brief

- **S:** write it yourself from the roadmap line and its one linked section (`node tools/doc-section.mjs <link>`), using the template in the `brief` skill. Five lines is fine.
- **M and L:** spawn the `planner` agent: "Brief roadmap task <id>." It writes the brief itself and answers with the path, the size and any questions.
- Either way the brief lives in `.claude/state/briefs/<id>.md` (git-ignored), so a later session can pick the task up.
- **Questions in the brief stop the task.** Ask Harry, write the answers into docs/decisions.md, then continue.

## 4. The screen spec (tasks that change a screen)

- Look for `docs/design/screens/<screen>.md`. If it's missing, or the brief changes the screen, spawn the `designer` agent to write or update it.
- Signature moments (the swipe, "Shuffling", the near miss, the flip, the match, the Final Cut, the reveal, the winner and recap): the `game-designer` agent writes the beat first, then the designer writes the feel.

## 5. Approval (L only)

Show Harry the brief and the spec, and wait for a yes before writing code.

## 6. Build

- Load the layer's skill: `supabase-sql` (and `realtime-contract`) for SQL, `python-server` for the server, `expo-app` with `design-system` (and `motion` for anything that moves) for the app.
- **Tests first.** Write the brief's tests, run them, see them fail, then write the code.
- Read code with Grep and Read. Read docs only by section, and not the ones the brief already quotes.
- **Stay inside the brief.** Something broken outside it goes in the pull request's notes, not in this diff, unless it blocks the task.
- Never edit generated files (types, theme), merged migrations, `docs/archive/` or `.env` files; a hook refuses it anyway.

## 7. Check

`mise run check` until it passes. The Stop hook runs it too and won't let you finish red. Never skip, disable or delete a test to get green.

**App tasks: try it by touch on the simulator, before review.** Unit tests don't catch what people actually do: on 3 Nov 2026 Harry found most of slice 6 and 7's bugs this way on his phone, after their tests had passed. Run the change on an iPhone simulator with Maestro (`mobile/.maestro/`). Always run the brief's path first. Then the explore pass depends on the size and the kind of change:

- **S tasks and small fixes:** the brief's path, plus only the explore items below that the change can affect. A copy or layout change gets the largest text size and a small screen. A change to a gesture gets the swipe back and double taps. Name the items you skipped and why in the pull request.
- **M tasks:** the brief's path, plus the explore items for every screen the change touches.
- **L tasks and signature screens** (the swipe, the match, the Final Cut, the reveal, the winner, and any new screen): the full explore pass, every item on every screen touched.

In every case, no app pull request merges without a touch run, and a bug you find is fixed in this task. The explore items, for reference:

- swipe back from the left edge, and Android's back button, on every screen;
- double taps, and opening the same link twice;
- background and foreground, and a cold start from a link;
- offline, and a call that fails;
- the smallest screen and the largest text size;
- odd data: a long name, the full service list, a missing avatar, an empty list.

Point the simulator at staging unless the task needs SQL that hasn't merged yet, or the HTTP API (account deletion) isn't deployed there (then use the local stack and `uv run server api --port <free port>` with `SUPABASE_SECRET_KEY` set to the local secret key), since other agents reset the local Supabase for their tests. A worktree has no `mobile/.env.local`, so start Metro with `EXPO_PUBLIC_STAGING_SUPABASE_URL`, `EXPO_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_STAGING_SERVER_URL` (`https://flimme-api-staging.fly.dev`) in its environment (the session that started you gives the values; the key is the public one; staging stays switched off in the dev menu without all three), then switch the dev menu to Staging. That Metro also needs placeholder `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_SERVER_URL` (any value, for example `http://127.0.0.1:54321`), or the app throws "EXPO_PUBLIC_SUPABASE_URL is missing" on start. A simulator in the en_US region shows "Not in your country yet", so set its region to France. Extra players come cheap: sign them up with curl on staging (`/auth/v1/signup`, then `api.update_profile`, `api.join_room` and `api.cast_vote` with `Content-Profile: api`). `api.start_game` needs two present members, so a curl host calls `api.touch_room` first. A curl guest sends no Realtime presence, so anything that shows presence needs a second simulator. Put what you tried and its screenshots in the pull request's "How it was tested". A bug you find is fixed in this task. If the simulator can't run, say so plainly in your hand-back and don't turn on auto-merge: the task isn't done.

## 8. Review

- **S:** `/code-review` at medium effort.
- **M and L:** spawn the `reviewer` agent in the foreground (`run_in_background: false`), since the next step needs its report: "Review roadmap task <id>; the brief is in .claude/state/briefs/<id>.md." For access rules, security definer functions or game rules, pass `effort: "high"` in the Agent call: writing "at high effort" in the prompt changes nothing.
- Never start the reviewer in the background and poll for it, and never hand back before it has reported.
- Fix blocking findings. Take a nit only if it's trivial. One round; after fixing, re-check only the fixes.

## 9. Pull request

- **Merge-ready first.** Main must be merged in before GitHub will merge the pull request, and a branch that's behind costs a second CI run and someone else's time. So, last thing before pushing: `git fetch origin main && git merge origin/main`, give your migration a fresh timestamp if main gained one after it (`supabase-sql`, "Sort last before you push"), then run `mise run check` again on the merged result (for SQL, after a fresh `supabase db reset`).
- Commits say why, not what. Push with `git push -u origin <branch>`.
- Title: `<id> <roadmap title>` (CI checks it). Body: the pull request template, filled from the brief, plus "How it was tested" with each command and its result.
- UI tasks: attach the screenshots and the feel checklist, and tell Harry a feel check is waiting.
- **If you were told the pull request may merge itself** (Harry said so to the session that started you), turn on auto-merge with `gh pr merge <n> --auto --squash` and finish. An app task only after its touch run (step 7). Don't wait for CI: GitHub merges once it passes. Otherwise leave the merge to Harry.
- Don't tick the roadmap: an Action does it after the merge.

## 10. Before you finish

- A doc that turned out wrong is fixed in this pull request, and the body says so.
- A convention you set or changed goes into its skill in the same pull request.
- Delete `.claude/state/briefs/<id>.md` once the pull request is open.

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
- If `.claude/state/briefs/<id>.md` exists, a previous session started this task: read it and continue from where it stopped.

## 2. Size it, if the roadmap line has no size

| Size | Means | Ceremony |
| --- | --- | --- |
| S | One function or one component; the rules sit in one doc section | No planner, `/code-review` |
| M | A function with several rules, or a screen with its states | Planner brief, reviewer agent |
| L | Game logic, concurrency, access rules across tables, the signature screens (swipe, match, Final Cut) | Brief approved by Harry, spec, reviewer at high effort, feel check |

When unsure, size up.

## 3. The brief

- **S:** write it yourself from the roadmap line and its one linked section (`node tools/doc-section.mjs <link>`), using the template in the `brief` skill. Five lines is fine.
- **M and L:** spawn the `planner` agent: "Brief roadmap task <id>." It returns the brief.
- Save it to `.claude/state/briefs/<id>.md` (git-ignored) so a later session can pick the task up.
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

## 8. Review

- **S:** `/code-review` at medium effort.
- **M and L:** spawn the `reviewer` agent: "Review roadmap task <id>; the brief is in .claude/state/briefs/<id>.md." For access rules, security definer functions or game rules, add "at high effort".
- Fix blocking findings. Take a nit only if it's trivial. One round; after fixing, re-check only the fixes.

## 9. Pull request

- Commits say why, not what. Push with `git push -u origin <branch>`.
- Title: `<id> <roadmap title>` (CI checks it). Body: the pull request template, filled from the brief, plus "How it was tested" with each command and its result.
- UI tasks: attach the screenshots and the feel checklist, and tell Harry a feel check is waiting.
- Don't tick the roadmap: an Action does it after the merge.

## 10. Before you finish

- A doc that turned out wrong is fixed in this pull request, and the body says so.
- A convention you set or changed goes into its skill in the same pull request.
- Delete `.claude/state/briefs/<id>.md` once the pull request is open.

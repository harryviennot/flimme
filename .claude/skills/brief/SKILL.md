---
name: brief
description: How to write the brief for a roadmap task or a feature slice from the roadmap, decisions.md and the docs. Use when writing or updating a brief or a slice plan; the planner agent always uses it.
---

# Writing a brief

The brief is the only thing the implementer and the reviewer read, so it carries every rule they need. The docs are read once, here.

## Reading

1. `node tools/next.mjs --task <id>`: the task line, its needs and its linked sections.
2. Each linked section, and only that: `node tools/doc-section.mjs <link>`. Roadmap links are relative to `docs/product/`; the tool resolves them. `--toc` lists a doc's headings when you need a neighbouring section.
3. `docs/decisions.md`: grep for the topic. **Decisions win over a doc when they disagree.**
4. The code it touches: grep for the functions, tables, routes or components named. Never read the baseline migration in full (124 KB): grep `supabase/migrations/` for the function and read that range; the migrations are the truth, and later ones may replace a function.
5. Docs the task doesn't link to are read only when a rule is missing; say which you read.

## The template

```markdown
# <id> <title> · <type> · <S|M|L>

**Goal.** One sentence: what a player (or the system) can do afterwards.
**Done when.** Copied from the roadmap.
**Rules.** Each rule quoted or tightly paraphrased, with its link (`game-modes.md#undo`).
**Contract.** Functions with arguments and types, every status answer, errors raised,
Realtime events and their payloads, payload types for the app. New or changed only.
**Tests to write.** One line per rule: given ..., when ..., then .... Number them.
**Files.** To add or change. **SQL functions touched:** list them (two tasks touching the
same function can't run in parallel).
**Screen spec.** docs/design/screens/<screen>.md, for UI tasks.
**Out of scope.** What looks related but isn't this task.
**Questions.** Anything nobody decided. Empty if none.
```

## Rules for a good brief

- **About a page.** Longer means the task should be split: say how.
- **Every rule gets a test.** The roadmap's rule 4: a rule a doc states has a test in the pull request.
- **Quote, don't summarise loosely.** Numbers (limits, timings, counts) are copied exactly and linked.
- **Name what exists.** Real function, table, file and component names from the code, not invented ones.
- **Questions are a feature.** A choice nobody made goes under Questions, never into a guess. Note the default you'd recommend.
- **No code** beyond signatures and payload shapes.

## Where briefs go

The planner writes them itself, with the Write tool, into `.claude/state/briefs/` (git-ignored): `<id>.md` for a task, `slice-<n>.md` for a slice's shared plan, `<n>` being its number in docs/agent-workflow.md#slices-for-the-first-release. Its answer to the session that asked is a summary (paths, sizes, questions, waves), never the briefs: that session carries the answer through every later step.

## A slice plan

For a feature (several tasks), in two passes, so the first tasks start while the others are still being written.

**First pass**, which ends as soon as these are written:

1. Read for every task in the slice. The questions come out of this reading, so all of them reach Harry at once.
2. `slice-<n>.md`: the contract the tasks share, the conventions every task follows, the order (backend before app), the SQL functions and files each task touches, the waves (at most three tasks each, no shared function or file), the sizes with a reason each, which screens need specs and which moments need beats, and every open question with its default, numbered by task (Q9.1 is M1.9's first).
3. The brief of each task in the first wave, pointing to the slice file for the shared parts.
4. The summary, then stop. If the whole slice fits in one wave, this pass writes every brief and there is no second.

**Second pass**, resumed with Harry's answers while the first wave builds: write the other tasks' briefs with the answers folded in, so their Questions sections hold nothing open. Answer with the paths.

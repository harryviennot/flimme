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

## A slice plan

For a feature (several tasks, see docs/agent-workflow.md#slices-for-the-first-release), write one shared section first: the contract all its tasks share, the order of the tasks (backend before app), which screens need specs and which moments need beats. Then one short brief per task that points to it.

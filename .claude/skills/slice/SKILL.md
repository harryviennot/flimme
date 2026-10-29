---
name: slice
description: Plan a feature slice (a group of roadmap tasks that together deliver one thing players can use, such as joining by code) before its tasks start. Use when asked to plan, start or schedule a feature, a milestone or several related tasks.
argument-hint: <slice name or task ids, e.g. "joining" or M4.1 M4.8 M4.14 M4.15>
---

# Plan a slice

Slice: $ARGUMENTS

The first release's slices are listed in docs/agent-workflow.md#slices-for-the-first-release.

1. **List the tasks** with `node tools/next.mjs --task <id>` for each: their needs, types and links. Note which are ready now.
2. **Spawn the `planner`** for one slice plan (the `brief` skill's "A slice plan"): the shared contract, then a short brief per task.
3. **Specs first:** every screen in the slice needs `docs/design/screens/<screen>.md` (the `designer`); every signature moment needs its beat (the `game-designer`). Run these before the app tasks start, while the backend tasks are built.
4. **Order:** backend tasks first (the contract lands with its tests and regenerated types), then app tasks on the real types, then ops tasks. qa adds the slice's Maestro flow last.
5. **Parallel or not:** two tasks can run at once only if they touch different SQL functions and different screens. At most three tasks in flight.
6. **Report** a short plan for Harry: the order, what can run in parallel, which tasks are L (they need his yes on the brief), and the open questions.

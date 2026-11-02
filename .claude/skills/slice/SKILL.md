---
name: slice
description: Plan a feature slice (a group of roadmap tasks that together deliver one thing players can use, such as joining by code) before its tasks start. Use when asked to plan, start or schedule a feature, a milestone or several related tasks.
argument-hint: <slice name or task ids, e.g. "joining" or M4.1 M4.8 M4.14 M4.15>
---

# Plan a slice

Slice: $ARGUMENTS

The first release's slices are listed in docs/agent-workflow.md#slices-for-the-first-release.

1. **List the tasks** with `node tools/next.mjs --task <id>` for each: their needs, types and links. Note which are ready now.
2. **Spawn the `planner`** in the foreground for the first pass of the slice plan (the `brief` skill's "A slice plan"): "Plan slice <n> (<ids>), first pass." It writes `.claude/state/briefs/slice-<n>.md` and the first wave's briefs, and answers with the waves, the sizes and the open questions. Keep its agent id from the spawn result: the second pass resumes it. Don't read the files it wrote; its answer has what you need.
3. **Specs first:** every screen in the slice needs `docs/design/screens/<screen>.md` (the `designer`); every signature moment needs its beat (the `game-designer`). Run these before the app tasks start, while the backend tasks are built.
4. **Order:** backend tasks first (the contract lands with its tests and regenerated types), then app tasks on the real types, then ops tasks. qa adds the slice's Maestro flow last.
5. **Parallel or not:** two tasks can run at once only if they touch different SQL functions and different screens. At most three tasks in flight.
6. **Report** a short plan for Harry: the order, what can run in parallel, which tasks are L (they need his yes on the brief), and the open questions with their defaults. The briefs are in `.claude/state/briefs/` if he wants to read them.
7. **When Harry answers:**
   - Write his answers at the top of the slice file and of each first-wave brief.
   - Have the `scribe` record them in docs/decisions.md.
   - Start the first wave, each task in its own worktree.
   - Resume the planner with SendMessage, to its agent id: "Harry's answers: <answers>. Second pass." It writes the other briefs in the background with its reading still in its context. If it can't be resumed (this is a new session), spawn a planner to write them from the slice file.
8. **Later waves:** a task starts once its brief is written, a slot is free, and every earlier task it shares an SQL function or a file with has merged. An L task's brief still waits for Harry's yes.

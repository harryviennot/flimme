---
name: review
description: The review checklist for a pull request or a diff in this repo, per layer (SQL, server, app), and what counts as blocking. Use whenever reviewing code here; the reviewer agent always uses it.
---

# Reviewing a change

Read the diff (`git diff origin/main...HEAD`) and the brief. Not the docs: the brief quotes what matters. Run the tests if you doubt them.

## Blocking

A finding is blocking when it's a bug, a broken rule from the brief, a missing test for a rule, a security or privacy problem, or a break of the rules in CLAUDE.md. Everything else is a nit: report at most three, marked as nits.

## Every change

- Each numbered test in the brief exists, tests what it says, and would fail without the change.
- Nothing outside the brief's scope changed, apart from fixes the pull request explains.
- No skipped, disabled or deleted tests.
- No secrets, tokens or personal data in code, logs, fixtures or tests.

## SQL (supabase/)

- New functions: `security definer` with `set search_path = ''`, every name schema-qualified.
- A function that changes room state takes the room lock first (`select ... from public.rooms where id = ... for no key update`), like `api.cast_vote`.
- Expected outcomes return `jsonb_build_object('status', ...)`; only real errors raise (errcode 42501 for access).
- Row-level security on every new table; grants only to the roles that need them; nothing new reachable through `api` by accident.
- Expand, don't contract: no dropped or renamed column, function or view that a shipped app or the server still uses; an incompatible change is a `_v2`.
- Never edits a merged migration. Two migrations replacing the same function: the later one must include the earlier one's change.
- Writes rate-limited through `internal.rate_limit` once it exists (M1.9).
- Realtime: events only through `internal.broadcast_room`; payloads never reveal who noped or anyone's swipes.

## Server (server/)

- Load, compute, write: logic in pure functions, I/O at the edges.
- Every queue handler is safe to run twice.
- No network in tests: recorded responses only.
- No personal data in logs.

## App (mobile/)

- Components come from `ui/` and `shared/`; a near-duplicate of an existing component is blocking.
- No restyling a primitive with extra classes where a variant belongs.
- Every visible string goes through `t()` with keys in French and English.
- Server state from TanStack Query; never `.rpc` outside `packages/contract` or the api wrappers.
- Every status answer of a function used has its message or behaviour.
- Anything animated runs on the UI thread (Reanimated), uses motion tokens, and works with Reduce Motion.
- Accessibility: labels on icon-only buttons, a 44-point target, screen-reader text for the card.
- The phone never waits on the network to show the next card.

## Output

```
Blocking
1. <file:line> what is wrong, why, and the fix.
Nits
1. ...
Tests from the brief: 1 ok, 2 ok, 3 missing.
```
Say "No blocking findings" when there are none.

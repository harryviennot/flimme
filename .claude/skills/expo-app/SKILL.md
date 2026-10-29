---
name: expo-app
description: Conventions for the Expo app in mobile/ (routes, folders, state, talking to the backend, realtime, translations, tests). Use whenever writing, testing or reviewing app code; load design-system too for anything visible, and motion for anything that moves.
---

# The app

Expo SDK 58 (React Native 0.88, React 19.3), Expo Router with routes in `mobile/src/app/`, TypeScript strict, Uniwind for styles, Reanimated 4 and Gesture Handler, TanStack Query, Zustand. Background: docs/architecture/app-structure.md and docs/architecture/groundwork.md#the-apps-foundations, by section.

**Expo changes every SDK.** Before using an Expo, EAS or React Native API, check the SDK 58 docs (`https://docs.expo.dev/versions/v58.0.0/...`, or the index at `https://docs.expo.dev/llms.txt`) rather than memory. Add packages with `npx expo install <pkg>` (from mobile/) so versions match the SDK.

## Principles

1. **The server holds the truth; the phone shows it.** Rooms, seats, votes and matches are decided in Postgres.
2. **The phone never waits on the network to show the next card.** Swipes go into a persisted queue and are sent in the background.
3. **One way in:** Supabase only through the `api` schema, via the wrappers in `packages/contract` (M3.6). Screens never call `.rpc` directly.
4. **Room screens follow the room's state.** The phone never moves itself from the lobby to swiping; the room layout moves when `state_changed` says so.
5. **Thin routes, fat features.**

## Where code goes

| Folder | Holds |
| --- | --- |
| `src/app/` | Routes only: lay out a screen from components and hooks |
| `src/components/ui/` | Primitives that know nothing about films or rooms |
| `src/components/shared/` | Reused pieces that do (movie card, player pill), data through props |
| `src/components/screens/<screen>/` | Single-use pieces, one folder per screen, named like its route |
| `src/features/<feature>/` | Logic without JSX: hooks, stores, the vote queue, room state; tested without rendering |
| `src/lib/` | haptics, sound, server time, analytics, storage, formatting |
| `src/theme/` | tokens (generated from tokens.json), fonts, motion |
| `src/i18n/` | i18next setup and `locales/fr`, `locales/en` |

## State

- Server data: TanStack Query, one query per `api` view or read function, kept fresh by Realtime events.
- The card stack and the vote queue: Zustand stores (the queue persisted to expo-sqlite).
- Never put cards in TanStack Query: the deck changes under the phone.

## Answers and errors

Every `api` function answers with a status (`packages/contract/src/answers.ts`). Each status has a message or a behaviour; a test walks every status of a function the screen uses. Real errors go to Sentry.

## Translations

- Every visible string through `t()` (lint enforces it). French first; the same key in `locales/en`. A new feature gets its own JSON file per language, added in `src/i18n/resources.ts`.
- Plurals with i18next (`_one`, `_other`). Numbers, dates and runtimes with `Intl` in the profile's language.

## Tests

- Jest with jest-expo and Testing Library, next to the code (`thing.test.ts`). Logic in `features/` and `lib/` is tested without rendering; components are tested for behaviour (press, disabled, states), not pixels.
- Maestro flows in `mobile/.maestro/`, one per slice (the `qa` agent).

## Commands (from the repo root)

`mise run check` (or `pnpm --filter mobile run check`), `pnpm --filter mobile test`, `pnpm --filter mobile tokens`, `mise run dev`. Development builds only (no Expo Go): `npx expo run:ios` / `run:android` from mobile/.

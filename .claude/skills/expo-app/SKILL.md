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
- Zustand stores live in `src/features/<feature>/store.ts`. A persisted one uses `persistOptions({ name, version, migrate, partialize })` from `src/lib/persisted-store.ts` (name `flimme.<store>`, synchronous reads over `lib/storage.ts`, so the first render has the values). Export a `create...Store(kv?)` factory so tests can recreate the store over the same kv store. See `features/settings/`.
- **Never call a store as a hook in a component or hook** (`someStore((s) => ...)`): the React Compiler only treats `use...` functions as hooks, memoizes the call and changes the hook order between renders ("Cannot read property 'length' of undefined" at the next `useEffect`). Wrap it in a named hook (`useMatchShown(roomId)`, `useKeptRoom()`). Jest does not run the compiler, so only a device run shows it.

## Answers and errors

Every `api` function answers with a status (`packages/contract/src/answers.ts`). Each status has a message or a behaviour; a test walks every status of a function the screen uses. Real errors go to Sentry: `src/api/` reports `ApiError` kinds `denied` and `unexpected` (not `network`) through `reportError` from `@/lib/sentry`, and `ErrorScreen` reports what a route throws. Never call `Sentry.setUser` or put a code, name, email or id in an error message: `lib/sentry-scrub.ts` is the last defence, not the first. `/dev` is the dev menu (backend switch, haptics and sound, gallery, crash): a new dev tool adds a row there. Never put a test file inside `src/app/`: Expo Router bundles every file there as a route, so route tests live in `src/routes.test.tsx`. `/dev/crash` (development and preview builds) crashes the app on purpose to prove readable frames.

## The web export

`npx expo export -p web` (single-page output) serves only the invite page: `app/_layout.web.tsx` is the web root layout (no session, update gate or Sentry, so a visitor never creates a guest account; it loads the fonts with `useFonts(webFonts)` from `src/theme/web-fonts.ts`) and `app/join/[code].web.tsx` is the invite route. Every other path shows the broken-link state. Files in `mobile/public/` ship as they are (`index.html` is the HTML template with the link preview tags; `.well-known/` holds the verification files). A static host must serve `/.well-known/apple-app-site-association` as `application/json` without a redirect, and fall back to `index.html` for other paths.

## Session, profile and connection

- `useSession()` / `useSessionFailed()` (`features/session`): the guest sign-in's answer, and whether it threw (reported once inside `startSession`; callers use `.catch(() => {})`). `useMyProfile()` (`features/profile`, key `['my_profile']`) is seeded from the copy kept on the device and stale from the start; `useOnline()` (`features/network`) comes from expo-network and also drives TanStack's `onlineManager`. A screen that needs the player's name reads `useMyProfile()`, never the api.
- `routes.test.tsx` mocks `@/api`, `@/features/session`, `@/features/network` and `@/lib/storage` and wraps routes in a `QueryClientProvider`; a screen that reaches for something new adds its answer there.
- `EmptyState autoFocus` moves a screen reader's focus to the title of a screen that failed.

## Translations

- Every visible string through `t()` (lint enforces it). French first; the same key in `locales/en`. A new feature gets its own JSON file per language, added in `src/i18n/resources.ts`.
- Plurals with i18next (`_one`, `_other`). Numbers, dates and runtimes with `Intl` in the profile's language.

## Tests

- Jest with jest-expo and Testing Library, next to the code (`thing.test.ts`). Logic in `features/` and `lib/` is tested without rendering; components are tested for behaviour (press, disabled, states), not pixels.
- Maestro flows in `mobile/.maestro/`, one per slice (the `qa` agent).
- Gesture Handler 3 and Worklets have no native side in Jest: `jest.setup.js` loads Gesture Handler's own mocks and stubs the worklets runtime holder, so a screen with a `GestureDetector` renders under a `GestureHandlerRootView` in tests. A gesture's rules live in a pure worklet file (`features/swipe/feel.ts`) that tests call directly; the finger itself is covered by the Maestro run. Maestro's synthetic drags carry no real flick velocity, so a flick's feel is Harry's to check.
- **The frame meter** (`features/dev/frame-meter.ts`, `components/screens/swipe/frame-meter.tsx`): build with `EXPO_PUBLIC_FRAME_METER=1 npx expo run:ios --configuration Release` (and the staging values as the app's own `EXPO_PUBLIC_SUPABASE_*`, since a Release build has no dev menu) to see the average fps and janky share while cards move. Bar on the iPhone simulator: 55 fps or more, under 5% janky over 50 swipes.

## Commands (from the repo root)

`mise run check` (or `pnpm --filter mobile run check`), `pnpm --filter mobile test`, `pnpm --filter mobile tokens`, `mise run dev`. Development builds only (no Expo Go): `npx expo run:ios` / `run:android` from mobile/.

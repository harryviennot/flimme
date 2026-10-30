# Splash

Screen 01 in the Figma (`9:83`). Route `/` (`app/index.tsx`) behind the native splash. Built in M4.6. Written on 30 October 2026 from [onboarding](../../product/onboarding.md#first-launch), [first launch in the data model](../../architecture/data-model.md#first-launch), [invites and deep links](../../architecture/app-structure.md#invites-and-deep-links) and [empty and error states](../../product/onboarding.md#empty-and-error-states).

## Purpose

Show the brand while the app signs in as a guest and decides where to go. Ready in under a second, with no spinner and no question.

## Layout

- **Native splash** (expo-splash-screen): the Flimme marquee logo centred on `bg.canvas`.
- **Hand-off view** (`screens/splash/splash-view.tsx`), drawn exactly where the native image sits so the switch is invisible: `Spotlight tone="accent"` behind, the logo, `MarqueeBulbs` (still, not chasing) above and below it, and the tagline in `Text variant="mono-eyebrow" tone="muted"` 24 points under the logo.
- Errors replace the view with an `EmptyState` centred in a `Screen`.

## What happens, in order

1. Restore the session, or sign in anonymously with Supabase.
2. Read `api.my_profile` and `api.app_config` (for `min_app_version`) in parallel.
3. First launch only: `api.update_profile` with the country (`regionCode` from expo-localization) and the language (French if the device is in French, English otherwise). Silent; a failure is retried at the next launch and never blocks.
4. Go to the first match in this table (always `replace`, so back never returns here):

| Condition | Goes to |
| --- | --- |
| The app was opened by an invite link | The link's route, [join sheet](join-sheet.md) |
| No name yet | [Welcome](welcome.md) |
| A room code is kept from last time | `api.join_room` with it: `ok` goes to `/room/[id]` (same seat); any other answer drops the code and goes to Home |
| Otherwise | [Home](home.md) |

## States

| State | What the player sees | Next step |
| --- | --- | --- |
| Loading | The hand-off view. If everything is ready within `duration.base`, the next screen shows without any animation | |
| Slow (over 3 seconds) | The tagline changes to `onboarding:splash.slow` | Keeps waiting |
| Offline, no saved session | `EmptyState` icon `wifi-off`, `onboarding:splash.offline.*` | `common:actions.retry`; retries by itself when the connection comes back |
| Offline, saved session with a name | Goes to Home, which shows its offline `Banner` | |
| Guest sign-in refused (rate limit or bot check) | `EmptyState` `error`, icon `alert`, `onboarding:splash.signInFailed.*` | `common:actions.retry` |
| App older than `min_app_version` | `EmptyState` icon `arrow-up`, `onboarding:splash.update.*` | Opens the store page |

## Copy (`onboarding` namespace)

| Key | French | English |
| --- | --- | --- |
| `splash.tagline` | On swipe ensemble · On regarde ce soir | Swipe together · Watch tonight |
| `splash.slow` | On allume la marquise… | Lighting up the marquee… |
| `splash.offline.title` | Tu es hors ligne | You're offline |
| `splash.offline.body` | Flimme a besoin d'une connexion pour démarrer. | Flimme needs a connection to start. |
| `splash.signInFailed.title` | Impossible de démarrer | We couldn't get you started |
| `splash.signInFailed.body` | Réessaie dans une minute. | Try again in a minute. |
| `splash.update.title` | Une mise à jour t'attend | Time for an update |
| `splash.update.body` | Mets Flimme à jour pour continuer à jouer. | Update Flimme to keep playing. |
| `splash.update.action` | Mettre à jour | Update |

## Motion, haptics, sound

- The bulbs and the spotlight come in with `layout.fadeIn` as the hand-off view takes over; the view leaves with `layout.fadeOut`.
- No haptic, no sound.

## Accessibility

- The logo is an image labelled "Flimme"; the view has `common:states.loading` as its label, so a screen reader says "Flimme, Loading".
- Error states: focus goes to the `EmptyState` title, then its button.
- Reduce Motion: no fades; the same content.

## Differences from the Figma

- The Figma's logo reads "MOVIE MATCH", the working name. The app is Flimme ([decisions](../../decisions.md)).
- The Figma has no error states; they come from onboarding.

## Questions

1. **The Flimme logo.** `mobile/assets/logos/` is empty and the Figma only has the old wordmark. Default: the Figma's marquee frame with "FLIMME" in Staatliches, `marquee.default` on `bg.sunken`, exported as `splash-icon.png` and an SVG for the hand-off view; added to the Figma when it's next updated (M0.9).
2. **The slow threshold.** Default: 3 seconds (a starting value).

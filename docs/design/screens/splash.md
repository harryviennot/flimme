# Splash

Screen 01 in the Figma (`9:83`, first release `99:3543`). Route `/` (`app/index.tsx`) behind the native splash. Built in M4.6. Written on 30 October 2026 and updated on 3 November 2026 (slice 4's answers) from [onboarding](../../product/onboarding.md#first-launch), [first launch in the data model](../../architecture/data-model.md#first-launch), [invites and deep links](../../architecture/app-structure.md#invites-and-deep-links) and [empty and error states](../../product/onboarding.md#empty-and-error-states).

## Purpose

Show the brand while the app signs in as a guest and decides where to go. Ready in under a second, with no spinner and no question.

## Layout

- **Native splash** (expo-splash-screen): the Flimme logo (below) centred on `bg.canvas`.
- **Hand-off view** (`screens/splash/splash-view.tsx`), drawn exactly where the native image sits so the switch is invisible: `Spotlight tone="accent"` behind, the logo centred in the whole window (not the safe area, as the native image is), and the tagline in `Text variant="mono-eyebrow" tone="muted"` right under the logo image. The image's glow margin puts the tagline 24 points under the sign. The tagline doesn't move the logo: it hangs below the centre.
- Errors replace the view with an `EmptyState` centred in a `Screen`.

## The logo

The marquee sign of the Figma's first-release splash (`99:3548`): a 306 by 140 point sign, `radius.lg`, a 3-point `marquee.default` border inside its edge, filled with `bg.sunken`; two rows of 12 bulbs (9 points, 21 apart), alternating `marquee.bright` and `marquee.strong`; "FLIMME" in Staatliches at 92 points, `marquee.bright`, as outlines, centred; and `glow-marquee` around it. The bulbs are part of the logo, so the view has no separate `MarqueeBulbs`.

| File | What | Used by |
| --- | --- | --- |
| `mobile/assets/logos/flimme.svg` | 354 by 188 points: the sign plus 24 points of glow on every side (drawn as stacked shapes, no SVG filter) | The hand-off view, through `logos.flimme` (`@/theme/generated/icons`) and `SvgXml` |
| `mobile/assets/images/splash-icon.png` | The same image at 4x (1416 by 752) | The native splash |

Both come from `mobile/scripts/make-logo.swift` (colours read from tokens.json); run it again after a colour token changes. Size: 354 points wide on iOS (the Figma's), 200 on Android, where Android 12 and later keep only a 192 dp circle of a splash icon (`imageWidth` in app.config.ts). The hand-off view draws the logo at the same width on each platform.

## What happens, in order

`UpdateGate` (M3.10) already wraps the whole app: it reads `api.app_config` and shows the update screen below `min_app_version`. The splash does neither.

1. Wait for the session (`useSession()` from `@/features/session`: the root layout restores it, or signs in anonymously).
2. Read `api.my_profile` (`useMyProfile()`, `@/features/profile`). Every profile read or saved is kept in the key-value store (`lib/storage.ts`) and seeds the query, so an offline launch still knows the player.
3. Sync the device, silently and without waiting: `api.update_profile` with the language whenever `profile.language` differs from the app's language (`deviceLanguage()`), and with the country (`regionCode` from expo-localization) only while `profile.country` is empty and the region is two capital letters, so a later choice is never overwritten. One call carries both when both are due. A failure waits for the next launch.
4. Go to the first match in this table (always `replace`, so back never returns here):

| Condition | Goes to |
| --- | --- |
| The app was opened by an invite link | The link's route, [join sheet](join-sheet.md) |
| No name yet (`display_name` is empty) | [Welcome](welcome.md) |
| Otherwise | [Home](home.md) |

The room code kept from last time (rejoining the same seat) is added by M4.10, the room layout, as a row before Home.

Connectivity comes from `useOnline()` (`@/features/network`, expo-network), which also feeds TanStack's `onlineManager`.

## States

| State | What the player sees | Next step |
| --- | --- | --- |
| Loading | The hand-off view. If everything is ready within `duration.base`, the next screen shows without any animation | |
| Slow (over 3 seconds) | The tagline changes to `onboarding:splash.slow` | Keeps waiting |
| Offline, with a cached profile | Routes as the table says from the cached profile: Home (which shows its offline `Banner`) or Welcome | |
| Offline, no cached profile (a session answered `offline`, or `my_profile` couldn't be read) | `EmptyState` icon `wifi-off`, `onboarding:splash.offline.*` | `common:actions.retry`; retries by itself when `useOnline()` turns true |
| Guest sign-in refused (session answered `refused`: rate limit or bot check) | `EmptyState` `error`, icon `alert`, `onboarding:splash.signInFailed.*` | `common:actions.retry` |
| A real error (sign-in or `my_profile` failed while online, neither offline nor refused) | Reported to Sentry; the same `signInFailed` state | `common:actions.retry` |

## Copy (`onboarding` namespace)

| Key | French | English |
| --- | --- | --- |
| `splash.tagline` | On swipe ensemble · On regarde ce soir | Swipe together · Watch tonight |
| `splash.slow` | On allume la marquise… | Lighting up the marquee… |
| `splash.offline.title` | Tu es hors ligne | You're offline |
| `splash.offline.body` | Flimme a besoin d'une connexion pour démarrer. | Flimme needs a connection to start. |
| `splash.signInFailed.title` | Impossible de démarrer | We couldn't get you started |
| `splash.signInFailed.body` | Réessaie dans une minute. | Try again in a minute. |

The update screen's copy belongs to `UpdateGate` (M3.10).

## Motion, haptics, sound

- The logo never moves: it is the native image, redrawn in place. The spotlight and the tagline come in with `layout.fadeIn` as the hand-off view takes over; the view leaves with `layout.fadeOut`.
- No haptic, no sound.

## Accessibility

- The logo is an image labelled "Flimme"; the view has `common:states.loading` as its label, so a screen reader says "Flimme, Loading".
- Error states: focus goes to the `EmptyState` title, then its button.
- Reduce Motion: no fades; the same content.

## Differences from the Figma

- The original Figma's logo reads "MOVIE MATCH", the working name. The app is Flimme ([decisions](../../decisions.md)); the first-release copy has the Flimme sign.
- The first-release sign is filled with `bg.surface`; the logo uses `bg.sunken`, as question 1 says.
- The Figma has no error states; they come from onboarding. Its caption still lists an update state, which `UpdateGate` now owns.

## Questions

Harry accepted every default below on 30 October 2026.

1. **The Flimme logo.** `mobile/assets/logos/` is empty and the Figma only has the old wordmark. Default: the Figma's marquee frame with "FLIMME" in Staatliches, `marquee.default` on `bg.sunken`, exported as `splash-icon.png` and an SVG for the hand-off view; added to the Figma when it's next updated (M0.9). Made on 3 November 2026 ([the logo](#the-logo)).
2. **The slow threshold.** Default: 3 seconds (a starting value).

Harry accepted these on 3 November 2026 (slice 4, [decisions](../../decisions.md)):

3. **Connectivity:** expo-network, feeding TanStack's `onlineManager` and `useOnline()`.
4. **Offline launch:** the last profile read is cached, so a named profile goes to Home offline.
5. **Country and language:** language whenever it differs from the app's, country only while the profile has none. This replaces "first launch only".
6. **The kept room code:** moves to M4.10.
7. **A real launch error:** to Sentry, and the `signInFailed` state with Retry.

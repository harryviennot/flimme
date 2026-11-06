# Play alone setup

S2 Play alone setup and S7's setup variant (the cap) on the Figma's First release page ([the Figma map](../figma-map.md#first-release-page-993537)), drawn from 06-07 Host setup (`99:3779`). Route `/solo`, a stack screen over the tabs (no tab bar). Built in M6.44. Written on 5 November 2026 (M6.39) from [what solo ends with](../../product/solo-and-my-films.md#3-what-solo-ends-with), [the cap](../../product/solo-and-my-films.md#8-the-cap), [host setup](host-setup.md) and the solo contract (`api.start_solo`, M6.40 and M6.42).

## Purpose

Say what you can watch tonight, then swipe. A returning player taps **Start** at once: the services are remembered and the other settings have defaults. It is host setup without inviting anyone.

## Layout

`Screen` with `scroll`, `TopBar` (back, `solo:setup.topBar`), and the button in the `footer`. The same sections, sizes and pieces as [host setup](host-setup.md#layout), shared through `features/host/` (M6.44 moves what both need there, nothing else):

1. **Title**, `display-m`, `solo:setup.title`.
2. **Services.** Eyebrow `solo:setup.services`, then **`ServiceGrid`** with the prefill of host setup (the saved ids the country lists). Under it, `body-s` muted `host:services.free`. No "friends add their own" helper: nobody joins.
3. **Time budget.** As host setup: eyebrow `host:time.label`, `Chip role="radio"` `host:time.any` (default), `host:time.under105`, `host:time.under120`.
4. **Age cap.** As host setup: eyebrow `host:age.label`, Adults (default), 16, 12, 10, All ages; helper `host:age.helper`.
5. **Footer:** `Button` primary L, icon `play`, `solo:setup.start`, `block`. Disabled while no service is picked, with `host:services.required` under it. One `body-s` line under it for `too_few_films` (below).

**Components:** `Screen`, `TopBar`, `Text`, `ServiceGrid`, `Chip`, `Button`, `Banner`, `Skeleton`, `EmptyState`. No new component.

## At the cap

When the phone's stored Paris date of its last `daily_limit` answer is today (no server read for the cap, Q42.4), or when Start answers `daily_limit`, the form gives way to **the cap card**:

- The body: one `EmptyState`, centred (`flex-1 justify-center`), icon `ticket`, title `solo:cap.title`, body `solo:cap.body`, no action.
- The footer: `Button` primary L `solo:actions.host` with icon `plus` (to [host setup](host-setup.md), `replace`), then `Button` secondary L `solo:actions.myFilms` (to the My films tab, `dismissTo`), both `block`, `gap-3`.
- No countdown to midnight, no "3 left", no Pro mention (M21 may add one quiet line).

The phone's date is a shortcut: `api.start_solo` stays the authority. A reinstall shows the form and gets `daily_limit` on Start.

## What Start does

1. Only if the selection changed: `api.set_my_providers`, as host setup does. Any answer but `ok` stops here.
2. `api.start_solo({ runtime_max, max_age })`. The server reads the country and the services from the profile, ends any other live solo room of this player (Q40.3) and opens a room with one seat.
3. The answer, below. A solo room is never kept for the splash's rejoin (`api.join_room` answers `not_found` for it): a cold start lands on Play, and an old session ends on its own (the sweeper after 30 minutes, or the next Start).

## States and answers

| State or answer | What the player sees | Next |
| --- | --- | --- |
| No country, or no services for the country | Host setup's unsupported state (`host:errors.unsupported.*`), with its country action ([the country choice](host-setup.md#the-country-choice-m1111)) and Join with a code | |
| Services loading | Six `Skeleton` tiles, as host setup; the chips are usable | |
| Services failed to load | Inline `EmptyState` `error`, `host:errors.services`, `common:actions.retry` | |
| No service picked | Start disabled, `host:services.required` | Pick one |
| Starting | `Button` `loading`; the form stays | |
| `ok` | `router.replace('/room/[id]/swipe')`; the cards are already dealt | |
| `dealing` (deck engine `server`) | The same replace. The swipe screen shows its loading card while the room is `dealing`; after 8 seconds it calls `api.start_game(room_id)`, as the lobby's host does ([lobby](lobby.md#starting)) | |
| `too_few_films` `{eligible}` | The form stays. Under Start, `solo:setup.tooFew_one` or `_other` with `eligible`, or `solo:setup.tooFewNone` for 0; `haptics.error()`. The room is already over (`abandoned`, Q40.5) | Add a service or change a chip: the line goes |
| `daily_limit` | The cap card, and the phone stores today's Paris date | |
| `name_required` (a race: Play needs a name) | `/name?edit=1`, choices kept, as host setup | Start again |
| `country_required` | The unsupported state | |
| `invalid_settings` `{field}` (a bug) | `showToast` warn `common:errors.generic.title`, to Sentry | |
| `rate_limited` (20 starts in 10 minutes, Q40.9) | `showToast` warn `solo:setup.errors.rateLimited`; the form stays | Later |
| Offline | `Banner` warn `solo:setup.offline`; Start disabled. At the cap the cap card shows offline too | Back online |
| The call failed | `showToast` warn `solo:setup.errors.network`, `haptics.error()` | Start again |
| The largest text | The form scrolls; the footer stays pinned; chips wrap | |
| 375 by 667 | As host setup: the services and the time chips show above the footer; the age chips scroll | |

## Copy (`solo` namespace)

| Key | French | English |
| --- | --- | --- |
| `setup.topBar` | Jouer seul | Play alone |
| `setup.title` | Ton film, ton rythme | Your film, your pace |
| `setup.services` | Où peux-tu regarder ? | Where can you watch? |
| `setup.start` | C'est parti | Start |
| `setup.tooFew_one` | Seulement {{count}} film convient. Ajoute une plateforme ou relâche un filtre. | Only {{count}} film fits. Add a service or loosen a filter. |
| `setup.tooFew_other` | Seulement {{count}} films conviennent. Ajoute une plateforme ou relâche un filtre. | Only {{count}} films fit. Add a service or loosen a filter. |
| `setup.tooFewNone` | Aucun film ne convient. Ajoute une plateforme ou relâche un filtre. | No film fits. Add a service or loosen a filter. |
| `setup.offline` | Tu es hors ligne. Reconnecte-toi pour jouer seul. | You're offline. Connect to play alone. |
| `setup.errors.network` | Impossible de lancer la partie. Réessaie. | We couldn't start. Try again. |
| `setup.errors.rateLimited` | Ça fait beaucoup de parties d'un coup. Réessaie dans quelques minutes. | That's a lot of starts at once. Try again in a few minutes. |

The cap card's keys (`cap.title`, `cap.body`, `actions.host`, `actions.myFilms`) are in [the swipe screen's solo copy](swipe.md#solo-copy-solo-namespace), shared by both cap cards. The chips, the free services line and the unsupported state reuse the `host` keys. Host setup's `too_few_films` line ("Ask everyone to add their services") doesn't fit a player alone, so solo has its own. "ORGANISER UNE SOIRÉE" fits a block L button at 375 points.

## Motion, haptics, sound

- As host setup: tiles and chips with `timing.toggle` and `haptics.press()`. Start: the `Button` press, then the swipe screen replaces this one. No celebration.
- The cap card fades in over the form (`layout.fadeIn`) when Start answers `daily_limit`; no haptic (it isn't a mistake). On arrival at the cap it is simply there.

## Accessibility

- Focus order: back, the title, the services label, the tiles, the free services line, the time chips, the age chips and their helper, Start (its disabled reason is its hint).
- After `too_few_films`, focus goes back to Start and the line is announced once (assertive, it answers the tap).
- The cap card: focus moves to its title when it replaces the form; then the body, Host a movie night, My films.
- Reduce Motion: state changes without transitions; the cap card appears without the fade.

## Never shown

A count of solo cards left today, the time until midnight, a streak, or anything about Pro.

## Differences from the Figma

- New screen: S2 is drawn from 06-07 Host setup with the invite helper removed, Start in place of Open the room, and no ticket icon.

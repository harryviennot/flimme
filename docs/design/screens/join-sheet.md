# Join sheet

New, not in the Figma ([onboarding's Figma changes](../../product/onboarding.md#changes-to-the-figma) asks for it). Route `/join/[code]`, the target of every invite link and invite QR code. Built in M4.15, with the room reference from M4.1. Written on 30 October 2026 and updated on 3 November 2026 (slice 6's questions, all defaults accepted by Harry) from [app installed](../../product/onboarding.md#app-installed), [the link](../../product/onboarding.md#the-link) and [invites and deep links](../../architecture/app-structure.md#invites-and-deep-links).

## Purpose

An invited friend taps the link and is in the room: about 5 seconds when they've played before, about 15 the first time (a name, a color, Join). The link skips Welcome and Home.

**Who invited you.** [Security](../../architecture/security.md#the-app) asks that a player joining from a link sees the host's name and the number of players before their first swipe, so a stale or forwarded link shows for what it is. The [lobby](lobby.md) (the players, the host's crown) and the swipe screen's player row do that; the sheet adds no step, so a player who played before still lands in the room in about 5 seconds.

## Presentation

A `formSheet` over Home (over Welcome for a player with no name yet). On a cold start, the root layout puts that screen underneath first, so closing the sheet always lands somewhere sensible.

**A cold start before the session.** A link opens `/join/[code]` without passing through the `/` route, which waits for `startSession()`. The sheet shows the Joining layout until the session is ready, then calls `join_room`. If signing in fails, the sheet shows Refused with `join:errors.network` (icon `alert`) and `common:actions.retry`, which tries the sign-in again and then joins.

## Links

The link is `https://<domain>/join/<code>?r=<ref>` (or `flimme://join/<code>?r=<ref>`, and the development scheme). It is parsed strictly:

| Link | What happens |
| --- | --- |
| Six digits and an `r` that is a uuid | Joins with the code and the reference |
| Six digits and no `r` | Joins by code alone (`not_found` can then come back instead of `closed`) |
| Anything else: a code that isn't six digits, an `r` that isn't a uuid, another path | The Refused layout with `join:errors.closed` (the malformed row below). [Security](../../architecture/security.md#the-app) said such a link opens Home; the refused sheet wins because it says what happened and offers a next step (decisions.md, 3 Nov 2026) |

**What the call sends.** `api.joinRoom({ code, ref, via: 'link', link_opened_at })`. `link_opened_at` is the moment the app received the URL (the initial URL on a cold start, or the URL event when the app was running), recorded with `Date.now()` at that moment and sent as `new Date(serverNow(receivedAt)).toISOString()` (`mobile/src/lib/server-time.ts`). The `starting` retries and Retry send the same value. On a cold start the phone may not know the server's clock yet, so the value is the phone's own; the server clamps it to the room's lifetime anyway (M4.1).

## A link to a room you are in

A link never stacks room screens. When `join_room` answers `ok` (a seated player answers `ok` with `rejoined`), the sheet enters the room by what the stack already holds:

| The stack holds | The sheet |
| --- | --- |
| No room screen | `replace`s itself with the room |
| This room's screen (the player was in it, left the app and tapped the link again) | Goes back to that screen (`dismissTo`): nothing is pushed, and the room screen goes to the page the room's state says |
| Another room's screens | Drops them all (`dismissAll`), then `replace`s with the new room. Leaving the old seat is M4.10's (Q2 below) |

Found in M4.15's first use on staging: a second tap on the same link pushed a new copy of the room on top of the old one, one more for each tap.

## Layout

**Joining** (the player has a name): `RoomTicket` with the code, left detail `join:link.ticketLeft`, right detail `join:link.ticketRight`, then `join:link.joining` in `body-m` tone `secondary`. `api.join_room(code, ref)` runs at once; `ok` replaces the sheet with `/room/[id]`. Usually under a second, so no spinner.

**First time** (`join_room` answered `name_required`):

1. Eyebrow `mono-eyebrow` tone `marquee`: `join:link.code` with the code.
2. Title `display-m`: `join:link.titleHost` when the host's name is known, otherwise `join:link.title`.
3. `NameForm` (the [name screen's](name.md#new-components) form).
4. `Button` primary L `join:link.join`: saves with `api.update_profile`, then calls `join_room` again (with the same `link_opened_at`). Its answers, as on the [name screen](name.md#states-and-answers-apiupdate_profile) (decisions.md, 3 Nov 2026, M4.17):

| Answer or state | What the player sees |
| --- | --- |
| `invalid_name` | `NameForm` error `onboarding:name.errors.invalid`; `haptics.error()` |
| `name_not_allowed` | `NameForm` error `onboarding:name.errors.notAllowed`; `haptics.error()` |
| `unknown_avatar` | `showToast` warn `common:errors.generic.title`, as a failed request |
| Offline when Join is tapped | `showToast` warn `onboarding:name.errors.offline`; Join works again once connected |
| Request failed | `showToast` warn `common:errors.generic.title` |

**Refused:** an `EmptyState` fills the sheet, with `Button` secondary L `join:actions.host` and `Button` ghost L `join:link.anotherCode` (to [the code](join-code.md)) below it.

## Answers (`api.join_room` with the room reference)

| Answer | Sheet shows | Icon | Haptic | Next |
| --- | --- | --- | --- | --- |
| `ok` | | | None | `replace` with `/room/[id]`: the lobby, or straight into swiping |
| `name_required` | First time | | None | Join |
| `starting` | Joining, with `join:shuffling` | | None | Retries every second for up to 10 seconds, then `join:errors.starting` with Retry |
| `closed` | Refused, `join:errors.closed` | `ticket` | `haptics.error()` | Host, or another code |
| `not_found` | Refused, `join:errors.closed` (for a link, a missing room has ended) | `ticket` | `haptics.error()` | Host, or another code |
| `full` | Refused, `join:errors.full` | `users` | `haptics.error()` | Host, or another code |
| `in_finale` | Refused, `join:errors.inFinale` | `clock` | `haptics.error()` | Host, or another code |
| `removed` (planned, M4.2) | Refused, `join:errors.removed` | `ban` | `haptics.error()` | Host, or another code |
| `locked` (planned, M4.2) | Refused, `join:errors.locked` | `lock` | `haptics.error()` | Host, or another code |
| `rate_limited` | Refused, `join:errors.rateLimited` | `clock` | `haptics.error()` | Another code later |
| Offline | Refused, `join:errors.offline`, `EmptyState` without `error` | `wifi-off` | None | Joins by itself when the connection comes back |
| The call failed | Refused, `join:errors.network` | `alert` | `haptics.error()` | Retry |
| A malformed link ([links](#links)) | Refused, `join:errors.closed` | `ticket` | None | Another code |
| Signing in failed (cold start) | Refused, `join:errors.network` | `alert` | `haptics.error()` | Retry |

`removed` and `locked` ship in M4.15 against `PLANNED_JOIN_ROOM_ANSWERS`, as on the code screen. A Jest test walks both lists and fails if an answer has no row here.

## Copy (`join` namespace)

The refusal messages are the [code screen's](join-code.md#copy-join-namespace). New keys:

| Key | French | English |
| --- | --- | --- |
| `link.joining` | On te fait entrer… | Getting you in… |
| `link.ticketLeft` | Invitation | You're invited |
| `link.ticketRight` | Ce soir | Tonight |
| `link.code` | Salle {{code}} | Room {{code}} |
| `link.title` | Rejoins la soirée film | Join the movie night |
| `link.titleHost` | Rejoins la soirée de {{name}} | Join {{name}}'s movie night |
| `link.join` | Rejoindre | Join |
| `link.anotherCode` | Entrer un autre code | Enter another code |

The code is shown with a space in the middle ("482 913"), as `RoomTicket` does.

## Motion, haptics, sound

- The sheet uses the system's presentation; on `ok` the room screen comes in with `layout.fadeIn`.
- Refusals: `haptics.error()` once, when the `EmptyState` appears (`layout.fadeIn`).

## Accessibility

- Focus goes to the sheet's title (or the ticket while joining, read as "Room code 4 8 2 9 1 3").
- First time: title, the color group, the name field, Join. Refused: the message, then its buttons.
- The sheet can be closed with the system's escape gesture and the grabber.
- Reduce Motion: no fades.

## Questions

Harry accepted every default below on 30 October 2026.

1. **The host's name before joining.** "Join Harry's movie night" needs the host's first name, which `join_room` doesn't return before a seat exists. Default: M4.1 adds the host's display name to the `name_required` answer as `host_name` (names already show to anyone who joins); when it's null the title is `join:link.title`.
2. **Already in another room.** A player whose phone keeps an open room taps a link to a different one. Default: join the new room and leave the old seat (`api.leave_room`) once the new join answers `ok`. This needs the kept room, which arrives with the room layout (M4.10): M4.10 wires it into this sheet and the code screen, unless M4.15 merges after M4.10 (slice 6, Q8.4).
3. **Sheet or full screen on a cold start.** Default: a sheet over Home or Welcome, as above, so the presentation is the same whether the app was open or not.

Harry accepted every default of slice 6's plan on 3 November 2026; this spec now says each one:

4. **Malformed links** (Q15.2) show the refused sheet; a link with no `r` joins by code.
5. **Who invited you** (Q15.3): the lobby and the swipe screen's player row show the host's name and the players; no extra step.
6. **`via` and `link_opened_at`** (Q15.5): `link`, and the moment the app received the URL, corrected with `serverNow()`.
7. **The session not ready** (Q15.7): Joining until `startSession()` resolves; a sign-in failure shows Refused with Retry.
8. **`removed` and `locked`** (Q1.6) get their rows now.

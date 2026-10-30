# Join sheet

New, not in the Figma ([onboarding's Figma changes](../../product/onboarding.md#changes-to-the-figma) asks for it). Route `/join/[code]`, the target of every invite link and invite QR code. Built in M4.15, with the room reference from M4.1. Written on 30 October 2026 from [app installed](../../product/onboarding.md#app-installed), [the link](../../product/onboarding.md#the-link) and [invites and deep links](../../architecture/app-structure.md#invites-and-deep-links).

## Purpose

An invited friend taps the link and is in the room: about 5 seconds when they've played before, about 15 the first time (a name, a color, Join). The link skips Welcome and Home.

## Presentation

A `formSheet` over Home (over Welcome for a player with no name yet). On a cold start, the root layout puts that screen underneath first, so closing the sheet always lands somewhere sensible. The link is `https://<domain>/join/<code>?r=<ref>`; the route reads both.

## Layout

**Joining** (the player has a name): `RoomTicket` with the code, left detail `join:link.ticketLeft`, right detail `join:link.ticketRight`, then `join:link.joining` in `body-m` tone `secondary`. `api.join_room(code, ref)` runs at once; `ok` replaces the sheet with `/room/[id]`. Usually under a second, so no spinner.

**First time** (`join_room` answered `name_required`):

1. Eyebrow `mono-eyebrow` tone `marquee`: `join:link.code` with the code.
2. Title `display-m`: `join:link.titleHost` when the host's name is known, otherwise `join:link.title`.
3. `NameForm` (the [name screen's](name.md#new-components) form).
4. `Button` primary L `join:link.join`: saves with `api.update_profile`, then calls `join_room` again. The name answers (`invalid_name`, the blocklist answer) show as on the name screen.

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
| `removed` (M4.2) | Refused, `join:errors.removed` | `ban` | `haptics.error()` | Host, or another code |
| `locked` (M4.2) | Refused, `join:errors.locked` | `lock` | `haptics.error()` | Host, or another code |
| `rate_limited` | Refused, `join:errors.rateLimited` | `clock` | `haptics.error()` | Another code later |
| Offline | Refused, `join:errors.offline`, `EmptyState` without `error` | `wifi-off` | None | Joins by itself when the connection comes back |
| The call failed | Refused, `join:errors.network` | `alert` | `haptics.error()` | Retry |
| A malformed link (not 6 digits) | Refused, `join:errors.closed` | `ticket` | None | Another code |

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

1. **The host's name before joining.** "Join Harry's movie night" needs the host's first name, which `join_room` doesn't return before a seat exists. Default: M4.1 adds the host's display name to the `name_required` answer (names already show to anyone who joins); until then the title is `join:link.title`.
2. **Already in another room.** A player whose phone keeps an open room taps a link to a different one. Default: join the new room and leave the old seat (`api.leave_room`) once the new join answers `ok`.
3. **Sheet or full screen on a cold start.** Default: a sheet over Home or Welcome, as above, so the presentation is the same whether the app was open or not.

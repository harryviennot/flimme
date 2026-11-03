# Join sheet

Route `/join/[code]`, the target of every invite link and invite QR code. Built in M4.15, with the room reference from M4.1; the preview before joining is M4.20, on `api.room_preview` from M4.19. Written on 30 October 2026 and updated on 3 November 2026: slice 6's questions (all defaults accepted by Harry), Harry's call that a link confirms before joining (M4.19 and M4.20's questions, defaults accepted), then the leave line naming the host's room, then slice 7's answers for the kept room (M4.22). Sources: [app installed](../../product/onboarding.md#app-installed), [the link](../../product/onboarding.md#the-link) and [invites and deep links](../../architecture/app-structure.md#invites-and-deep-links).

**The Figma.** Frames N1 `107:1747` (First time) and N2 `107:2042` (Refused) on the First release page. N1 predates the preview: it has no host line, and its note says a named player sees only the ticket. This spec wins; the Figma is updated only when a task asks.

## Purpose

An invited friend taps the link, sees whose movie night it is and how many are in, and taps Join: about 5 seconds when they've played before ("Tap the link, Join"), about 15 the first time (a name, a color, Join). The link skips Welcome and Home.

**Who invited you.** Before joining, the sheet shows the room's ticket, the host's name and avatar, and "N players in", so a stale or forwarded link shows for what it is ([security](../../architecture/security.md#the-app)). Nothing joins before the tap. Other players' names are never shown before joining: a link holder isn't in the room yet, and links get forwarded. The [lobby](lobby.md) shows them after Join (Harry, 3 November 2026).

**Not everywhere.** A player already seated in that room goes straight back in, with no confirm. A link with no `r` joins at once. The keypad ([the code](join-code.md)) is unchanged: a typed code joins at once and gets no preview.

## Presentation

A `formSheet` over Home (over Welcome for a player with no name yet). On a cold start, the root layout puts that screen underneath first, so closing the sheet always lands somewhere sensible.

**A cold start before the session.** A link opens `/join/[code]` without passing through the `/` route, which waits for `startSession()`. The sheet shows the Loading layout (Joining for a link with no `r`) until the session is ready, then calls `room_preview` (or `join_room` for a link with no `r`). If signing in fails, the sheet shows Refused with `join:errors.network` (icon `alert`) and `common:actions.retry`, which tries the sign-in again and then carries on.

## Links

The link is `https://<domain>/join/<code>?r=<ref>` (or `flimme://join/<code>?r=<ref>`, and the development scheme). It is parsed strictly:

| Link | What happens |
| --- | --- |
| Six digits and an `r` that is a uuid | Previews with the code and the reference (`api.roomPreview({ code, ref })`), never `joinRoom`, then joins on Join. A seated player goes straight back in |
| Six digits and no `r` | No preview (there is nothing to preview with): joins at once by code alone, as a typed code does (`not_found` can then come back instead of `closed`). Only a hand-edited link lacks `r` (Q20.1) |
| Anything else: a code that isn't six digits, an `r` that isn't a uuid, another path | The Refused layout with `join:errors.closed` (the malformed row below). [Security](../../architecture/security.md#the-app) said such a link opens Home; the refused sheet wins because it says what happened and offers a next step (decisions.md, 3 Nov 2026) |

**What the call sends.** `api.joinRoom({ code, ref, via: 'link', link_opened_at })`. `link_opened_at` is the moment the app received the URL (the initial URL on a cold start, or the URL event when the app was running), recorded with `Date.now()` at that moment and sent as `new Date(serverNow(receivedAt)).toISOString()` (`mobile/src/lib/server-time.ts`). It stays that moment however long the player takes to tap Join, so "link to first swipe" includes the tap (Q20.7). The `starting` retries and Retry send the same value. On a cold start the phone may not know the server's clock yet, so the value is the phone's own; the server clamps it to the room's lifetime anyway (M4.1).

## A link to a room you are in

**Seated: no confirm.** When the preview answers `ok` with `seated: true`, the sheet shows Joining and calls `join_room` at once (it answers `ok` with `rejoined`): it's their room, so no Join tap (Harry, 3 November 2026, Q20.2).

A link never stacks room screens. When `join_room` answers `ok`, the sheet enters the room by what the stack already holds (`roomEntry` and `enterRoom`, `features/join/enter-room.ts`, #96):

| The stack holds | The sheet |
| --- | --- |
| No room screen | `replace`s itself with the room |
| This room's screen (the player was in it, left the app and tapped the link again) | Goes back to that screen (`dismissTo`): nothing is pushed, and the room screen goes to the page the room's state says |
| Another room's screens | Drops them all (`dismissAll`), then `replace`s with the new room. Leaving the old seat is M4.22's ([leaving the old seat](#leaving-the-old-seat)) |

Found in M4.15's first use on staging: a second tap on the same link pushed a new copy of the room on top of the old one, one more for each tap.

## Layout

The layout is picked from the saved profile (`useMyProfile`): an empty `display_name` gets First time, a name gets Confirm. Nothing calls `join_room` before a tap (Q20.3).

**Loading** (the session starting, the profile loading, the preview in flight): `RoomTicket` with the code, left detail `join:link.ticketLeft`, right detail `join:link.ticketRight`, then a `Skeleton` `h-8 w-56 rounded-sm` for the title and a `Skeleton` `h-10 w-40 rounded-pill` for the host line, centred, `gap-6`. No button yet. Usually under a second.

**Confirm** (a named player, the preview answered `ok`, not `seated`). A column, `gap-6`, centred:

1. `RoomTicket` with the code, `join:link.ticketLeft`, `join:link.ticketRight` (the same ticket as Loading, so only what is below it changes).
2. Title `display-m`, centred, `accessibilityRole="header"`: `join:link.titleHost` when `host_name` is set, otherwise `join:link.title`.
3. The host line (below).
4. `Button` primary L block `join:link.join`. It calls `join_room` ([R3](#answers-apijoin_room-with-the-room-reference)) and shows `loading` until the answer. On `starting`, it stays `loading` and `join:shuffling` shows under it in `body-m` tone `secondary` (a polite live region) while it retries.
5. The leave line (M4.22).

**The host line** (screen piece `components/screens/join-sheet/host-line.tsx`, used by Confirm and First time; no gallery entry, it's single-use). A row, `gap-3`, `items-center`, centred in Confirm and start-aligned in First time: `Avatar` size `m` with the host's name and `toAvatarColor(host_avatar_key)` (`features/profile/device.ts`), then `join:link.players` in `body-m` tone `secondary` with `count` = `players`. With no `host_name` there is no avatar (it needs an initial), only the count. The row is one accessible element (below).

**The count is read once**, when the preview answers, and never refreshed: a player who isn't seated can't listen to the room's topic (Q20.5). Join then answers `full` if it filled up in the meantime. The preview's `state` (`lobby`, `dealing` or `swiping`) isn't shown: late joining is the default, and a `dealing` room answers Join with `starting`, which retries.

**Joining** (the player is seated in that room, or the link has no `r`): `RoomTicket` as above, then `join:link.joining` in `body-m` tone `secondary`. `join_room` runs at once.

**First time** (the saved profile has no name, or `join_room` answered `name_required`):

1. Eyebrow `mono-eyebrow` tone `marquee`: `join:link.code` with the code.
2. Title `display-m`: `join:link.titleHost` when the preview's `host_name` is set, otherwise `join:link.title`.
3. The host line, from the preview.
4. `NameForm` (the [name screen's](name.md#new-components) form).
5. `Button` primary L `join:link.join`: saves with `api.update_profile`, then calls `join_room` once (with the same `link_opened_at`). Its answers, as on the [name screen](name.md#states-and-answers-apiupdate_profile) (decisions.md, 3 Nov 2026, M4.17):

| Answer or state | What the player sees |
| --- | --- |
| `invalid_name` | `NameForm` error `onboarding:name.errors.invalid`; `haptics.error()` |
| `name_not_allowed` | `NameForm` error `onboarding:name.errors.notAllowed`; `haptics.error()` |
| `unknown_avatar` | `showToast` warn `common:errors.generic.title`, as a failed request |
| Offline when Join is tapped | `showToast` warn `onboarding:name.errors.offline`; Join works again once connected |
| Request failed | `showToast` warn `common:errors.generic.title` |

No ticket here: with the keyboard up, the name field must stay in view. The eyebrow carries the code. `name_required` from `join_room` (the saved profile was stale) shows this layout with the preview's host.

**Refused:** an `EmptyState` fills the sheet, with `Button` secondary L `join:actions.host` and `Button` ghost L `join:link.anotherCode` (to [the code](join-code.md)) below it, or `common:actions.retry` for the rows that retry.

### The leave line (M4.10)

Built by M4.22 (M4.10 was split; the heading keeps its old name because decisions.md links to it). M4.10 provides the room the phone keeps (Q20.6). When the phone keeps an open seat in another room, Confirm and First time show `join:link.leaveRoom` in `body-s` tone `muted`, centred under Join: "You'll leave Harry's room". Rooms have no names, so the line names the kept room by its host, not its code (Harry, 3 November 2026). `name` is the kept room's current host: the seat in `api.room_seats` for that room with `role` `host` and no `left_at` (the player is seated there, so they can read it; the crown moves when a host leaves). When that name isn't known (the read hasn't answered, failed, or the phone is offline), the line is `join:link.leaveOtherRoom`: "You'll leave your other room". Not shown when the kept room is this one (that player is seated and goes straight in), nor on Joining (a link with no `r` joins at once).

**A kept room that has ended: no line.** When the kept room's read (`api.room`) says `done` or `abandoned`, returns no room, or the player's own seat there has `left_at`, there is nothing to leave: no line, and the kept room is forgotten (Q22.5). While that read is in flight the line is `join:link.leaveOtherRoom`, and it goes away (`layout.fadeOut`) if the read says the room ended.

### Leaving the old seat

One room at a time: this holds on every path into a room that isn't the kept one, including a link whose preview says the player is already seated (the sheet joins at once, with no Confirm and no leave line, because there is no sheet to show it on). That path calls `join_room` like any other, so the kept room is left the same way after `ok`. A link to the kept room itself leaves nothing. The kept room's id is read before the call (for the join sheet, when the sheet opens), never after the answer: the new room's layout writes itself as the kept room as soon as it mounts, so a late read would see the new room and leave nothing.

After the new room's `join_room` answers `ok`, the phone calls `api.leaveRoom` on the kept room once, without waiting for it and without retries, then keeps the new room instead (Q22.3). Nothing shows whatever happens: `ok` and `not_in_room` are both fine, and if the call fails or the phone goes offline, the old seat goes silent and stops counting after 90 seconds, as any silent seat does. Opening a room as host ([host setup](host-setup.md), `create_room` answers `ok`) leaves the kept room the same way.

## Preview answers (`api.room_preview`)

Called on open for a link with `r`, after `startSession()`. A refusal shows on open, before any tap: the stale link shows for what it is at once (Q20.4). Each refusal reuses the matching `join_room` row below, its message, icon and haptic.

| Answer | Sheet shows | Icon | Haptic | Next |
| --- | --- | --- | --- | --- |
| `ok`, not `seated`, named player | Confirm | | None | Join |
| `ok`, not `seated`, no saved name | First time with the host line | | None | Name, color, Join |
| `ok`, `seated` | Joining, then `join_room` at once | | None | The room, by [the stack](#a-link-to-a-room-you-are-in) |
| `closed` | Refused, `join:errors.closed` | `ticket` | `haptics.error()` | Host, or another code |
| `full` | Refused, `join:errors.full` with `max` = `max_players` | `users` | `haptics.error()` | Host, or another code |
| `in_finale` | Refused, `join:errors.inFinale` | `clock` | `haptics.error()` | Host, or another code |
| `rate_limited` | Refused, `join:errors.rateLimited` | `clock` | `haptics.error()` | Another code later |
| `removed` | Refused, `join:errors.removed` | `ban` | `haptics.error()` | Host, or another code |
| `locked` | Refused, `join:errors.locked` | `lock` | `haptics.error()` | Host, or another code |
| Offline | Refused, `join:errors.offline`, `EmptyState` without `error` | `wifi-off` | None | Previews again by itself when the connection comes back (never joins) |
| The call failed | Refused, `join:errors.network` | `alert` | `haptics.error()` | Retry runs the preview again |

A Jest test walks `ROOM_PREVIEW_ANSWERS` and `PLANNED_ROOM_PREVIEW_ANSWERS` and fails if an answer has no row here.

## Answers (`api.join_room` with the room reference)

After Join (Confirm or First time), or at once for a seated player or a link with no `r`. Unchanged by the preview (`JOIN_SHEET_ROWS`, `STARTING_RETRIES`, `STARTING_RETRY_MS`).

| Answer | Sheet shows | Icon | Haptic | Next |
| --- | --- | --- | --- | --- |
| `ok` | | | None | Enters the room by [the stack](#a-link-to-a-room-you-are-in): the lobby, or straight into swiping |
| `name_required` | First time | | None | Join |
| `starting` | Joining with `join:shuffling` (Confirm: under the loading Join) | | None | Retries every second for up to 10 seconds, then `join:errors.starting` with Retry |
| `closed` | Refused, `join:errors.closed` | `ticket` | `haptics.error()` | Host, or another code |
| `not_found` | Refused, `join:errors.closed` (for a link, a missing room has ended) | `ticket` | `haptics.error()` | Host, or another code |
| `full` | Refused, `join:errors.full` | `users` | `haptics.error()` | Host, or another code |
| `in_finale` | Refused, `join:errors.inFinale` | `clock` | `haptics.error()` | Host, or another code |
| `removed` | Refused, `join:errors.removed` | `ban` | `haptics.error()` | Host, or another code |
| `locked` | Refused, `join:errors.locked` | `lock` | `haptics.error()` | Host, or another code |
| `rate_limited` | Refused, `join:errors.rateLimited` | `clock` | `haptics.error()` | Another code later |
| Offline | Refused, `join:errors.offline`, `EmptyState` without `error` | `wifi-off` | None | Joins by itself when the connection comes back |
| The call failed | Refused, `join:errors.network` | `alert` | `haptics.error()` | Retry |
| A malformed link ([links](#links)) | Refused, `join:errors.closed` | `ticket` | None | Another code |
| Signing in failed (cold start) | Refused, `join:errors.network` | `alert` | `haptics.error()` | Retry |

`removed` and `locked` ship in M4.15 as on the code screen. A Jest test walks `JOIN_ROOM_ANSWERS` and fails if an answer has no row here.

## Copy (`join` namespace)

The refusal messages are the [code screen's](join-code.md#copy-join-namespace). `link.ticketLeft` and `link.ticketRight` are also the [invite page's](invite-page.md) (M4.14): keep them, add keys instead. Existing keys:

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

New keys (M4.20, and `link.leaveRoom` and `link.leaveOtherRoom` for M4.22):

| Key | French | English |
| --- | --- | --- |
| `link.players_one` | {{count}} joueur déjà là | {{count}} player in |
| `link.players_other` | {{count}} joueurs déjà là | {{count}} players in |
| `link.leaveRoom` | Tu quitteras la salle de {{name}} | You'll leave {{name}}'s room |
| `link.leaveOtherRoom` | Tu quitteras ton autre salle | You'll leave your other room |
| `a11y.hostLine_one` | Hôte : {{name}}. {{count}} joueur déjà là | Host: {{name}}. {{count}} player in |
| `a11y.hostLine_other` | Hôte : {{name}}. {{count}} joueurs déjà là | Host: {{name}}. {{count}} players in |

The code is shown with a space in the middle ("482 913"), as `RoomTicket` does. `count` goes through i18next's plurals (French treats 0 and 1 as singular) and `Intl` formatting.

## Motion, haptics, sound

- The sheet uses the system's presentation; on `ok` the room screen comes in with `layout.fadeIn`.
- Loading to Confirm: the ticket stays put; the title, the host line and Join replace the skeletons with `layout.fadeIn`. No haptic: the preview isn't a moment.
- Join: `haptics.press()` (Pressable's default), then `loading` on the button. No celebration until the room.
- Refusals: `haptics.error()` once, when the `EmptyState` appears (`layout.fadeIn`), on open for a preview refusal.

## Accessibility

- Focus goes to the ticket while loading or joining, read as "Room code 4 8 2 9 1 3"; when the preview answers, it moves to the title. `Skeleton`s are hidden from screen readers.
- Confirm: the ticket, the title, the host line, Join, then the leave line. The host line is read once as `join:a11y.hostLine` ("Host: Harry. 3 players in"), or `join:link.players` alone when there is no host name; the avatar isn't read on its own.
- First time: title, the host line, the color group, the name field, Join. Refused: the message, then its buttons.
- Join reads as busy while `loading`; `join:shuffling` is announced (polite live region).
- The sheet can be closed with the system's escape gesture and the grabber.
- Reduce Motion: no fades.

## Questions

Harry accepted every default below on 30 October 2026.

1. **The host's name before joining.** "Join Harry's movie night" needs the host's first name, which `join_room` doesn't return before a seat exists. Default: M4.1 adds the host's display name to the `name_required` answer as `host_name` (names already show to anyone who joins); when it's null the title is `join:link.title`. Since M4.20 the preview gives the host's name to every layout.
2. **Already in another room.** A player whose phone keeps an open room taps a link to a different one. Default: join the new room and leave the old seat (`api.leave_room`) once the new join answers `ok`. This needs the kept room, which arrives with the room layout (M4.10); M4.22 wires it into this sheet and the code screen and builds the [leave line](#the-leave-line-m410).
3. **Sheet or full screen on a cold start.** Default: a sheet over Home or Welcome, as above, so the presentation is the same whether the app was open or not.

Harry accepted every default of slice 6's plan on 3 November 2026; this spec now says each one:

4. **Malformed links** (Q15.2) show the refused sheet; a link with no `r` joins by code.
5. **Who invited you** (Q15.3): the lobby and the swipe screen's player row show the host's name and the players; no extra step. Replaced the same day by the preview (below).
6. **`via` and `link_opened_at`** (Q15.5): `link`, and the moment the app received the URL, corrected with `serverNow()`.
7. **The session not ready** (Q15.7): Loading (or Joining) until `startSession()` resolves; a sign-in failure shows Refused with Retry.
8. **`removed` and `locked`** (Q1.6) get their rows now.

Later on 3 November 2026, after trying invite links on his phone, Harry decided a link confirms before joining: new joins only, a seated player goes straight back in "with no confirm", the keypad unchanged. He accepted M4.20's other defaults:

9. **No `r`** (Q20.1): no preview, joins at once.
10. **Seated** (Q20.2): straight back in, no confirm.
11. **First time from the saved profile** (Q20.3), with `name_required` as a fallback.
12. **Preview refusals on open** (Q20.4), with Retry when the call fails.
13. **The count read once** (Q20.5).
14. **The leave line** (Q20.6) specced here, built by M4.10 (M4.22 since the split).
15. **About 5 seconds, `link_opened_at` at the URL's arrival** (Q20.7).

Harry accepted every default of slice 7's plan on 3 November 2026; this spec now says each one:

16. **Leaving the old seat** (Q22.3): once, after the new room's `ok`, without waiting or retrying; a failure leaves a silent seat that stops counting after 90 seconds.
17. **A kept room that has ended** (Q22.5): no leave line, and the kept room is forgotten.

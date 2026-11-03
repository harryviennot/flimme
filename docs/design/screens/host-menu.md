# Host menu

The Figma's N4 Host menu (`110:1846`, a draft). Three parts: the **seat sheet** a player opens from a seat row (Report for everyone, built in M7.2; Remove for the host, added in M4.13), the **lock row** on the lobby (M4.13), and **the removed player's side** (M4.13). Backend: `api.remove_member` (M4.2) and `api.set_room_locked` (M4.23). Written on 3 November 2026 from slice 8's plan (Harry accepted every default that day: Q2.1, Q7.1, Q13.1 to Q13.4), [room codes and the host](../../architecture/security.md#room-codes-joining-and-the-host) and [the lobby](lobby.md). The report itself is the [report sheet](report-sheet.md).

## Purpose

The host can get a troll out and keep strangers out, in two taps, without stopping the night. Anyone can flag a player. Nobody in the room learns who reported or why.

## The seat sheet

Route `/room/[id]/seat/[memberId]`, a `formSheet` with the grabber and `sheetAllowedDetents: 'fitToContents'`, declared in the room layout beside the invite sheet. It opens from a tap on any [seat row](lobby.md#the-seat-row-screenslobbyseat-rowtsx) but the player's own (Q7.1). A sheet stays open when the room changes state under it (the room layout's rule), so it still works after Start.

Layout, `p-5`, `gap-3`:

1. **Header**, a row with `gap-3.5`: `Avatar` M in the seat's color (with `online` as on the row); the name in `title-m`; under it, in `mono-data` tone `muted`, the seat's services by [name](lobby.md#service-names) (or `lobby:seat.noServices`), followed by ` · ` and `lobby:seat.away` when the seat is away. The host's seat gets the crown `Tag` (`lobby:seat.host`) on the right, as on the row. `IconButton` plain `x` (`common:actions.close`) at the top right, for screen readers.
2. **Host only: `Button` danger L, `block`, icon `ban`, `lobby:seatSheet.remove`.** It opens the remove confirm (below).
3. **Everyone: `Button` secondary L, `block`, icon `shield`, `lobby:seatSheet.report`.** It replaces the seat sheet with the [report sheet](report-sheet.md) (`router.replace`, so only one sheet is ever open; close goes back to the lobby).

A guest sees the header and Report. The host sees the header, Remove and Report. The buttons carry the name in their accessibility label only (`lobby:a11y.remove`, `lobby:a11y.report`): a long name would not fit an uppercase button at 375 points.

| While the sheet is open | The sheet |
| --- | --- |
| The seat leaves or is removed (`member_left`, `member_removed`) | Closes by itself |
| The host role moves to this phone (`host_changed`) | Remove appears |
| The host role moves away from this phone | Remove disappears |
| The seat's services or presence change | The header follows |

### Remove, and its confirm

Remove opens the system alert `lobby:remove.title` (naming the player), body `lobby:remove.body`, buttons `common:actions.cancel` and `lobby:remove.confirm` (destructive). Confirm calls `api.removeMember({ room_id, member_id })`; Remove shows `loading` and Report is disabled meanwhile.

| Answer (`api.remove_member`) | What the host sees |
| --- | --- |
| `ok` | The sheet closes. The row leaves the lobby with `layout.fadeOut` when `member_removed` re-reads the seats (on every phone). No toast: the row leaving says it |
| `not_in_room` (the seat is already gone) | The sheet closes; the seats are re-read |
| `closed` (the room ended) | The sheet closes; the room is re-read and the layout follows its state |
| Offline | `showToast` warn `common:states.offlineRoom`; the sheet stays, Remove works again |
| The call failed (online) | `showToast` warn `lobby:errors.remove`; the sheet stays, Remove works again |

A `42501` or `22023` (not the host, or the player's own seat) is a bug the app never offers: it goes to Sentry and shows as the failed row.

**The other phones** see the row leave, exactly as when someone leaves, and a screen reader says `lobby:a11y.left`. Nothing says the seat was removed, or by whom.

## Lock room

**Where:** on the room, not on a seat (Q13.1). The Figma's draft puts the lock toggle inside the seat sheet; it moves to the lobby, because locking is about the room, and the host should find it without tapping a player. Not the `TopBar` (its one action is invite) and not the ticket (it reads across the couch and takes no taps).

**The lock row** (host only, in the lobby under the seats, where guests have their services row): `ListRow` icon `lock`, label `lobby:lock.label`, `trailing` a `Toggle` (`accessibilityLabel` `lobby:lock.label`), then under the group a `body-s` tone `muted` line `lobby:lock.helper`.

The toggle flips at once (`timing.toggle`, `haptics.press()`), then calls `api.setRoomLocked({ room_id, locked })`; it is disabled until the answer.

| Answer (`api.set_room_locked`) | What the host sees |
| --- | --- |
| `ok` `{ locked }` | The toggle stays where it is. Every phone re-reads the room on `room_locked` and the ticket shows the state (below) |
| `closed` | The room is re-read; the layout follows its state |
| Offline | The toggle flips back; `showToast` warn `common:states.offlineRoom` |
| The call failed (online) | The toggle flips back; `showToast` warn `lobby:errors.lock` |

**The locked state, for everyone.** While `api.rooms.locked` is true, the `RoomTicket` shows a `Tag` tone `neutral`, icon `lock`, `common:ticket.locked`, at the ticket's top right (`top-3 right-3`, above the code, never over it). The ticket's accessibility label adds `common:ticket.lockedA11y`. The [invite sheet](invite-sheet.md#locked) says it too. The lock stays when the host leaves (the new host can unlock); seated players, including those who left, can always come back (`join_room`'s rejoin comes first).

**Design-system change:** `RoomTicket` (shared) gains an optional `locked` prop that draws the tag; the gallery entry gets a locked state. No new token.

## The removed player's side

A removed phone goes Home with one message, whichever way it learns (Q13.2, Q13.3):

| How the phone learns | When |
| --- | --- |
| `member_removed` names this phone's own seat | Its channel still hears the topic (the usual case) |
| The room read returns null for the kept room | It missed the event (asleep, offline); a seat that left still reads the room, only a removed one can't (decisions.md, M1.8) |
| `join_room` answers `removed` on launch | The [splash](splash.md#the-kept-room-m422)'s rejoin |
| `join_room` or `room_preview` answers `removed` | The [code screen](join-code.md) and the [join sheet](join-sheet.md) already show `join:errors.removed` |

In the first three cases the phone forgets the kept room, leaves the room stack the same way Leave does ([leaving](lobby.md#leaving)), and Home shows `showToast` info with the title `join:errors.removed`. No alert to dismiss, no haptic, no sound: the night goes on for everyone else, and the message stays calm. The toast fires once: a later null read of a room the phone no longer keeps says nothing.

## Copy

`lobby` namespace:

| Key | French | English |
| --- | --- | --- |
| `seatSheet.remove` | Retirer de la salle | Remove from room |
| `seatSheet.report` | Signaler | Report |
| `remove.title` | Retirer {{name}} ? | Remove {{name}}? |
| `remove.body` | {{name}} ne pourra pas revenir dans cette salle. | {{name}} won't be able to come back to this room. |
| `remove.confirm` | Retirer | Remove |
| `lock.label` | Verrouiller la salle | Lock the room |
| `lock.helper` | Personne de nouveau ne peut entrer. Ceux qui sont déjà venus peuvent revenir. | Nobody new can join. Anyone who's been in can come back. |
| `errors.remove` | Impossible de retirer ce joueur. Réessaie. | We couldn't remove this player. Try again. |
| `errors.lock` | Impossible de changer le verrou. Réessaie. | We couldn't change the lock. Try again. |
| `a11y.seat` | Ouvrir les options pour {{name}} | Open options for {{name}} |
| `a11y.remove` | Retirer {{name}} de la salle | Remove {{name}} from the room |
| `a11y.report` | Signaler {{name}} | Report {{name}} |

`common` namespace (the ticket is shared):

| Key | French | English |
| --- | --- | --- |
| `ticket.locked` | Verrouillée | Locked |
| `ticket.lockedA11y` | Salle verrouillée | Room locked |

Reused: `join:errors.removed` (L'hôte t'a retiré de cette salle. / The host removed you from this room.), `lobby:seat.*`, `common:actions.cancel`, `common:actions.close`, `common:states.offlineRoom`.

## Motion, haptics, sound

- The sheet uses the system's sheet motion; the seat sheet gives way to the report sheet with the same.
- Buttons and the toggle press with `haptics.press()` (`Pressable`, `Toggle`). No haptic on `ok`: removing someone isn't a moment to celebrate, and the vocabulary has no word for it.
- The removed row leaves with `layout.fadeOut`, as a departure does. The ticket's tag comes and goes with `layout.fadeIn` and `layout.fadeOut`.
- The removed phone's toast comes in with `layout.toastIn`. No sound anywhere here.

## Accessibility

- A seat row with a sheet is a button labelled with its usual reading, with `lobby:a11y.seat` as its hint. The player's own row is not a button.
- In the sheet, focus goes to the name. Order: name (with services, away and host), Remove, Report, close.
- The lock row reads as a switch: `lobby:lock.label`, on or off, with `lobby:lock.helper` as its hint.
- The removed toast is announced (the `Toast`'s live region).
- Reduce Motion: the row and the tag appear and disappear without movement.

## Privacy

- Nothing on any phone but the host's says who removed a player, beyond "the host". The other phones see a departure.
- Logs, Sentry and PostHog get ids only, never a name or a code; no PostHog event at all from a room with an age cap under 13 (the privacy-and-kids skill).

## Differences from the Figma

- The lock toggle leaves the seat sheet for the lobby's lock row (Q13.1).
- The Remove button reads "Remove from room" instead of "Remove Jo from the room": the name is in the header, and long names wouldn't fit.
- The header's subtitle shows services and away; the draft shows "Max · away", which mixes a name in.
- A close button for screen readers, as on the invite sheet.

## Questions

Harry accepted every default on 3 November 2026 (slice 8): one seat sheet from the row (Q13.1), Lock on the room (Q13.1), the removed phone goes Home with the message on every path (Q13.2, Q13.3), Report on every row but your own (Q7.1). The spec chooses the lock row's place (the lobby, under the seats) and the ticket's locked tag; both follow from Q13.1.

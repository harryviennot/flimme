# Lobby

Screen 08 in the Figma (`15:607`). Route `/room/[id]/lobby`, under the room layout (`/room/[id]/_layout.tsx`). Built in M4.11 on the room layout from M4.10, with the host passing on from M4.5. Written on 30 October 2026 from [the lobby](../../product/onboarding.md#the-lobby), [realtime](../../architecture/app-structure.md#realtime), [who counts](../../product/game-modes.md#who-counts-presence-joining-and-leaving), [the room's lobby flow](../../architecture/data-model.md#lobby) and [room codes and the host](../../architecture/security.md#room-codes-joining-and-the-host). Connection states are in [Reconnecting](reconnecting.md).

## Purpose

Everyone sees who's here, live, and the host starts when they like. The code reads across a couch. Nobody waits for stragglers.

## Layout

`Screen` with `scroll`. Header: `TopBar` with back (leave, below), title `lobby:topBar`, and the action `share` (`lobby:a11y.invite`), which opens the [invite sheet](invite-sheet.md).

1. **`RoomTicket`**: the code, left detail `lobby:ticket.players` (present seats of the room's maximum), right detail `lobby:ticket.host`.
2. **Two buttons** in a row, each half the width: `Button` secondary S, icon `link`, `lobby:shareLink` (the system share sheet straight away, with the [invite sheet's](invite-sheet.md) message); `Button` secondary S, icon `qr`, `lobby:showQr` (the invite sheet).
3. **The rules line**, `body-s` tone `secondary`: `lobby:rules.quickMatch`. For guests who didn't choose the mode; everyone sees it.
4. **Eyebrow** `lobby:inTheRoom`, then **the seats** in one `bg-bg-surface` group with a `border-border-default` hairline and `rounded-lg`, one `SeatRow` per seat (new, `screens/lobby/seat-row.tsx`, spec below), in join order.
5. **The room's services**, `body-s` tone `muted`: `lobby:roomServices`, from `api.rooms.provider_ids`, listed with `Intl.ListFormat`.
6. **Guests only: `ListRow`** icon `tv`, label `lobby:yourServices.label`, value the guest's services or `lobby:yourServices.optional`, chevron. It opens the services sheet (below).

**Footer, host:** `Button` primary L, icon `play`, `lobby:start.cta`, and under it one `body-s` muted line: `lobby:start.needPlayers` while fewer than the mode's minimum are present (the button disabled), or `lobby:start.away` when some seats are away (the button enabled).

**Footer, guest:** `MarqueeBulbs` (still, `count` 12) over `lobby:waiting` in `body-m` tone `secondary`, centred.

**The services sheet** (`/room/[id]/services`, a `formSheet` like the invite sheet): title `display-s` `lobby:servicesSheet.title`, helper `lobby:servicesSheet.helper`, the [`ServiceGrid`](host-setup.md#new-component), and `Button` primary L `lobby:servicesSheet.done`. Done saves to the profile (`api.set_my_providers`) and to the seat (`api.set_seat_prefs`), then closes. It never blocks the start.

## The seat row (`screens/lobby/seat-row.tsx`)

56 points high or more, `p-4`, `gap-3.5`, a `border-border-subtle` bottom hairline (none on the last row).

- `Avatar` M in the seat's color, with `online` while the seat is present on `room:<id>:live`.
- Name in `body-m-strong`, with `lobby:seat.you` for the player's own seat; under it the seat's services in `mono-data` tone `muted` (or `lobby:seat.noServices`). Services show for everyone: it's how a host spots a seat padding the deck ([security](../../architecture/security.md#room-codes-joining-and-the-host)).
- On the right, at most one `Tag`: the host gets tone `marquee`, icon `crown`, `lobby:seat.host`; an away seat (not heard from for 90 seconds) gets tone `neutral`, `lobby:seat.away`, and its name turns tone `muted`.
- Props: `name`, `color`, `services`, `isHost`, `isMe`, `present`, and an optional `onPress` that only the host menu uses (slice 8, M4.13).

## Starting

| Step or answer (`api.start_game`) | What players see |
| --- | --- |
| The host taps Start | `Button` `loading` |
| `dealing` | Everyone: the **shuffling overlay** (`screens/lobby/shuffling-overlay.tsx`) over the lobby: `bg-overlay-card`, `Spotlight tone="marquee"`, `display-m` `lobby:shuffling`, `MarqueeBulbs` still |
| Still `dealing` after 8 seconds | The host's phone calls `start_game` again, which deals the SQL baseline. Nothing changes on screen |
| Still `dealing` after 20 seconds | Host: `lobby:shufflingSlow` and `common:actions.retry` on the overlay. Guests: the same line, no button |
| The room moves to `swiping` | The room layout replaces the lobby with the swipe screen |
| `not_enough_players` | The helper shows `lobby:start.needPlayers` with `need`; `haptics.error()` |
| `closed` | The room is re-read and the layout follows its state |
| The call failed | `showToast` warn `lobby:errors.start`; the button works again |

## Live changes (from the room layout)

| Event | The lobby |
| --- | --- |
| `member_joined` | The seats are re-read; the new row comes in, its avatar with `layout.popIn`; the ticket's count changes |
| `member_left` | The row leaves with `layout.fadeOut` |
| `seat_updated` | The row's services change |
| `settings_changed` | The room is re-read (the services line) |
| `host_changed`, or `member_left` with `new_host_member_id` | The crown moves. On the new host's phone: `showToast` info `lobby:youreHost.*`, and the footer becomes Start |
| Presence on `room:<id>:live` | Online dots and the away tag |
| `state_changed` | The layout moves to the state's screen (`abandoned` goes to Room closed, slice 13) |

## Leaving

Back (and Android's back) opens the system alert `lobby:leave.title`, with `lobby:leave.bodyGuest`, or `lobby:leave.bodyHost` naming the next host (the longest-seated present player), and the buttons `lobby:leave.stay` and `lobby:leave.confirm` (destructive). Leave calls `api.leave_room` and goes Home (`replace`); `not_in_room` goes Home too. Offline: `showToast` warn `common:states.offlineRoom` and nothing else.

## Other states

| State | What players see |
| --- | --- |
| First load | `Skeleton` for the ticket (its height, `rounded-lg`) and three seat rows |
| Only the host | One row, then a row inside the group: `Icon` `users` and `lobby:alone` in `body-s` muted |
| Full (10 of 10) | The same lobby; the count says it |
| Reconnecting or offline | See [Reconnecting](reconnecting.md); Start is disabled until the room is fresh again |
| The player's seat is gone (removed) | Slice 8 (M4.13) |

## Copy (`lobby` namespace)

| Key | French | English |
| --- | --- | --- |
| `topBar` | Avant la séance | Lobby |
| `a11y.invite` | Inviter des amis | Invite friends |
| `ticket.players_one` | {{count}} joueur sur {{max}} | {{count}} of {{max}} players |
| `ticket.players_other` | {{count}} joueurs sur {{max}} | {{count}} of {{max}} players |
| `ticket.host` | Hôte · {{name}} | Host · {{name}} |
| `shareLink` | Partager le lien | Share link |
| `showQr` | Voir le QR code | Show QR |
| `rules.quickMatch` | Partie rapide : on swipe jusqu'à tomber d'accord sur un film. Pas de match ? Un vote rapide tranche. | Quick Match: swipe until you agree on a film. No match? A quick final vote decides. |
| `inTheRoom` | Dans la salle | In the room |
| `seat.you` | {{name}} (toi) | {{name}} (you) |
| `seat.noServices` | Pas encore de plateformes | No services yet |
| `seat.host` | Hôte | Host |
| `seat.away` | Pas là | Away |
| `alone` | Personne d'autre pour l'instant. Partage le code. | Nobody else yet. Share the code. |
| `roomServices` | Cette salle peut regarder sur {{list}}. | This room can watch on {{list}}. |
| `yourServices.label` | Tes plateformes | Your services |
| `yourServices.optional` | Facultatif | Optional |
| `servicesSheet.title` | Tes plateformes | Your services |
| `servicesSheet.helper` | Facultatif : ça ajoute des films. | Optional: adds more films. |
| `servicesSheet.done` | C'est bon | Done |
| `start.cta` | Lancer la séance | Start swiping |
| `start.needPlayers` | Il faut {{count}} joueurs présents pour lancer. | You need {{count}} players here to start. |
| `start.away_one` | {{names}} n'est pas là. Tu peux lancer sans attendre. | {{names}} is away. You can start without them. |
| `start.away_other` | {{names}} ne sont pas là. Tu peux lancer sans attendre. | {{names}} are away. You can start without them. |
| `waiting` | On attend que {{name}} lance la séance… | Waiting for {{name}} to start… |
| `shuffling` | On mélange les cartes… | Shuffling the deck… |
| `shufflingSlow` | Ça prend plus de temps que prévu. | This is taking longer than usual. |
| `youreHost.title` | Tu es l'hôte maintenant | You're the host now |
| `youreHost.message` | Lance la séance quand vous êtes prêts. | Start whenever you're ready. |
| `leave.title` | Quitter la salle ? | Leave the room? |
| `leave.bodyGuest` | Tu pourras revenir avec le code. | You can come back with the code. |
| `leave.bodyHost` | {{name}} deviendra l'hôte. | {{name}} becomes the host. |
| `leave.stay` | Rester | Stay |
| `leave.confirm` | Quitter | Leave |
| `errors.start` | Impossible de lancer la séance. Réessaie. | We couldn't start the game. Try again. |
| `a11y.joined` | {{name}} est là | {{name}} is here |
| `a11y.left` | {{name}} a quitté la salle | {{name}} left |
| `a11y.leave` | Quitter la salle | Leave the room |

The away names are listed with `Intl.ListFormat`. The host alone leaving has no body, just the title.

## Motion, haptics, sound

- Arrivals: the row with `layout.fadeIn`, the avatar with `layout.popIn` (the arcade overshoot). Small, because a friend arriving is good news, not the match.
- No haptic for arrivals or departures: phones shouldn't buzz for every friend, and the vocabulary has no word for it.
- The shuffling overlay comes in with `layout.fadeIn` on every phone at once; no haptic and no sound (sound is only for the match and the reveal).
- The host-change toast uses `Toast` (`layout.toastIn`).
- `haptics.error()` only for `not_enough_players`.

## Accessibility

- Focus order: back (`lobby:a11y.leave`), title, invite, the ticket (read as "Room code 4 8 2 9 1 3, 3 of 10 players, host Harry"), Share link, Show QR, the rules line, "In the room" (header), each seat as one element ("Sam, here, Netflix, Disney+"; the host's says "host"), the room's services, your services, Start (its helper as the hint).
- Arrivals and departures are announced politely (`lobby:a11y.joined`, `lobby:a11y.left`), at most one announcement a second.
- The shuffling overlay takes focus and reads `lobby:shuffling`.
- Reduce Motion: rows and the overlay appear without movement.

## Design-system change

**A `crown` icon** in `mobile/assets/icons/` and the `Icon` names, drawn like the set (24 points, 2-point stroke), for the host's tag. M4.11 asks for "the host's crown" and the set has none.

## Differences from the Figma

- No "Taste check 5/8" or "Letterboxd linked": both wait (M19, M20). No "Ready" tag: everyone in the lobby is ready. "Joining" becomes "Away", which presence can actually tell.
- The host's tag gets a crown (the Figma writes "Host ·" in the details).
- The guest's services row and the rules line are new, as [onboarding's Figma changes](../../product/onboarding.md#changes-to-the-figma) ask. The taste check card for the host isn't here (M19).
- The Figma's helper "Jo is still joining. You can start without them." becomes the away line.

## Questions

1. **The crown.** Default: the new `crown` icon in a marquee `Tag`. Without a new icon, the tag would be the word alone.
2. **The Quick Match name in French.** The glossary has none. Default: "Partie rapide" (proposed, needs Harry's yes).
3. **Services for the host in the lobby.** M4.11 gives the row to guests. Default: guests only; the host set theirs on the setup screen a minute ago.
4. **The 20-second "taking longer" line.** Default: 20 seconds after Start (the SQL baseline deals at 8).

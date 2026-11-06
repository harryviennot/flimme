# Lobby

Screen 08 in the Figma (`15:607`). Route `/room/[id]/lobby`, under the room layout (`/room/[id]/_layout.tsx`). Built in M4.11 on the room layout (M4.10) and its Realtime (M4.21), with the host passing on from M4.5. Written on 30 October 2026, updated on 6 November 2026 for the per-player genres (M6.54), and on 3 November 2026 (slice 7's answers, then slice 9's too-few start) from [the lobby](../../product/onboarding.md#the-lobby), [realtime](../../architecture/app-structure.md#realtime), [who counts](../../product/game-modes.md#who-counts-presence-joining-and-leaving), [the room's lobby flow](../../architecture/data-model.md#lobby) and [room codes and the host](../../architecture/security.md#room-codes-joining-and-the-host). Connection states are in [Reconnecting](reconnecting.md).

## Purpose

Everyone sees who's here, live, and the host starts when they like. The code reads across a couch. Nobody waits for stragglers.

## Layout

`Screen` with `scroll`. Header: `TopBar` with back (leave, below), title `lobby:topBar`, and the action `share` (`lobby:a11y.invite`), which opens the [invite sheet](invite-sheet.md). Right under the `TopBar`, the `RoomBanner` ([Reconnecting](reconnecting.md#layout)).

1. **`RoomTicket`**: the code, left detail `lobby:ticket.players` (the [present](#present-and-away) seats of the room's maximum), right detail `lobby:ticket.host`. While `api.rooms.locked` is true, `locked` draws its lock tag ([host menu](host-menu.md#lock-room)). A long press on the ticket copies the six digits (no space) with `haptics.press()` and shows a `success` `Toast` `lobby:ticket.copied`; a screen reader gets the action `lobby:a11y.copyCode`. A tap does nothing. The host reaches this screen straight from setup, with no share step in between, so this ticket, **Share link** and **Show QR** are the ways to invite.
2. **Two buttons** in a row, each half the width: `Button` secondary S, icon `link`, `lobby:shareLink` (the system share sheet straight away, with the [invite sheet's](invite-sheet.md) message); `Button` secondary S, icon `qr`, `lobby:showQr` (the invite sheet).
3. **The rules line**, `body-s` tone `secondary`: `lobby:rules.quickMatch`. For guests who didn't choose the mode; everyone sees it.
4. **Eyebrow** `lobby:inTheRoom`, then **the seats** in one `bg-bg-surface` group with a `border-border-default` hairline and `rounded-lg`, one `SeatRow` per seat with `left_at` null (`api.roomSeats` also returns seats that left; they never show), in join order (`joined_at`, then `member_id`). `SeatRow` is new: `screens/lobby/seat-row.tsx`, spec below.
5. **The room's services**, `body-s` tone `muted`: `lobby:roomServices`, the [names](#service-names) of `api.rooms.provider_ids`, listed with `Intl.ListFormat`. No line while no name is known.
6. **Guests only: `ListRow`** icon `tv`, label `lobby:yourServices.label`, value the guest's services or `lobby:yourServices.optional`, chevron. It opens the services sheet (below).
7. **Everyone, host included: `ListRow`** icon `film`, label `lobby:yourGenres.label`, under "Your services" (for the host, who has no services row, in the same group above the lock row). Its value is [your genres](#your-genres-tonight) by name (`Intl.ListFormat`), or `lobby:yourGenres.optional` with none, `lobby:yourGenres.none` when no genre is offered tonight, and nothing while it loads. Chevron. It opens the genres sheet. It never blocks the start.
8. **Host only: the lock row**, a `ListRow` with a `Toggle` and its helper line ([host menu](host-menu.md#lock-room), M4.13).

**Footer, host:** `Button` primary L, icon `play`, `lobby:start.cta`, and under it one `body-s` muted line: `lobby:start.needPlayers` while fewer than the mode's minimum are [present](#present-and-away) (the button disabled), or `lobby:start.away` when some seats are away (the button enabled). The server counts presence its own way (`last_active_at`), so it can still answer `not_enough_players` (below). After a start with [too few films](#too-few-films), the same line shows `lobby:start.tooFew_*`. With several, one line shows: `start.needPlayers` first (Start is disabled), then `start.tooFew_*`, then `start.away`.

**Footer, guest:** `MarqueeBulbs` (still, `count` 12) over `lobby:waiting` in `body-m` tone `secondary`, centred.

**The services sheet** (`/room/[id]/services`, a `formSheet` like the invite sheet): title `display-s` `lobby:servicesSheet.title`, helper `lobby:servicesSheet.helper`, the [`ServiceGrid`](host-setup.md#new-component), in a scrolling area, and `Button` primary L `lobby:servicesSheet.done` pinned in the footer above the home indicator (`Screen` with `scroll` and `footer`, as in host setup), so Done stays reachable at the largest text size and on a small phone. Done saves to the profile (`api.set_my_providers`) and to the seat (`api.set_seat_prefs`), then closes. It never blocks the start. Its answers are [below](#the-services-sheet-done).

**The genres sheet** (`/room/[id]/genres`, a `formSheet` like the services sheet): see [Your genres tonight](#your-genres-tonight).

## The seat row (`screens/lobby/seat-row.tsx`)

56 points high or more, `p-4`, `gap-3.5`, a `border-border-subtle` bottom hairline (none on the last row).

- `Avatar` M in the seat's color, with `online` while the seat is in the live channel's presence now ([present and away](#present-and-away)).
- Name in `body-m-strong`, with `lobby:seat.you` for the player's own seat; under it the seat's services by [name](#service-names), joined with `Intl.ListFormat`, in `mono-data` tone `muted` (or `lobby:seat.noServices` when none has a name). Services show for everyone: it's how a host spots a seat padding the deck ([security](../../architecture/security.md#room-codes-joining-and-the-host)).
- On the right, at most one `Tag`: the host gets tone `marquee`, icon `crown`, `lobby:seat.host`; an [away](#present-and-away) seat gets tone `neutral`, `lobby:seat.away`, and its name turns tone `muted`.
- Props: `name`, `color`, `services`, `isHost`, `isMe`, `present`, and `onPress`. Every row but the player's own opens the [seat sheet](host-menu.md#the-seat-sheet) (Report for everyone from M7.2, Remove for the host from M4.13); the own row has no `onPress` and isn't a button.

## Present and away

Phones can't read `last_active_at`, so the lobby's rule comes from the live channel's presence (Q21.1):

- **Online** (the avatar's dot): the seat is in `room:<id>:live`'s presence now (the presence key is the seat id).
- **Away**: the seat has been missing from presence for 90 seconds. A seat is never shown as away until 90 seconds after the later of this phone's last `SUBSCRIBED` and the seat's `joined_at`, so a phone that just reconnected doesn't mark everyone away and a late joiner isn't away for a few seconds.
- **Present**: seated and not away. The ticket's count, `start.needPlayers`, `start.away` and the next host in the leave alert all use it.
- The player's own seat is always online and present on their phone.
- Presence (and anything else on `:live`) from a key that isn't a listed seat is ignored: a removed seat's phone may still be connected for a moment ([security](../../architecture/security.md#room-codes-joining-and-the-host)).

## Service names

Rooms and seats hold service ids. The names come from `api.countryProviders({ country: room.country })`, read once per room screen (TanStack caches it), joined by id; an id not in that list is skipped (Q11.1). The same list feeds the services sheet's `ServiceGrid`. While it loads, the services lines are empty and keep their height; if it fails, they stay empty and it is read again with the room's next re-read.

## Starting

| Step or answer (`api.start_game`) | What players see |
| --- | --- |
| The host taps Start | `Button` `loading` |
| `dealing` | Everyone: the **shuffling overlay** (`screens/lobby/shuffling-overlay.tsx`) over the lobby: `bg-overlay-card`, `Spotlight tone="marquee"`, `display-m` `lobby:shuffling`, `MarqueeBulbs` still |
| Still `dealing` after 8 seconds (counted on each phone from when it first sees `dealing`) | The host's phone calls `start_game` again, which deals the SQL baseline. Nothing changes on screen |
| Still `dealing` after 20 seconds | Host: `lobby:shufflingSlow` and `common:actions.retry` on the overlay. Guests: the same line, no button |
| The room moves to `swiping` | The room layout replaces the lobby with the swipe screen |
| `not_enough_players` | The helper shows `lobby:start.needPlayers` with `need`; `haptics.error()` |
| `too_few_films` (with `eligible`) | Host: the overlay closes (the room is back in `lobby`) and the helper shows `lobby:start.tooFew_*` with `eligible`; `haptics.error()`. Guests: the overlay closes and their lobby is back, with nothing new. [Below](#too-few-films) |
| `closed` | The room is re-read and the layout follows its state |
| The call failed | `showToast` warn `lobby:errors.start`; the button works again |

### Too few films

Fewer than 20 films fit the room's filters, so nothing was dealt (M5.5, [how a game ends](../../product/game-modes.md#how-a-game-ends)).

- **Where:** the host's helper line under Start, as for `not_enough_players`. Not a toast (it would leave before the host has acted) and not a `Banner` (that one is for the connection). Start stays enabled.
- **What:** `lobby:start.tooFew_one` or `_other` with the count from `eligible`, or `lobby:start.tooFewNone` when `eligible` is 0 (French puts 0 in the singular form). It points at services, the only filter the lobby can change (the time budget and the age cap are set before the room opens). The host has no services row here, so it asks everyone, whose rows open the services sheet.
- **Also from the deck worker:** when Start answered `dealing` and the worker found too few, the host learns it from `state_changed` with `reason: 'too_few_films'`. The same line shows, with that event's `eligible`. The layout still routes on the room re-read; the payload only fills the line.
- **Until:** the host's next Start tap (Start shows `loading`, the line clears, the new answer decides). A services change doesn't clear it; the next Start counts again. It is this phone's state only: a new host doesn't inherit it.

## The services sheet: Done

Done saves only what changed: `api.set_my_providers` when the selection differs from the profile's, then `api.set_seat_prefs` (Q11.2). The button is `loading` meanwhile.

| Answer or state | What the player sees |
| --- | --- |
| Both `ok` | The sheet closes; the seat row shows the new services (from `seat_updated`) |
| The selection didn't change | The sheet closes, with no call |
| `too_many` (either call; a bug, the grid lists fewer than the cap) | `showToast` warn `lobby:errors.services`, reported to Sentry; the sheet stays open |
| `closed` (`set_seat_prefs`: the game started meanwhile) | The sheet closes; the layout follows the room's state |
| Offline, or a call failed | `showToast` warn `lobby:errors.services`; the sheet stays open, Done works again |
| The names are loading or failed | `ServiceGrid` `loading`; Done disabled until it has a list |

## Your genres tonight

Each player can pick up to 3 TMDB movie genres for tonight's deck. It is optional and never blocks Start. Decided by Harry on 6 November 2026 ([decisions](../../decisions.md)); the rules are the simulation's verdict ([simulations](../../product/simulations.md)). M6.54, on M6.53's backend.

**The rules the screen keeps**

- **Cap 3.** The sheet stops a 4th pick with a quiet note, not an error: no toast, no buzz, no call. Dropping a pick makes room again.
- **Counts, never names.** A chip shows how many [present](#present-and-away) players picked the genre ("Comedy 3"), your own pick included. The phone never shows or learns who picked what, and genre ids never reach analytics or logs (privacy rule 7: counts only, like "2 of 3 of you liked this").
- **Only genres with 30 films or more tonight** are offered, in the order the server gives (`api.room_genres.options`). The phone does not filter or reorder.
- **Picks lock at Start.** The row is dimmed and shut while the room is dealing; the sheet only exists over the lobby (`isAllowed`). A late joiner plays the room's deck as it is.
- **No picks** means today's deck. Nothing is asked of anyone.

**The row** (lobby layout, item 7). Value by state:

| State | Value | Opens the sheet |
| --- | --- | --- |
| Loading | none | yes (the sheet shows its own loading) |
| No picks | `yourGenres.optional` | yes |
| Picks | their names, in the offered order | yes |
| No genre offered tonight | `yourGenres.none` | no (dimmed) |
| Dealing (after Start) | as above | no (dimmed, picks are locked) |
| Offline or the read failed | the last value, or none | yes (the sheet explains) |

**The sheet.** `Screen` with `scroll` and `footer`, as the services sheet. Title `display-s` `genresSheet.title`, helper `body-s` muted `genresSheet.helper`, the chips in a wrapping row (`gap-2`), `Button` primary L `genresSheet.done` in the footer. A chip is the `Chip` with `count`: the name, then the count in `mono-data`; selected shows the check and the accent fill. Its screen reader label is `genresSheet.chip` ("Comedy, 3 players"), role checkbox. The counts include your own unsaved tap at once (the sheet adds or removes 1 locally), so a tap answers without waiting for the network; the server's number replaces it after Done.

Done sends only the genre ids, only when the selection changed (`api.set_seat_prefs` with `p_genre_ids`), then closes. The sheet starts on your saved picks that are still offered; a saved pick that left the offer takes no place in the cap and is dropped on the next save.

| State or answer | What the player sees |
| --- | --- |
| Loading | Six `Skeleton` chips (`h-9`, `rounded-pill`); Done disabled |
| Loaded, none offered | `body-m` secondary `genresSheet.none`; Done closes with no call |
| Cap reached (a 4th tap) | `body-s` secondary `genresSheet.cap` under the helper, announced politely; the chip stays off; no haptic, no toast |
| `ok` | The sheet closes; the row shows the names; other phones' counts follow `genres_changed` |
| Nothing changed | The sheet closes, with no call |
| `closed` | The sheet closes; the layout follows the room's state |
| `locked` (Start happened while the sheet was open) | `showToast` info `genresLocked.*`, the sheet closes |
| `unknown_genre` (a genre left tonight's offer) | `showToast` warn `errors.genresStale`; the sheet stays open and reads the offer again, your selection resets to the saved picks |
| `too_many` | A bug (the sheet stops a 4th pick): `showToast` warn `common:errors.generic.title`, reported to Sentry, stays open |
| The read failed (online) | `EmptyState` error with `genresSheet.failed` and `genresSheet.retry`; Done disabled |
| Offline with nothing loaded | `EmptyState` with the `wifi-off` icon, `genresSheet.offline` and Retry; Done disabled |
| Offline with the offer loaded | The chips stay; Done fails and shows `errors.genres`; the sheet stays open |
| The save call failed | `showToast` warn `errors.genres`; the sheet stays open, Done works again |
| A non-member | 42501, reported as `denied`; the room layout already sends a removed seat Home |

**Live.** The server sends `genres_changed` (an empty payload) on `room:<id>` when a seat's picks change. The phone re-reads `api.room_genres` and updates the row and any open sheet in place. It also re-reads on every reconnect and when the app returns to the foreground (the same re-read as the room, under the room's query prefix). Counts move without animation: the numbers change in place. Reduce Motion needs nothing.

**Accessibility.** The row reads "Your genres tonight, Comedy and Drama" (or "Optional") as a button; a dimmed row is announced as disabled. In the sheet the helper comes right after the title; each chip is a checkbox ("Comedy, 3 players", checked or not); the cap note is a polite live region (and `announceForAccessibility` on iOS). The tap targets are 44 points (`Chip` is 36 high with the `Pressable` target padding); at the largest text size the chips wrap onto more lines and Done stays in the footer.

**Haptics.** The chips use `haptics.press()` through `Pressable`. A refused 4th pick has none: it is a gentle limit, not a refusal (`haptics.error()` is for refusals).

## Live changes (from the room layout)

| Event | The lobby |
| --- | --- |
| `member_joined` | The seats are re-read; the new row comes in, its avatar with `layout.popIn`; the ticket's count changes |
| `member_left` | The row leaves with `layout.fadeOut` |
| `member_removed` | The seats are re-read; the row leaves as for `member_left` (nothing says it was removed). On the removed phone: [the removed side](host-menu.md#the-removed-players-side) |
| `room_locked` | The room is re-read; the ticket's lock tag comes or goes |
| `seat_updated` | The row's services change |
| `genres_changed` | `api.room_genres` is read again; the genres row and an open genres sheet update in place ([Your genres tonight](#your-genres-tonight)) |
| `settings_changed` | The room is re-read (the services line) |
| `host_changed`, or `member_left` with `new_host_member_id` | The crown moves. On the new host's phone: `showToast` info `lobby:youreHost.*`, and the footer becomes Start |
| Presence on `room:<id>:live` | Online dots and the away tag |
| `state_changed` | The layout moves to the state's screen (`abandoned` goes to Room closed, slice 13) |

## Leaving

Every way out of a room screen that is not Leave asks the same question. The room layout wraps its screens in `RoomLeaveGuard` (`components/screens/room/leave-guard.tsx`), which uses `usePreventRemove` while the phone has a seat: the iOS swipe from the left edge and Android's back button are stopped and open the alert below, `Stay` keeps the player in the room, and only a confirmed Leave runs `leaveRoom` and `useExitRoomToHome()`. The gesture stays on (the native stack bounces the screen back, so nothing is disabled). The invite, services and recap sheets are screens inside the room, so swiping one down still just closes it. Flows that really take the phone out of a room (entering another room from a link) release the guard first. The Back button of the `TopBar` opens it too.

The alert is the system alert `lobby:leave.title`, with `lobby:leave.bodyGuest`, or for the host `lobby:leave.bodyHost` naming the next host, and the buttons `lobby:leave.stay` and `lobby:leave.confirm` (destructive).

**The next host** is worked out on the phone with M4.5's rule (Q11.3): the longest-seated [present](#present-and-away) player other than the host (`joined_at`, then `member_id`); with nobody else present, the longest-seated seated player, present or not (M4.5's fallback, Q5.1); with nobody else seated, the alert has the title only. The server picks for real; if its pick differs, the crown follows `member_left`'s `new_host_member_id`.

| Leave, then | What happens |
| --- | --- |
| `ok` or `not_in_room` | The phone forgets the kept room, goes Home with `useExitRoomToHome()` (`features/room/exit-home.ts`), and Home shows. The helper goes back to the Home already in the root stack (`router.dismissTo('/play')`, the Play tab since M6.43; `/home` is a redirect to it) and only replaces the room with Home when no Home is open (a cold start from a link, or the splash rejoining the kept room); a second call while already on Home does nothing. The room layout uses the same helper when the phone is not seated, so Leave and that exit never leave two Homes |
| Offline | `showToast` warn `common:states.offlineRoom`; nothing else, the player stays |
| The call failed (online) | `showToast` warn `common:errors.generic.title`; the player stays, the kept room too, and can leave again |

## Other states

| State | What players see |
| --- | --- |
| First load | `Skeleton` for the ticket (its height, `rounded-lg`) and three seat rows |
| Only the host | One row, then a row inside the group: `Icon` `users` and `lobby:alone` in `body-s` muted |
| Full (10 of 10) | The same lobby; the count says it |
| Reconnecting or offline | See [Reconnecting](reconnecting.md); Start is disabled until the room is fresh again |
| The player's seat is gone (removed) | Home, with `showToast` info `join:errors.removed`; the kept room is forgotten ([host menu](host-menu.md#the-removed-players-side)) |
| Locked | The ticket's lock tag, for everyone; the host's toggle on ([host menu](host-menu.md#lock-room)) |

## Copy (`lobby` namespace)

| Key | French | English |
| --- | --- | --- |
| `topBar` | Avant la séance | Lobby |
| `a11y.invite` | Inviter des amis | Invite friends |
| `ticket.players_one` | {{count}} joueur sur {{max}} | {{count}} of {{max}} players |
| `ticket.players_other` | {{count}} joueurs sur {{max}} | {{count}} of {{max}} players |
| `ticket.host` | Hôte · {{name}} | Host · {{name}} |
| `ticket.copied` | Code copié | Code copied |
| `a11y.copyCode` | Copier le code | Copy the code |
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
| `yourGenres.label` | Tes genres ce soir | Your genres tonight |
| `yourGenres.optional` | Facultatif | Optional |
| `yourGenres.none` | Rien à choisir ce soir | Nothing to pick tonight |
| `genresSheet.title` | Tes genres ce soir | Your genres tonight |
| `genresSheet.helper` | Choisis jusqu'à 3 genres. Les autres voient combien de joueurs ont choisi chaque genre, pas qui. | Pick up to 3 genres. Others see how many players picked each genre, not who. |
| `genresSheet.cap` | 3 genres au maximum. Retire-en un pour en changer. | 3 genres at most. Drop one to swap. |
| `genresSheet.none` | Pas assez de films pour proposer des genres ce soir. | Not enough films to offer genres tonight. |
| `genresSheet.failed` | Impossible de charger les genres. | We couldn't load the genres. |
| `genresSheet.offline` | Pas de réseau. Les genres reviennent avec la connexion. | No network. The genres come back with your connection. |
| `genresSheet.retry` | Réessayer | Try again |
| `genresSheet.done` | C'est bon | Done |
| `genresSheet.chip_one` | {{name}}, {{count}} joueur | {{name}}, {{count}} player |
| `genresSheet.chip_other` | {{name}}, {{count}} joueurs | {{name}}, {{count}} players |
| `genresLocked.title` / `.message` | Genres verrouillés / La séance a commencé. | Genres locked / The game has started. |
| `errors.genres` | Impossible d'enregistrer tes genres. Réessaie. | We couldn't save your genres. Try again. |
| `errors.genresStale` | Les genres ont changé. Choisis à nouveau. | The genres changed. Pick again. |
| `servicesSheet.title` | Tes plateformes | Your services |
| `servicesSheet.helper` | Facultatif : ça ajoute des films. | Optional: adds more films. |
| `servicesSheet.done` | C'est bon | Done |
| `start.cta` | Lancer la séance | Start swiping |
| `start.needPlayers` | Il faut {{count}} joueurs présents pour lancer. | You need {{count}} players here to start. |
| `start.tooFew_one` | Seulement {{count}} film convient ce soir. Demande à chacun d'ajouter ses plateformes. | Only {{count}} film fits tonight. Ask everyone to add their services. |
| `start.tooFew_other` | Seulement {{count}} films conviennent ce soir. Demande à chacun d'ajouter ses plateformes. | Only {{count}} films fit tonight. Ask everyone to add their services. |
| `start.tooFewNone` | Aucun film ne convient ce soir. Demande à chacun d'ajouter ses plateformes. | No film fits tonight. Ask everyone to add their services. |
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
| `errors.services` | Impossible d'enregistrer tes plateformes. Réessaie. | We couldn't save your services. Try again. |
| `a11y.joined` | {{name}} est là | {{name}} is here |
| `a11y.left` | {{name}} a quitté la salle | {{name}} left |
| `a11y.leave` | Quitter la salle | Leave the room |

The away names are listed with `Intl.ListFormat`. The host alone leaving has no body, just the title.

## Motion, haptics, sound

- Arrivals: the row with `layout.fadeIn`, the avatar with `layout.popIn` (the arcade overshoot). Small, because a friend arriving is good news, not the match.
- No haptic for arrivals or departures: phones shouldn't buzz for every friend, and the vocabulary has no word for it.
- The shuffling overlay comes in with `layout.fadeIn` on every phone at once; no haptic and no sound (sound is only for the match and the reveal).
- The host-change toast uses `Toast` (`layout.toastIn`).
- `haptics.error()` only for `not_enough_players` and `too_few_films` (the host's phone).
- The too-few line replaces the helper's text in place, with no movement.

## Accessibility

- Focus order: back (`lobby:a11y.leave`), title, invite, the ticket (read as "Room code 4 8 2 9 1 3, 3 of 10 players, host Harry"), Share link, Show QR, the rules line, "In the room" (header), each seat as one element ("Sam, here, Netflix, Disney+"; the host's says "host"), the room's services, your services (guests), your genres, the lock row (host), Start (its helper as the hint). Each other player's seat is a button that opens the seat sheet.
- Arrivals and departures are announced politely (`lobby:a11y.joined`, `lobby:a11y.left`), at most one announcement a second.
- The shuffling overlay takes focus and reads `lobby:shuffling`.
- After `not_enough_players` or `too_few_films`, focus goes back to Start, its hint becomes the new line, and the line is announced once (assertive, it answers the host's tap). The number is read as a number ("Only 12 films fit tonight").
- Reduce Motion: rows and the overlay appear without movement.

## Design-system change

**A `crown` icon** in `mobile/assets/icons/` and the `Icon` names, drawn like the set (24 points, 2-point stroke), for the host's tag. M4.11 asks for "the host's crown" and the set has none.

## Differences from the Figma

- No "Taste check 5/8" or "Letterboxd linked": both wait (M19, M20). No "Ready" tag: everyone in the lobby is ready. "Joining" becomes "Away", which presence can actually tell.
- The host's tag gets a crown (the Figma writes "Host ·" in the details).
- The guest's services row and the rules line are new, as [onboarding's Figma changes](../../product/onboarding.md#changes-to-the-figma) ask. The taste check card for the host isn't here (M19).
- The Figma's helper "Jo is still joining. You can start without them." becomes the away line.

## Questions

Harry accepted every default below on 30 October 2026.

1. **The crown.** Default: the new `crown` icon in a marquee `Tag`. Without a new icon, the tag would be the word alone.
2. **The Quick Match name in French.** The glossary has none. Default: "Partie rapide".
3. **Services for the host in the lobby.** M4.11 gives the row to guests. Default: guests only; the host set theirs on the setup screen a minute ago.
4. **The 20-second "taking longer" line.** Default: 20 seconds after Start (the SQL baseline deals at 8).

Harry accepted every default of slice 7's plan on 3 November 2026; this spec now says each one:

5. **Present and away** (Q21.1): from the live channel's presence, away after 90 seconds missing.
6. **Service names** (Q11.1): from `api.country_providers` for the room's country; unknown ids skipped.
7. **The services sheet's failures** (Q11.2): a warn toast, the sheet stays open.
8. **The next host in the leave alert** (Q11.3): M4.5's rule on the phone, with its fallback (Q5.1).
9. **Leaving forgets the kept room** (Q10.4) and drops the room stack.
10. **The banner** (Q21.3): `RoomBanner` under the `TopBar`.

Slice 9's answers (3 November 2026, Q5.2) bring M5.10:

11. **Too few films.** The host's helper line under Start, until the next Start tap; guests see nothing new (planner's defaults). One change to the proposed copy: "Add a service to get more" became "Ask everyone to add their services", because the host has no services row in the lobby (question 3) and only the guests' rows open the sheet.

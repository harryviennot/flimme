# Swipe

Screens 11 Swipe (`99:4065`), 12 Mid-swipe (`99:4093`) and 13 Card flipped (`99:4122`) on the Figma's First release page. Route `/room/[id]/swipe`, under the room layout (`/room/[id]/_layout.tsx`), shown while the room is `swiping`. Written on 4 November 2026 from [the signature moments](../moments.md) (the swipe, the flip, the near miss), slices 10 and 11's plan (Harry accepted every default on 4 November 2026; the answers are in [decisions.md](../../decisions.md)), [the card stack](../../architecture/app-structure.md#the-card-stack), [the vote queue](../../architecture/app-structure.md#the-vote-queue), [the answers](../../product/game-modes.md#the-answers) and [the first game](../../product/onboarding.md#the-first-game). Connection states follow [Reconnecting](reconnecting.md); the seat sheet is the [host menu](host-menu.md); the match is [its own spec](match.md). The solo variant (M6.39, 5 November 2026) is [its own section](#solo). Updated on 5 November 2026 (M6.33) for the shortlist, from [the shortlisted beat](../moments.md#the-shortlisted-beat) and Harry's rules of that day ([when it's a match](../../product/game-modes.md#when-its-a-match)): a match joins the room's shortlist, swiping goes on, and the third match starts the finale.

Built in parts, each with its own section here:

| Task | Builds | Section |
| --- | --- | --- |
| M6.9 | The stack, gestures, the buttons row, the loading and waiting cards, offline, the whole `swipe` copy namespace, the presence swipe count, and the empty slot files below | [Layout](#layout), [The stack](#the-stack), [The buttons row](#the-buttons-row), [States](#states) |
| M6.10, M7.3 | The card back (screen 13); no trailer under 13 | [The card](#the-card) |
| M6.12 | "Watch it again tonight?" | [Seen it](#seen-it-the-rewatch-question) |
| M6.13 | The near-miss toast and glow | [The near miss](#the-near-miss) |
| M6.18 | The four first-game hints | [Hints](#first-game-hints) |
| M6.26 | Undo | [Undo](#undo) |
| M6.27 | The top bar: pills, done, Leave, the host menu | [The top bar](#the-top-bar) |
| M6.17 | The done card's filters and liked count ("Nothing left", screen 26) | [The done card](#the-done-card-nothing-left) |
| M6.63 | The top bar's player stack and the players sheet (design pass (b), M6.60) | [The top bar](#the-top-bar) |
| M6.58 | The bookmark's new place, low on the card's right (design pass (b), M6.60) | [The bookmark](#the-bookmark) |
| M6.37 | The shortlist in the top bar, the shortlisted beat over the stack, the route held on the third match, Undo after a shortlisted match | [The top bar](#the-top-bar), [The shortlisted beat](#the-shortlisted-beat), [Undo](#undo) |
| M6.44 | The solo variant: the solo top bar, the checkpoint card, the pick sheet, out of films, the cap card | [Solo](#solo) |
| M6.61 | The card back reworked (the poster's middle, the front's fade, the score in the meta line, one row of logos, the synopsis sheet) and the solid stack, from Harry's feel test of 6 November 2026 (specified in M6.59) | [The card back, reworked](#the-card-back-reworked), [The stack](#the-stack) |

## Purpose

Answer a film in under a second, from either side of the card, without ever waiting for the network. The phone shows only what is private (your own cards) and what everyone may know (how far each player is, a near miss on a card you haven't answered).

## Layout

`Screen` (no `scroll`), `bg-bg-canvas`. Top to bottom:

1. **The top bar** (`screens/swipe/top-bar.tsx`, M6.27), 56 high, `px-5`: Leave, the player stack (M6.63) and the shortlist (M6.37).
2. **`RoomBanner`** right under it, in the flow, as on every room screen ([Reconnecting](reconnecting.md#layout)). On this screen it also carries the offline note (below).
3. **The stack** (`screens/swipe/card-stack.tsx`), `flex-1`, centred. The card is as wide as the screen minus `px-5` (345 on a 393-point phone), and shrinks to fit the height left, keeping the card's 345 by 518 shape, with 16 points under it for the cards behind to peek out. When the banner comes or goes, the card resizes with a `LinearTransition` (`duration.base`); a drag in progress keeps going.
4. **The hint line** (`screens/swipe/hints.tsx`, M6.18), between the stack and the buttons, `min-h-9` (two lines of `body-s`), centred, `px-5`. Reserved only when the phone still has a hint to show at the start of the game; otherwise it takes no space.
5. **The buttons row** (`screens/swipe/action-row.tsx`), above the home indicator with `pb-2`. It never changes for the [rewatch chip](#seen-it-the-rewatch-question), which lives in the hint line.

The near-miss toast (`screens/swipe/near-miss.tsx`, M6.13) is drawn over the top bar's player stack. The shortlisted beat's layer (`screens/swipe/shortlisted.tsx`, M6.37) is drawn over the whole screen while it plays ([The shortlisted beat](#the-shortlisted-beat)). M6.9 creates `top-bar.tsx`, `near-miss.tsx`, `seen-question.tsx` and `hints.tsx` rendering nothing, so later waves never share a file. Logic lives in `features/swipe/`: `answer.ts` (the answer path, M6.12 changes it), `undo.ts` (M6.26), `near-miss.ts` (a stub from M6.9, filled by M6.13) and `top-card.ts` (M6.9: the top card's shared values, so the card 1 hint can lean it without touching the gesture code).

## The top bar

`screens/swipe/top-bar.tsx`, M6.27, redesigned by design pass (b) (M6.60, built by M6.63) after Harry's feel test of 6 November 2026: the pills' strip was too narrow to read anything (about one and a half pills at 375 points) and the shortlist cut them off. A row, 56 high, `px-5 items-center gap-2`: Leave, the player stack (`flex-1`), then the shortlist (M6.37, unchanged). Nothing scrolls and nothing is cut.

- **Leave:** `IconButton` filled, icon `x`, label `lobby:a11y.leave`. It opens the same alert as the lobby ([leaving](lobby.md#leaving): `lobby:leave.*`, the next host named for the host). The room layout's `RoomLeaveGuard` (#127) already stops the edge swipe and Android's back on this screen and opens the same alert. A confirmed Leave runs `leaveRoom`; votes still in the queue for this room are dropped (a seat that left can't vote, `42501`). Offline: `showToast` warn `common:states.offlineRoom`, the player stays. A failed call: `showToast` warn `common:errors.generic.title`.
- **The player stack** (`screens/swipe/player-stack.tsx`, new, single use), below. It replaces the pills' `ScrollView`.
- **The shortlist** (M6.37), described below. It keeps its 112 points, its place and its slots (the beat measures them).

**Options weighed** (design pass (b)). Two rows (the players under Leave and the shortlist) keep names but cost 44 points of card height on every phone, and 10 pills still don't fit 335 points. Moving the players out of the bar (under the stack, or only in a sheet) loses the glance at who is still swiping. **The avatar stack** keeps the bar at 56, shows everyone's presence and Done at a glance for 2 to 10 players, and puts names and counts one tap away. Recommended and specified here.

### The player stack

One `Pressable` (`flex-1 min-w-0 h-11 flex-row items-center`, the whole stack is the target, so no 28-point avatar has to be tapped alone), `haptic="press"`, opening [the players sheet](#the-players-sheet). Inside, one disc per seat with `left_at` null, in seat order (`joined_at`, then `member_id`), the same order as every avatar row in the game.

- **A disc:** a 32-point wrapper, `rounded-pill border-2 border-bg-canvas` (so two players who share a color stay apart), holding `Avatar` S (28) in the seat's color with `online` from presence.
- **Done** (presence `done`, Q27.2): the online dot gives way to a 14-point badge at the disc's bottom right (`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-pill border-2 border-bg-canvas bg-like-default`, `Icon` `check` 8, `text-inverse`, stroke 3). It comes in with `layout.popIn`. Screen readers hear `swipe:a11y.done` once, politely, as before. No toast.
- **Away** (missing from presence for 90 seconds, the [lobby's rule](lobby.md#present-and-away)): the disc at `opacity-disabled`, no dot.
- **The host:** a 14-point badge at the disc's top right (`absolute -top-0.5 -right-0.5 size-3.5 rounded-pill bg-bg-canvas`, `Icon` `crown` 10, `marquee-default`). Decision M4.15 (the host shows in the swipe screen's player row) holds through the crown here and the host's name in the sheet and in the stack's label (question 8).
- **You:** your own disc has no mark; the sheet says which row is yours.
- **Spacing:** `gap-1` while every disc fits; otherwise the discs overlap by 8 (`-ml-2` from the second), each disc drawn above the next (`zIndex` falling with the order) so the dots and badges on the right stay visible; when even that doesn't fit, the last place is a **"+N" disc** (32, `rounded-pill bg-bg-raised border border-border-default`, `swipe:players.more` in `mono-data` tone `secondary`, `maxFontSizeMultiplier` 1.2). The choice is a pure function, `stackLayout(width, seats)` in `features/swipe/player-stack.ts` (tested), from the stack's `onLayout` width:

| Stack width | Spaced | Overlapped | "+N" |
| --- | --- | --- | --- |
| 167 (a 375-point phone) | 2 to 4 | 5 and 6 | 7 to 10: 5 discs and "+2" to "+5" |
| 185 (393 points) | 2 to 5 | 6 and 7 | 8 to 10: 6 discs and "+2" to "+4" |
| 222 (430 points) | 2 to 6 | 7 to 8 | 9 and 10: 7 discs and "+2" or "+3" |

- **Which discs hide behind "+N":** the last in seat order, never your own (yours takes the last visible place if it would hide). A seat that becomes Done or away does not reorder anything: nothing in the bar jumps mid-game.
- **Largest text:** nothing in the stack is text but "+N", capped at 1.2, so the stack keeps its size; the bar stays 56.
- **Never shown:** anyone's answers, which films, or who liked what. Done and the count of answers are what the pills showed before (rule 6 and decision M6.27 Q27.1 hold).
- **Live:** a seat that joins pops in (`layout.popIn`), one that leaves fades out (`layout.fadeOut`), the others slide (`LinearTransition`, `duration.base`); "+N" changes in place. Reduce Motion: fades only.
- **Screen reader:** one button, label `swipe:a11y.players` (the count, the host's name, how many are done and how many are away), hint `swipe:a11y.playersHint`. It is announced again only through the existing "Sam is done" line.

### The players sheet

Route `/room/[id]/players`, a `formSheet` with the grabber, `sheetAllowedDetents: 'fitToContents'`, declared in the room layout beside the seat sheet. `players` joins the `swiping` row of `SHEETS` in `features/room/screens.ts` (only there: it closes when the finale starts, as the seat sheet does). The game keeps running under it: cards are never paused for it.

Layout, `p-5 gap-3`, in Gesture Handler's `ScrollView` (the lobby genre sheet's finding: a plain one paints nothing in a form sheet):

1. **Header** row: `swipe:players.title` in `display-s`, and `IconButton` plain `x` (`common:actions.close`) at the right, for screen readers.
2. **One `SeatRow` per seat** (moved to `shared/seat-row`, [design-system changes](#design-system-changes)), in seat order: `Avatar` M with `online`, the name (`lobby:seat.you` on your own), and as detail `swipe:players.films` (the count: exact for you, in steps of 5 for the others, as the pills had). On the right at most one `Tag`: away (`neutral`, `lobby:seat.away`), else Done (`like`, icon `check`, `swipe:pills.done`), else the host (`marquee`, `crown`, `lobby:seat.host`). When the host's row shows another tag, a `crown` icon (14, `marquee-default`) follows the name.
3. **A tap on any row but your own** replaces the sheet with the [seat sheet](host-menu.md#the-seat-sheet) (`router.replace`, so only one sheet is ever open): Report for everyone, Remove for the host, exactly as the pills did (the seat and report rows of `SHEETS` stay).

| While the sheet is open | The sheet |
| --- | --- |
| A seat joins, leaves or is removed | Its row comes in (`layout.fadeIn`) or goes (`layout.fadeOut`) |
| Presence, counts or Done change | The row follows in place, no animation |
| The room leaves `swiping` (the finale, an end) | Closes by itself (`isAllowed`) |
| Offline | The rows keep their last values; away follows presence as it comes back |

Focus order: the title, close, the rows in order (each a button but your own, hint `lobby:a11y.seat`). At the largest text the names wrap to two lines and the sheet scrolls.

### The shortlist

`screens/swipe/shortlist.tsx` and `features/shortlist/`, M6.37. The room's matched films so far, as small posters, and how many there are. It is the room's, not anyone's: it never says who liked a film, and Party and Blind show it the same way. It is the state; [the shortlisted beat](#the-shortlisted-beat) is the moment that fills it.

- **Where:** last in the top bar's row, after the player stack, `shrink-0`. Not shown in a mode whose `matches_to_end` is 1 (none at launch): there the first match is the pick.
- **The row:** `flex-row items-center gap-2`: the count, then the slots.
- **The count:** `swipe:shortlist.count` ("1/3") in `mono-data`, tone `muted` while the shortlist is empty, `secondary` from the first match, `maxFontSizeMultiplier` 1.2. The digits are monospaced, so the width never changes and nothing in the bar moves when the number does. It counts what the room has, never what it still needs.
- **The slots:** `flex-row gap-1`, one per place on the shortlist (`matches_to_end`, 3 at launch), each 24 by 36 (the poster's 2:3 shape), `rounded-xs`.
  - **Empty:** `bg-bg-raised border border-border-default`. No icon, no text.
  - **Filled:** `PosterThumb` size `xs` (new, [Design-system changes](#design-system-changes)) with the film's poster and its thumbhash, and a ring drawn over it (`absolute inset-0 rounded-xs border border-marquee-default`). No poster: the frame stays `bg-bg-raised` with the ring.
  - Filled left to right in the order the matches happened.
- **Sizes.** The shortlist takes 112 points (24 for the count, 8, then 3 slots of 24 with 4 between). At 375 points wide, the player stack keeps 167 points (four discs spaced, six overlapped, [the table above](#the-player-stack)). At the largest text the count grows to its cap, the slots keep their size, and the player stack gets what is left (`stackLayout` counts with its real width). The bar stays 56 high: the slots are 36.
- **Not pressable** (question 5). The beat shows each film full size as it joins, and the Final Cut shows them all.
- **Screen reader:** one element, after the player stack in the focus order, labelled `swipe:shortlist.a11yEmpty` while empty, otherwise `swipe:shortlist.a11y` with the titles in slot order (`Intl.ListFormat`). No live region: the beat makes its own announcement.

**Where the data comes from.**

- **The size:** `matches_to_end` for the room's mode, from `api.game_modes` (M6.34 adds the column), read with the room. 3 until it's known.
- **During the game:** each `match` event with `decided: false` puts its `title_id` in slot `shortlisted`. The phone's own `ok` answer with `match: true` puts the voted card in the next free slot first, and the event corrects it. If the event's `shortlisted` doesn't match the slots the phone has (it missed an event), the phone re-reads `api.room_matches`.
- **After a reconnect, a return to the foreground or a cold start:** `api.room_matches` for the room, in `created_at` order (while swiping every row is a shortlisted film). The slots fill at once with no beat and no animation; a missed beat isn't replayed (Q37.2, [decisions.md](../../decisions.md)).
- **The posters:** the card store keeps every card of this game; for a film it doesn't have (a matched film this phone never got, a cold start), one `api.title_cards` call for the missing ids. The poster fades in over the frame when it loads (`layout.fadeIn`).

## The stack

`screens/swipe/card-stack.tsx`, M6.9, on the card stack store (M6.25) and the vote queue (M6.11).

- **Three mounted cards, all solid.** The top card at full size. The second at 95% (a starting value), `translate-y-2`. The third at 90%, `translate-y-4`. Cards behind are never see-through: each is drawn at full opacity and darkened by [the dim layer](#the-dim-layer) (M6.61; until then they used `opacity-stack-near` and `opacity-stack-far`, which let the third card show through the second). Only the top card takes touches.
- **The next card is already there.** When the top card is thrown, the second settles to full size and full brightness (`spring.snappy`) and is draggable at once; a new third mounts behind with `layout.fadeIn`. Up to 3 thrown cards can be in flight at once.
- **Every new card arrives front side up.**
- **Past the mounted cards** (the refill is late): the [loading card](#states) takes the top card's place.

### The dim layer

M6.61, from Harry's feel test of 6 November 2026: "when swiping, the card underneath has opacity, meaning we can see through and also see the card under that one". The cards behind are now solid and dimmed, as if the lights were lower on them.

- **What it is.** In `screens/swipe/swipe-card.tsx`, an `Animated.View` drawn over the `MovieCard`, inside the card's moving view (so it rides the scale and offset): `absolute inset-0 rounded-xl bg-bg-sunken`, `pointerEvents="none"`, hidden from screen readers. The card's own opacity is 1; `fade` (the Reduce Motion throw and Undo) keeps working as today.
- **Its opacity** comes from the same `depthValue` that drives the scale, on the UI thread: `interpolate(d, [0, 1, 2], [0, opacity.stack-dim-near, opacity.stack-dim-far])`. So when the top card is thrown, the second card brightens with the same `spring.snappy` that brings it forward.
- **With the drag**, the second card brightens as it grows: its layer is `stack-dim-near * (1 - progress)`, clear at the commit line (the progress that already scales it).

| Depth | Scale | Offset | Dim layer | Looks like |
| --- | --- | --- | --- | --- |
| 0, the top card | 1 | none | none | Full brightness |
| 1 | 0.95, growing to 1 with the drag | `translate-y-2` | `opacity.stack-dim-near`, 0.3 (to 0 with the drag) | About 70% bright, as before, but solid |
| 2 | 0.9 | `translate-y-4` | `opacity.stack-dim-far`, 0.55 | About 45% bright, solid |

Starting values that keep today's brightness without the see-through; tuned at the feel check.

- **Sixty frames a second on a low-end Android.** One plain view per card with an animated opacity: a compositing change on the UI thread, no React render, no new image. No `filter`, no brightness or colour matrix on the poster, no blur, no Skia: those redraw the poster on every frame. The near-miss glow stays behind the card and is never dimmed (it is only on the top card).
- **A new third card** still fades in with `layout.fadeIn`; behind two solid cards only its 16-point peek fades in from the canvas.
- **Reduce Motion:** the depth changes at once (Reanimated skips the spring), and the layer jumps with it. The drag doesn't brighten it: the second card is already full size there, so it stays at `stack-dim-near` until it is on top.

### Gestures

A `Pan` and a `Tap` on the top card, exclusive: a touch that moves past the slop is a drag and never flips. Everything runs on the UI thread (Reanimated shared values, no `setState` per frame).

| Gesture | What happens |
| --- | --- |
| Tap | [The flip](#the-card) |
| Drag | The card follows the finger 1:1 and rotates around a point below the card, up to the tilt at the commit line. Toward an answer, the stamp fades and grows in with the distance (none at rest, full at the commit line), the card takes the answer's 3-point border, the matching `SwipeAction` goes `lit`, and the second card grows toward full size |
| Right | Like: LIKE stamp, `like.default` border, Like lit |
| Left | Nope: NOPE stamp, `nope.default` border, Nope lit |
| Up, within the up angle | Seen it: SEEN IT stamp, `accent.default` border, Seen it lit. Otherwise the larger sideways direction wins. Down is no answer |
| Crossing the commit line | `haptics.commit()`, each time the drag goes out past it, never on the way back |
| Release past the line, or a flick faster than the throw speed toward an answer | Thrown: the card carries the finger's speed off screen (about `duration.slow`, `easing.exit`), keeping its tilt; `haptics.throw()` at release; the vote joins the queue at release. Up, in a room that asks, opens the [rewatch question](#seen-it-the-rewatch-question) instead |
| Release before the line, slowly | Back to the middle (`spring.card`); the stamp, border and lit button fade with the distance. No haptic, no vote |

### Starting values (Q9.3)

Placeholders, tuned at the first feel check. The gesture rules live in `features/swipe/feel.ts`, one named constant each with a line pointing here; the angles and the hint wait are tokens ([Design-system changes](#design-system-changes)).

| Value | Start |
| --- | --- |
| Commit line, sideways | 30% of the screen's width from the middle |
| Commit line, up | 18% of the screen's height |
| Up angle | Within 30 degrees of straight up |
| Throw speed | 800 points per second toward an answer |
| Touch slop | 10 points |
| Tilt at the commit line | `rotation.card-tilt` (10 degrees), never more than `rotation.card-tilt-max` (15) |
| The second card at rest | 95% of full size, full at the commit line |
| The card 1 lean | A third of the commit line, `duration.slow` each way, after `duration.hint-delay` (600 ms) without a touch |

## The card

`shared/movie-card`, with the [changes below](#design-system-changes).

**Front** (screens 11 and 12): the poster, the `card-front-scrim` (a soft nine-stop fade of `bg.sunken` from clear to 88%, over the bottom 92% of the card, so most of the poster shows; the back keeps `card-scrim`), the flip badge, the title in `title-l`, the meta in `mono-data` in `text.primary` (AA over a bright poster, which `text.secondary` cannot reach under a light fade; "2019 · 2 h 04 · Thriller · ★ 7.4": the year, the runtime and the score through `Intl`, the first genre), the room's services for the film as `Tag`s. No reason tag in the first release (the First release frame's caption: watchlist and taste reasons wait for M17 to M20).

**Back** (screen 13, M6.10, reworked by M6.61 from Harry's feel test of 6 November 2026, [below](#the-card-back-reworked)): the 132-point header (the poster's vertical middle, the front's `card-front-scrim`, the title, the meta line with the TMDB score, the `refresh` flip badge); the synopsis in `body-m`, with "Read more" to [the synopsis sheet](#the-synopsis-sheet) when it doesn't fit; `common:card.director` and `common:card.cast` (the directors and the first 5 names, joined with `Intl.ListFormat`; the cast line takes two lines); one row of the room's services as small logos, with "+n" when they don't all fit, and the Trailer button (`Button` secondary S, icon `play`, `common:card.trailer`) at its end, which opens the trailer outside the app; the JustWatch credit under them (`common:card.justwatch`, `body-s` in `text-muted`, whenever logos show: TMDB's rule in [tmdb.md](../../integrations/tmdb.md#terms-licence-and-attribution)). No score box and no "Tap the card to flip back" line since M6.61. No Letterboxd rating (M20).

- **The bookmark:** low on the card's right edge, on both faces ([The bookmark](#the-bookmark), moved by design pass (b)).
- **No trailer** when `trailer_key` is null: rooms capped under 13 always get null (M7.3), and so do films without one. The services badges take the row alone.
- **The flip** (moments.md#the-flip): a tap turns the card in place (`timing.flip`, faces swap halfway), a second tap turns it back. The cards behind don't move. A drag mid-turn takes the card from where it is; a tap mid-turn reverses it. The back answers exactly like the front (drags, buttons, stamps over the back). No haptic, no sound. Whether the card was flipped goes with its vote (`flipped`, M6.2). Everything on the back is in the card's payload, so a flip never waits, offline included.
- **Missing data:** no overview shows `swipe:card.noSynopsis` (never with "Read more"); no score leaves it out of the meta line; no director or cast hides its line; no services hides the row and the credit.

### The card back, reworked

M6.61, specified on 6 November 2026 (M6.59) from Harry's feel test on his iPhone: the poster preview was too dark and showed only the top of the poster, the synopsis was sometimes cut before it was readable, and the score box and the service badges took too much height. Screen 13 still sets the parts; this section wins where they differ.

Top to bottom, on a 345-point card (393-point phone):

| Part | Layout | Height |
| --- | --- | --- |
| The header | `h-33`, `overflow-hidden`: the poster, the fade, the badges, the title block | 132 |
| The body | `flex-1 gap-3 px-5 py-3.5` | 386 |
| The synopsis | `min-h-0 flex-1 gap-1`: `common:card.synopsis` (`mono-eyebrow` `text-secondary`), the overview (`body-m`), "Read more" when it is cut | What's left: about 175, 8 lines (about 80, 4 lines, before) |
| The credits | `gap-0.5`: director (one line), cast (two lines), `body-s` `text-secondary` | 54 |
| The services row | `flex-row items-center gap-1.5`: the logos (`flex-1`), then the Trailer button. Full width: it ends above the bookmark, never beside or under it | 36 (the button's height) |
| The last row | [The bookmark](#the-bookmark)'s row from design pass (b): `flex-row items-end gap-3`, the JustWatch credit (`body-s` `text-muted`) in a `flex-1` column, then the 44-point bookmark, which lands at `right-5 bottom-3.5`, its place on the front too. `gap-1` under the services row | 44 (the bookmark's height) |

**The poster's middle.** The poster fills the header straight away (`Poster`, `absoluteFill`, `contentFit="cover"` with its default centred position), so the header shows the poster's vertical middle: the middle 132 points of a 518-point poster at the card's width. The wrapper that drew a whole card-shaped poster from `-top-5` goes. `Poster` itself doesn't change.

**The front's fade.** The header's gradient becomes the front's, unchanged: `GradientFill gradient="card-front-scrim"` in a view `absolute inset-x-0 bottom-0` at 92% of the header's height, as on the front (the 5 November fix, PR #203). `card-scrim` leaves the back; it stays for the match poster and the Final Cut bands. The title block keeps its place (`absolute left-5 right-16 bottom-4 gap-0.5`, clear of the badges' column); the meta moves to `text.primary`, as on the front, for AA over the lighter fade.

**The TMDB score, inline.** The score box goes. The header's meta line carries the score: "2017 · 1 h 43 · ★ 7,4 TMDB", that is the year and the runtime (`back.meta`, through `Intl` as today), a " · ", then `common:card.tmdbScore`, with "★ 7,4" in tone `marquee` (a nested `Text`) and "TMDB" in `text-secondary`. `mono-data`, at most two lines (one at the default size, even at 375 points). Naming TMDB next to its score keeps the source the box's label gave; TMDB's logo and notice stay in About ([tmdb.md](../../integrations/tmdb.md#terms-licence-and-attribution)). No score: the line ends after the runtime. The front's meta keeps its "★ 7.4" as it is. A friend's Letterboxd rating (M20) will join the same line the same way, never as a box.

**The synopsis, readable in full.** The space freed (the score box, about 80 points; the services, 25 to 50; the flip-back line, 26) goes to the synopsis, so most overviews now fit whole. When one still doesn't (a long overview, a 375 by 667 phone, large text):

- The text is cut one line earlier than it would be, with an ellipsis, and **"Read more"** shows under its last line: a `Pressable` `self-start`, `Text` `mono-eyebrow` tone `accent`, `common:card.readMore`, hit slop to 44 points, `haptic="press"`. The app knows it is cut by comparing the overview's full line count (from an unclipped, invisible measure) with the lines that fit.
- A tap opens [the synopsis sheet](#the-synopsis-sheet). A touch that starts on the link is the link's: the card's tap doesn't flip (the Trailer's touch mark, renamed `onControlTouch`), and a drag that starts on it moves the card as anywhere else.
- **Why a sheet.** A scroll inside the back would fight the drag and the swipe up for Seen it (Q10.1 stands). Expanding in place can't grow past the card's fixed size, and at the largest text even the whole body can't hold a long overview. A sheet holds any length at any size, leaves the gestures alone, and the card is there, still flipped, when it closes.

**Services, one row of logos.** `ServiceBadges` becomes `ServiceLogos`, still private to `movie-card.tsx`:

- Each service is a 32-point square (`size-8`), `rounded-sm`, `border border-border-default`, `bg-bg-raised`, its `w92` logo filling it (`contentFit="cover"`, sized by a style: an expo-image sized only by class has no width on iOS). No logo, or one that fails to load: its initials (`serviceInitials`) in `mono-eyebrow` `text-secondary`. The look of the service picker's `ServiceTile` (PR #264), small, not pressable, no selected state.
- One row, never wrapping. The row measures its width (`onLayout`); it holds `floor((width + 6) / 38)` squares. When the services don't all fit, the last square is the overflow: the same square with `common:card.moreServices` ("+3", the count through `Intl.NumberFormat`) in `mono-eyebrow` `text-secondary`. The back still gets six services at most (`BACK_SERVICES`).
- The Trailer button keeps the row's end; the logos take the rest. No trailer: the logos have the whole row. No services: no row and no credit; the Trailer button sits alone at the right.
- The JustWatch credit stays under the row whenever logos show (tmdb.md), in the last row beside the bookmark.
- **The bookmark and the row never meet.** The services and Trailer row is a full-width row of its own, ending 8 points above the bookmark's row, so neither a logo, "+n" nor the Trailer button sits under the bookmark's 44 points, and each keeps its own touch target.

**The flip-back line goes** (`common:card.flipBack`): the `refresh` badge shows the card turns, and a screen reader hears `common:card.flipHint`. Its 26 points go to the synopsis (question 2 below), less what the bookmark's 44-point last row takes. The last row then holds the JustWatch credit and the bookmark only.

**States.**

| State | The back shows |
| --- | --- |
| Loaded | Everything above |
| A short overview | The whole text, no "Read more"; the space under it stays empty |
| A long overview | The cut text and "Read more" |
| No overview | `swipe:card.noSynopsis`, never with "Read more" |
| No score, no director, no cast | Each part left out, as in Missing data above |
| More services than fit | The logos that fit, then "+n" |
| No services | No logos and no credit: the Trailer button alone at its row's right, above the bookmark, which keeps the last row by itself |
| A logo that fails | The initials in its square |
| A missing poster | The thumbhash, or `bg-bg-raised`, under the fade |
| Offline | The same: everything is in the card's payload |

**The largest text** (font scale above 1.3, the threshold `serviceColumns` uses). The title and the meta leave the header and open the body, in the flow (`title-l` up to two lines, the meta wrapping), so text never climbs over the poster's light top; the header keeps the poster, the fade and the badges. The synopsis is often cut there: "Read more" carries it. The logos keep 32 points; "+n" grows to `mono-eyebrow`'s cap (1.4) and still fits its square; the Trailer label to its cap (1.2). The credit wraps beside the bookmark, which keeps 44 points.

**A 375 by 667 phone.** The card fits the height left (about 300 by 450). The meta line stays one line. With the Trailer button the row holds two squares (one logo and "+n" when there are three services or more); without it, six.

### The synopsis sheet

`screens/swipe/synopsis-sheet.tsx`, route `/room/[id]/synopsis/[title]` (`app/room/[id]/synopsis/[title].tsx`), a `formSheet` registered in the room layout like the others: `gestureEnabled: true` (the room stack turns gestures off), `sheetGrabberVisible: true`, `sheetAllowedDetents: [0.6]`. M6.61.

- **What it reads.** The card from the card stack store, by its title id: no network, so it opens offline. If the card isn't in the store (it can't leave while the sheet covers it, but a re-read could), the sheet closes.
- **Layout.** Gesture Handler's `ScrollView`, `px-5 pt-5 gap-3`, bottom padding `max(insets.bottom, 16)`: a row with the title (`title-m`, role `header`, wraps, `flex-1`) and `IconButton` plain `x` (`common:actions.close`); the back's meta line, score included; `common:card.synopsis` (`mono-eyebrow` `text-secondary`); the whole overview in `body-l` (17 on 26, easier to read at length than the card's `body-m`). Nothing else: no Trailer, no services, no answers.
- **Closing.** Close, a swipe down, or the screen reader's escape gesture. The card is still on top and still flipped, as it was.
- **The room moves on while it's open** (the finale starts, the room closes, this seat is removed): it closes with the screen under it, as the room's other sheets do. A near miss or a shortlisted beat plays on the swipe screen under it; nothing is replayed.
- **Solo:** the same sheet.
- **Motion:** the system sheet's slide; Reduce Motion is the system's. `haptics.press()` from the link. No sound beyond the tap.
- **Accessibility:** on open, focus goes to the title; then the meta, the label, the synopsis, Close.

**Accessibility of the back.** The card stays one element. `swipe:a11y.cardBack` already reads the whole synopsis, so a screen reader never needs "Read more" and gets no new action. `swipe:a11y.cardBackServices` names every service, the ones behind "+n" included. The score reads as "TMDB rating 7.4" through the existing `cardBack` string.

**Copy (`common` namespace, new keys).**

| Key | French | English |
| --- | --- | --- |
| `card.tmdbScore` | ★ {{score}} TMDB | ★ {{score}} TMDB |
| `card.readMore` | Lire la suite | Read more |
| `card.moreServices` | +{{count}} | +{{count}} |

Removed once unused: `card.tmdbRating` (the box's label) and `card.flipBack`. "LIRE LA SUITE" fits under the synopsis at 375 points.

**What M6.61 changes.**

- `shared/movie-card.tsx`, the back: the header (the poster's middle, `card-front-scrim`, the meta in `text.primary` with the inline score); no score box (and no `friendRating` box); `FitText` cuts a line earlier and shows "Read more" when the text overflows; `ServiceLogos` replaces `ServiceBadges`; no flip-back line; the large-text layout. Props: `back.meta` (the year and runtime, without the score), `back.onReadMore` (without it, no link), `back.onTrailerTouch` renamed `back.onControlTouch`. Gallery: a long synopsis with "Read more", six services with "+n", no services, a logo that fails.
- `features/swipe/card-props.ts`: `back.meta` without the score; tests.
- `screens/swipe/swipe-card.tsx`: [the dim layer](#the-dim-layer); the card's opacity no longer follows its depth; `onReadMore` pushes the sheet's route.
- `screens/swipe/synopsis-sheet.tsx`, its route, and its entry in the room layout.
- The bookmark's last row on the back is M6.58's ([The bookmark](#the-bookmark)); M6.61 keeps it and only drops the flip-back line from it. Whichever task lands second rebases on the other.
- Tokens: `opacity.stack-dim-near` and `opacity.stack-dim-far` ([Design-system changes](#design-system-changes)).
- Tests: "Read more" shows only when the text is cut; a tap on it opens the sheet and doesn't flip; the overflow square counts the hidden services; the dim layer's opacity at each depth.

**Feel check for M6.61** (Harry, iPhone and a low-end Android):

- Flip a card: the header shows the poster's middle, as light as the front's fade.
- Drag the top card slowly: the second card brightens as it grows; nothing of the third shows through it. No stutter on the Android.
- A film with a long overview: "Read more" opens the sheet; closing it finds the card still flipped. A tap on the link never flips the card; a drag from it moves the card.
- A film on 4 or more services: one row of logos and "+n", the JustWatch line under it beside the bookmark; the bookmark never covers a logo or the Trailer button.
- Largest text: the title moves into the body; nothing overlaps the badges.
- Reduce Motion: the stack's dimming jumps with the cards, with no flash.

**Questions** (defaults taken; none needs an answer unless Harry objects).

1. **The synopsis: a sheet, or expand in place?** Default: compact the back so most fit, and a sheet for the rest. Expanding can't hold a long overview at large text.
2. **The flip-back line.** Default: it goes; the `refresh` badge and the screen reader's hint carry it.
3. **The poster's crop.** Default: the exact middle, as Harry asked. If faces end up cut too often (they often sit in a poster's upper third), the crop can move up later with `contentPosition`.
4. **The front's meta.** Default: "★ 7.4" stays without "TMDB"; the back names the source.
5. **The sheet's height.** Default: 0.6 of the screen, scrolling for a longer text.
6. **The dim values.** Default: 0.3 and 0.55, today's brightness made solid; tuned at the feel check.

### The bookmark

M6.51 (PR #275), moved by design pass (b) (M6.60) after Harry's feel test of 6 November 2026 ("too far away from the thumb"); M6.58 builds the move with Later in the app. It saves the film to My films, Later. With Later becoming a solo like (Harry, 6 November 2026), a save records a solo like that never counts for tonight. **It is not an answer:** the card stays on top, is still swiped, and the save counts for nothing tonight: nothing is broadcast, no other phone and no count shows it, and it touches no room deck.

**Options weighed** (for Harry, question 9):

| | A. A sixth button in the row | B. A long press on the card | C. A button low on the card's right edge |
| --- | --- | --- | --- |
| Reach | Best: the row is where the thumb lives | Anywhere on the card | Good: inside a right thumb's arc, about 60 points above the row |
| Found | Best: labelled like the answers | Hidden: needs a first-game hint | Visible on every card |
| Accidental saves | A sixth button next to Undo or Seen it invites the fast second tap the rewatch chip taught us about | A thumb resting on the card while reading saves after the press delay. A double tap is out: it would hold every flip by about 250 ms | Low: a drag from it still moves the card; only a deliberate tap saves |
| Screen readers | A plain button | The card's custom action only | The card's custom action, as today |
| What moves | Five equal columns become six: at 375 points a column is 60 wide, under the 68-point Nope and Like caps. Something leaves: Undo to the top bar (far from the thumb, where mistakes get fixed) or the labels of the small buttons. "PLUS TARD" beside "DÉJÀ VU" does not fit | The card's gestures gain a third member on the UI thread (`LongPress` beside `Pan` and `Tap`) | One view on each face of `MovieCard` |

**Recommended: C.** It fixes the reach with the least change, keeps the row as tuned, and stays visible. B can come later as a shortcut if the playtest asks for one.

**Layout** (both faces, the same spot, so a flip never moves it):

- A 44-point round button (`size-11 rounded-pill bg-bg-sunken border border-border-default`), `Icon` `bookmark` 22, its right edge 20 points from the card's right edge and its bottom edge 14 points from the card's bottom (`right-5 bottom-3.5`). The old 36-point button in the top left corner goes, on both faces. The flip badge keeps the top right.
- **Front:** `absolute`. The title keeps the full width; the meta line and the services row stop short of the bookmark (`pr-14`, 56 points). The services row always keeps its height (`min-h-6`, empty when the film has no service for the room), so the title always sits above the bookmark, whatever the meta's length.
- **Back:** in the flow. The JustWatch credit and the flip-back line (which M6.61 removes, [The card back, reworked](#the-card-back-reworked)) share the last row with it: `flex-row items-end gap-3`, the two lines in a `flex-1` column, now start-aligned, and the bookmark last. The services and Trailer row above it keeps the full width. The synopsis gives up the height (it is already fitted to the space left).
- **375 points and the largest text:** the bookmark keeps 44 and its icon 22 (no text). The meta wraps or cuts within its narrower width, before the title (as today). On the back the credit wraps beside the bookmark.

**States.** Empty: the outline icon in `text-primary`. Saved: the icon filled in `marquee-default` and the border `border-marquee-default`. Pressed: `bg-bg-raised`. A tap flips the state at once and a second tap takes the save back. The state is this phone's own for the session: room cards never carry a saved state, so a film saved in an earlier game shows an empty bookmark, and saving it again is harmless.

**Touch.** The target is the 44 points themselves (no hit slop needed now). A touch that starts on the bookmark is the bookmark's: the card's tap does not flip. A drag that starts on it moves the card as anywhere else. **The landing guard:** a card that has just come on top ignores a tap on its bookmark for `duration.base` (250 ms), so a finger still coming down from the last throw never saves the next film (the rewatch chip's lesson, [Seen it](#seen-it-the-rewatch-question)).

**Feel.** The press gives `haptics.press()`. A save pops once (scale 0.8 to 1, `spring.snappy`); an unsave and Reduce Motion have no pop. No toast and no sound (a toast would sit on the near-miss toast's spot).

**Offline.** The save is kept on the device and sent in the background in order, with the vote queue's retry delays (`features/later/`); nothing on screen says it is waiting. It is its own list, not the vote queue, because the queue belongs to a room and is dropped with it.

**Accessibility.** Unchanged: the card is one element, so it offers a custom action `save` (`swipe:a11y.actions.save`) that becomes `unsave`; the bookmark's own label follows the state (`common:card.bookmarkSave`, `common:card.bookmarkRemove`) and it reports `selected`. After a save or unsave `swipe:a11y.saved` or `swipe:a11y.unsaved` is announced politely. The landing guard does not apply to the custom action.

**Solo** uses the same card, so the bookmark moves there too. The copy is unchanged.

## The buttons row

`screens/swipe/action-row.tsx`, M6.9. Five `SwipeAction`s in equal columns, `flex-row items-end justify-between`, labels from `common:answers.*`. The row uses `px-2` instead of the screen's `px-5`, so the French labels ("J'AIME", "DÉJÀ VU") keep at least 12 points between them at 375 points wide ([components.md](../components.md#swipe-action-sharedswipe-action)); check French on the iPhone 16e and at 375.

| Button | Does | Disabled when |
| --- | --- | --- |
| Undo (48) | [Undo](#undo) | Always until M6.26 ships (Q9.4); then at the first card, right after an undo until the next answer, and while the last card answered is on the shortlist (M6.37) |
| Nope (68) | Throws left | No top card |
| Super (56), badge with the super likes left | Throws right with the SUPER stamp and the `marquee.default` border; the badge counts down with `layout.popIn` | No top card, or 0 left (no error haptic: running out isn't a mistake) |
| Like (68) | Throws right | No top card |
| Seen it (48) | Throws the card up and sends `seen`; in a room that allows rewatches the [rewatch chip](#seen-it-the-rewatch-question) then shows | No top card |

A press gives `haptics.press()` (from `Pressable`), then the card plays the same throw as a drag with the stamp at full from the start (`duration.instant`) and `haptics.throw()` as it leaves. Buttons work while the last card is still flying, and from either side of the card. While a card is dragged, the matching button is `lit`.

**Super likes left:** `api.room_seats.super_likes_left` for the player's own seat, minus the super likes still in the queue. A super like is spent on the phone at once; `no_super_likes` gives it back to the badge without a word.

## Seen it: the rewatch question

`screens/swipe/rewatch-chip.tsx`, `features/swipe/rewatch-chip.ts` and `features/swipe/answer.ts`, M6.12 and M6.49 (decided on 6 November 2026 after a playtest: a fast second tap on Seen it used to land on Yes and add a seen film as a like). Rooms whose seen rule is `allow_rewatch` or `show_all` (Q12.1; `api.rooms.seen_rule`) show the chip. Under `hide_seen` there is no chip.

1. **One tap on Seen it, or a swipe up past the line, is "seen, not again".** The card flies up at once with the SEEN IT stamp, `haptics.throw()`, and the vote is `seen` (a nope for the match, a seen for taste). Nothing waits and nothing is asked first.
2. **The chip then takes the hint line**, centred and far from Seen it: `swipe:rewatchChip.text` in `body-s` `text-secondary`, then a `Button` S `primary` `swipe:rewatchChip.yes` (label `swipe:a11y.seenYes`). It fades in (`layout.fadeIn`) over the hint, which fades out. A room that allows rewatches keeps the line `min-h-12` all game, so the stack never changes size.
3. **Yes** turns the answer into a like: `seen_rewatch` replaces `seen` through the vote queue (the `seen` is taken out if it still waits, or an undo is queued behind it, then the new vote), so the order holds and the server ends with one vote for the film, the like. No card moves. The chip becomes `swipe:rewatchChip.done` in `body-s` `text-like` for 1.5 s, with the button's `haptics.press()`. A second Yes finds nothing.
4. **The chip stays until the next answer (including Undo), the room moving on, or 5 seconds**, whichever comes first. With a screen reader on there is no timer: it stays until the next answer. The confirmation still lasts 1.5 s.
5. **A fast double tap on Seen it** sends two `seen` votes for two films and never a like: the chip is nowhere near the button and always belongs to the latest film.

Undo after Yes takes the `seen_rewatch` back (once), and brings the card to its front, without the chip.

## Undo

`features/swipe/undo.ts`, M6.26. Until then the button is drawn `disabled` so the row's layout is final (Q9.4).

- The last card comes back from the side it left, as the reverse of its throw (`timing.base`), front side up, and lands on top; the card that was on top slides back to second place. A super like goes back to the badge (`layout.popIn`).
- Once in a row: after an undo, the button is disabled until the next answer.
- **Not after a match** (M6.37): "A card that matched or became a finalist can't be undone" ([the answers](../../product/game-modes.md#the-answers)). While the last card this phone answered is on the shortlist (its `title_id` came in a `match` event, or this phone's own answer said `match: true`), the button is disabled, with the hint `swipe:a11y.undoShortlisted`. The next answer enables it again.
- **Tapped before the phone knew** (the vote was still in flight, so the card already came back): when the answer says `match: true`, the shortlisted beat takes that card away as the matched film on top of the stack, the super like (if any) leaves the badge again, and the phone doesn't call `api.undo_last_vote`.
- The phone never waits: if the vote is still in the queue it's removed; otherwise `api.undo_last_vote` is called once the queue is empty, and the card is already back.

| `api.undo_last_vote` answers | What the player sees |
| --- | --- |
| `ok` | Nothing more: the card is already back |
| `nothing_to_undo` | Nothing; the card stays. Reported to Sentry (the phone and the server disagree) |
| `locked` while swiping (the card's film is on the shortlist) | The card that came back leaves again (`layout.fadeOut`), the card behind settles on top (`spring.snappy`), a super like leaves the badge again. No message, no haptic. The button stays disabled until the next answer. The shortlist shows the film from the event or the next re-read |
| `locked` after the room left swiping (the card became a finalist, or the match was the pick) | Nothing: the layout follows the room to the Final Cut or the match overlay |
| `closed` | The room is re-read and the layout follows its state |
| Offline or a failed call | The call waits in line like a vote and is retried; the card stays back |

## The near miss

`features/swipe/near-miss.ts` and `screens/swipe/near-miss.tsx`, M6.13. Party mode only (the only mode in the first release).

- **When** (Q2.4, Q13.1): a `near_miss` `{title_id, likes, of, needed}` arrives. The server sends it only when the film is one like short of the rule with at least 2 likes, and again with the corrected count after an undone like (Q3.4). The phone keeps the latest count per film in memory for the game, lost on a restart (Q13.2).
- **Where:** only if this player hasn't answered the film (not in their votes or queue), and only while that card is the top card. Players who answered see nothing.
- **What:** a `Toast` tone `like` (heart), title `swipe:nearMiss` with `count` (the likes) and `of`, no message line. It is drawn inline (not `showToast`), over the top bar's player stack, from Leave's right edge to 8 points before the shortlist (M6.37), so Leave stays reachable and the shortlist stays in sight. The top card takes `glow-like`. Both arrive with `layout.toastIn` once the card has settled on top, and stay while the card does (flipped too). A new count changes the number in place, without a new slide. When the card leaves (any answer), the toast leaves with `layout.toastOut` and the glow goes.
- **Hidden** when the latest count's `needed` is more than 1 (an undo dropped it below the line), or the film matched. While [the shortlisted beat](#the-shortlisted-beat) plays, the toast fades out and comes back after it if its card is still on top.
- No haptic, no sound. A missed event shows nothing; the phone never invents one.

## The shortlisted beat

`screens/swipe/shortlisted.tsx`, `features/shortlist/` and the room layout's hold, M6.37. From [the shortlisted beat](../moments.md#the-shortlisted-beat), which wins where this differs. It plays on `match` with `decided: false`, or on this phone's own `ok` answer with `match: true` and `decided: false`, whichever comes first.

**The layer.** `absolute inset-0` over the whole screen (so the poster can fly up to the top bar), `pointerEvents="box-none"`, mounted only while the beat plays. A view inside it catches every touch over the stack's frame and the buttons row; the buttons keep their look (no dimming, which would flash twice a game) and a press does nothing, with no haptic. The top bar's Leave and player stack still work.

**The pieces**, on the layer:

1. **The scrim:** `bg-overlay-scrim` over the stack's frame only (from under the banner to the top of the buttons row), so the top bar and its shortlist stay bright. In over `duration.fast`, out over `duration.fast`.
2. **The column**, centred in the stack's frame, `items-center gap-3 px-5`:
   - **The title:** `swipe:shortlisted.title` in `display-m`, tone `marquee`, centred, at most 2 lines. No glow: `glow-marquee` stays the pick's. The French has a no-break space before the colon, so "C'EST UN MATCH :" stays on the first line and "1 SUR 3" goes to the second at 375 points.
   - **The poster:** `Poster` in a `rounded-md overflow-hidden` frame, 2:3, `elevation-card`, with a `border-2 border-marquee-default` ring drawn over it. Half the card's width (172 on a 393-point phone), smaller if the stack's frame can't hold the title's 2 lines, the poster and the count (on a 375 by 667 phone it still fits at half width). The placeholder is the card's thumbhash; no poster: `Icon` `film`, 48, `text-muted`.
   - **The vote count:** `match:count.unanimous` when `likes` equals `of`, otherwise `match:count.majority` (the overlay's own lines), in `title-m`, tone `primary`, one line. Until the event arrives the line is empty but keeps its height, so nothing moves when it fades in.

**The times** (from the first signal; the beat's table is the reference):

| Time | What moves | Haptic |
| --- | --- | --- |
| 0 | A drag springs back (`spring.card`); a thrown card finishes its flight. The scrim fades in. The poster pops in (`layout.popIn`). The near-miss toast fades out (`layout.fadeOut`) and the glow goes | `haptics.shortlist()` and the bell (`playSound('shortlist')`) |
| 150 ms | The title pops in (`layout.popIn`); the vote count fades in (`layout.fadeIn`), or when the event lands | None |
| `duration.shortlist-hold` (1.2 s) | The title and count fade out (`layout.fadeOut`). The poster flies to its slot: translate and scale from its frame to the slot's (`measureInWindow` on the slot), with its corner radius going from 12 to 4, over `duration.slow` with `easing.standard` | None |
| + `duration.slow` (1.6 s) | The flying poster unmounts as the slot shows the film; the slot scales from 1.15 to 1 (`spring.snappy`); the count changes in place. The scrim fades out | None |
| + `duration.fast` (1.75 s) | The layer unmounts and the stack takes input. A near-miss toast still due on the top card fades back in (`layout.fadeIn`) | None |

**The matched film in this phone's stack** (it hasn't answered it yet, under the 70% rule): as the top card, the poster pops in from that card's frame instead of the middle, and the card fades out under it (`layout.fadeOut`), so the next card is on top when the scrim leaves. As the second or third mounted card, it fades out under the scrim (`layout.fadeOut`) and the cards behind move up (`spring.snappy`). Further back, `features/swipe/card-stack.ts` drops it from the held cards. An open rewatch question on it closes with no vote. A vote on it already queued is still sent.

**Several beats in a row** (several matches at once): the next beat starts as the previous poster lands (at 1.6 s); the scrim stays up, the next poster pops in, and the count steps up as each one lands. The layer unmounts after the last.

**The third match** (`shortlisted` equals `shortlist_size`, or this phone's own answer with `state: 'finale'`). The room layout holds its route while the beat plays: a `useShortlistHold`, like the reveal's `useRevealHold`, true from 0 to the end of the last beat in a row, and never longer than 3 seconds. `state_changed {state: 'finale'}` arrives during the beat; when the hold ends, the layout replaces the screen with the Final Cut, which fades in as it always does ([final-cut.md](final-cut.md#states), Arriving). `finale_started` may start loading the finalists' posters during the beat.

**The pick arrives during a beat** (`match` with `decided: true`, `only_match`): the beat's layer unmounts at once and the match overlay takes over ([match.md](match.md#when-it-shows)).

**Reduce Motion.** The poster and the title fade in (`layout.fadeIn`) instead of popping. The flight becomes a crossfade: the poster fades out over the stack while the slot's poster fades in (`duration.slow`); nothing travels and the slot doesn't pop. The times stay the same. The haptic and the bell are unchanged.

**Screen reader.** At 0, `swipe:shortlisted.a11y` is announced once, assertively (`shortlisted.a11yNoTitle` without the film's card), with the vote count when the event has arrived. Focus doesn't move. The shortlist's label reads the new film from then on.

**What it never shows:** an avatar, a name, whose like completed the match, "2 to go" or anything counting down to the vote.

## First-game hints

`screens/swipe/hints.tsx`, M6.18, from [the first game](../../product/onboarding.md#the-first-game) and moments.md#first-game-hints-m618. In the hint line, `body-s` tone `secondary`, centred, one hint at a time. Each is remembered on its own, per phone (Q18.2); one not finished in the first game shows in the next. "Card N" is the player's Nth card this game.

| Hint | Shows | Gone when |
| --- | --- | --- |
| `swipe:hints.swipe` | Card 1. After `duration.hint-delay` with no touch, the card leans right to a third of the commit line with the LIKE stamp at the same share, comes back (`spring.card`), then leans left with NOPE, once (through `features/swipe/top-card.ts`). No haptic | The first answer |
| `swipe:hints.seen` (Q18.1), or `swipe:hints.seenHide` under `hide_seen` | Card 2 | The first Seen it, card 10, or a later hint |
| `swipe:hints.flip` | Card 3 | The first flip, card 10, or a later hint |
| `swipe:hints.superLikes` | The first tap on the star, or card 5 | A tap on the hint, or 3 answers later |

- A later hint replaces the one showing, and the replaced one counts as shown.
- The super likes hint is a `Pressable` (label `swipe:hints.dismiss`) with a 14-point `x` after the text.
- Hints come in with `layout.fadeIn` and leave with `layout.fadeOut`. They never cover the card or the buttons; the near-miss toast is at the top, so they never stack.
- Any touch on the card cancels the lean at once and gives the card to the finger. A tap during the lean flips the card.
- Reduce Motion: instead of the lean, the LIKE stamp and then the NOPE stamp show still at the same share for `duration.slow` each.

## The done card (Nothing left)

`DoneCard` in `screens/swipe/status-cards.tsx`, from M6.29; M6.17 adds the filters and the liked count. Screen 26 Nothing left (`30:2000`, the original page only; the first release page has no copy, figma-map.md). Q17.1: the card shows what caused it, tonight's filters and how many films the room has liked, and no buttons until M18 ([how a game ends](../../product/game-modes.md#how-a-game-ends), "Running out of cards").

**When.** Only after `request_cards` answers `done` `{liked}` (M6.29): the seat has no unanswered card and the SQL baseline dealt it nothing. A seat that reached the card count but still has cards keeps swiping (decision row 14), even if its disc says Done (Q27.2). The card stack keeps `liked` from the answer (`features/swipe/card-stack.ts`). The stack asks again on its retry timer; each new `done` answer updates the count in place, with no animation.

**Layout.** The same card-size frame as the waiting card (`bg-bg-surface`, `rounded-xl`, `border border-border-default`, entering with `layout.fadeIn`). Inside, a `ScrollView` whose content is centred when it fits and scrolls when it doesn't (the largest text). The content is one `EmptyState`:

1. Icon `popcorn`; title `swipe:done.title`; body `swipe:done.body` (both from M6.9, unchanged).
2. In `EmptyState`'s new `children` slot ([design-system changes](#design-system-changes)), `gap-2`, centred:
   - `ending:nothingLeft.filters` in `mono-eyebrow`, tone `secondary`.
   - **The filter tags:** a centred `flex-row flex-wrap justify-center gap-1.5` of `Tag` tone `neutral`, in this order, each only when it applies (a filter that doesn't narrow the deck has no tag, and no empty line is ever left):

     | Tag | Icon | Shown when | Label |
     | --- | --- | --- | --- |
     | The services | `tv` on the first only | Always: up to 2 names from `api.rooms.provider_ids`, in `useCountryProviders(country)` order (`display_priority`), one tag each | The service's name. Then one more tag `ending:filters.moreServices` (`+{{count}}`) for the rest. If the providers list hasn't loaded or failed, one tag `ending:filters.services_*` with the count instead |
     | The time budget | `clock` | `runtime_max` is set | `ending:filters.runtime`, the duration through `formatRuntime` ("1 h 45", "2 h 00") |
     | The age cap | `shield` | `max_age` is set (null is "Adults") | `ending:filters.age` with the age, or `ending:filters.allAges` for 0 |
     | The seen rule | `eye` | `seen_rule` is `hide_seen` | `ending:filters.hideSeen` |
     | The quality | `star` | `quality` is `hidden_gems` or `guilty_pleasures` | `ending:filters.hiddenGems` or `ending:filters.guiltyPleasures` |

   - **The liked count:** `ending:nothingLeft.liked_*` with `liked`, in `mono-data`, tone `like`. Left out while `liked` is unknown.
3. No button inside the card: no Change filters (M18.6), no Vote now (M18.5). The answer buttons below stay disabled; Undo follows [its own rule](#undo) (an undo gives a card back, clears `done_at`, and the done card gives way to the card).

Measured at 375 by 667 (a card about 324 by 487): the icon, a two-line title, the body, the eyebrow, two rows of tags and the count fit without scrolling. A long service name is cut by `Tag`'s one line; the full names are in the label.

**States.** Offline before the `done` answer: the [waiting card](#states), not this one. Offline after it: the done card stays, the count stops updating, `RoomBanner` shows the offline note. The finale starts or the room ends: the layout replaces the screen, as for any state change.

**Motion, haptics, sound.** The frame's `layout.fadeIn` only; the count changes without motion. No haptic (it isn't a refusal, and nobody pressed anything), no sound. Reduce Motion: the fade stays.

**Accessibility.** When the done card replaces the top card, focus moves to its title (`EmptyState` `autoFocus`), since the focused card is gone. Then the body; then the eyebrow and the tags as one element, `ending:a11y.filters` with every service name in full and every tag's label, joined by `formatList`; then the count; then the buttons row as today (disabled answer buttons announce as dimmed).

**Never shown.** Which films were liked, or who liked anything: a count only. No player names on the card. Nothing about the other players' decks or how many cards they have left (the player stack already says Done, and the players sheet a count).

**Copy** (`ending` namespace; the `swipe` files are not touched, [closed.md](closed.md) lists the namespace's other keys):

| Key | French | English |
| --- | --- | --- |
| `nothingLeft.filters` | Les filtres du soir | Tonight's filters |
| `nothingLeft.liked_one` | {{count}} film aimé pour l'instant | {{count}} film liked so far |
| `nothingLeft.liked_other` | {{count}} films aimés pour l'instant | {{count}} films liked so far |
| `filters.moreServices` | +{{count}} | +{{count}} |
| `filters.services_one` | {{count}} plateforme | {{count}} service |
| `filters.services_other` | {{count}} plateformes | {{count}} services |
| `filters.runtime` | Moins de {{duration}} | Under {{duration}} |
| `filters.age` | Dès {{age}} ans | Ages {{age}}+ |
| `filters.allAges` | Tous publics | All ages |
| `filters.hideSeen` | Jamais vus | Unseen only |
| `filters.hiddenGems` | Pépites cachées | Hidden gems |
| `filters.guiltyPleasures` | Plaisirs coupables | Guilty pleasures |
| `a11y.filters` | Les filtres du soir : {{list}} | Tonight's filters: {{list}} |

French puts 0 in the singular ("0 film aimé pour l'instant"), English in the plural ("0 films liked so far"). Counts go through `Intl` (i18next's `count`).

## States

| State | What the player sees |
| --- | --- |
| First load (no cards read yet) | The loading card in the stack; the buttons disabled (Undo too); the player stack from `api.room_seats` |
| Playing | The stack and the buttons |
| Past the mounted cards, waiting for a refill | **The loading card:** a `Skeleton` the card's size, `rounded-xl`, label `swipe:loading.a11y`. No haptic, no text. Answer buttons disabled. After 10 seconds (a starting value), `swipe:loading.slow` in `body-s` muted and `Button` secondary S `common:actions.retry` (it refetches the cards) inside the card |
| Offline, cards left | Swiping carries on, feel unchanged. `RoomBanner` shows `common:states.offlineVotes_*` with the queue's count, or `common:states.offlineRoom` while nothing waits. M6.9 gives `RoomBanner` an optional `waitingVotes` count for this |
| Offline, no cards left | **The waiting card:** a card-size `bg-bg-surface` frame, `rounded-xl`, `border-border-default`, with `EmptyState` icon `wifi-off`, `swipe:waiting.title`, `swipe:waiting.body`. Answer buttons disabled. When the connection is back, the queue sends, the cards are fetched, and the next card replaces it with `layout.fadeIn` |
| Reconnecting | `RoomBanner` as in [Reconnecting](reconnecting.md); on `SUBSCRIBED` the re-read includes the matches and the next cards |
| This player is out of cards (`request_cards` answered `done`, M6.29) | **[The done card](#the-done-card-nothing-left):** the same frame, `EmptyState` icon `popcorn`, `swipe:done.title`, `swipe:done.body`, tonight's filters and the liked count (M6.17). Answer buttons disabled; Undo follows its own rule. Presence says `done`. A seat that only reached the card count keeps its cards and keeps swiping (decision row 14) |
| A match that joins the shortlist (`decided: false`) | [The shortlisted beat](#the-shortlisted-beat) over the stack for about 1.75 s, then the next card. The question stays open with its buttons idle, unless its card is the matched film |
| The third match | The beat, then the layout moves to the Final Cut |
| A match that is the pick (`decided: true`: `only_match`, or a mode with 1) | The [match overlay](match.md) takes over from the room layout. A drag springs back (`spring.card`), thrown cards finish their flight, the question closes, the near-miss toast leaves with `layout.fadeOut` |
| The room moves on (`finale`, `abandoned`) | The layout replaces the screen. A drag springs back first |
| Removed | Home with `join:errors.removed` ([the removed side](host-menu.md#the-removed-players-side)) |

**Answers the screen can get.** Nothing here is an error shown to the player unless it says so.

| Call and answer | What the player sees |
| --- | --- |
| `cast_vote` `ok` | Nothing. With `match: true`: `decided: false` starts the shortlisted beat, `decided: true` the overlay. `state: 'finale'`: the beat plays, then the layout follows |
| `cast_vote` `duplicate`, `dropped` | Nothing |
| `cast_vote` `closed` | Every queued vote for the room is dropped quietly; the room is re-read |
| `cast_vote` `no_super_likes` | The super like goes back to the badge |
| `cast_vote` "card not dealt to this seat" | Nothing; Sentry, and the cards are refetched |
| `cast_vote` denied (`42501`, an expired session) | The session is refreshed once and the vote retried; a second denial drops it, to Sentry (Q11.1) |
| `request_cards` `ok`, `enough` | Nothing (the cards arrive) |
| `request_cards` `queued` | The loading card if the stack is empty |
| `request_cards` `done` `{liked}` | [The done card](#the-done-card-nothing-left) once the stack is empty, with the count |
| `request_cards` `closed` | The room is re-read |

## Live changes

| Event | The screen |
| --- | --- |
| `deck_updated` naming this seat | Only the cards behind the 3 mounted ones are replaced |
| `near_miss` | [The near miss](#the-near-miss) |
| `match` with `decided: false` | [The shortlisted beat](#the-shortlisted-beat); the film goes into [the shortlist](#the-shortlist) and leaves this phone's stack |
| `match` with `decided: true` | [The match](match.md) |
| `finale_started` | Nothing visible; the finalists' cards may start loading |
| `member_joined`, `member_left`, `member_removed` | The seats re-read; a new disc pops in (`layout.popIn`), a leaving one goes with `layout.fadeOut`, the others slide (`LinearTransition`, `duration.base`) |
| `host_changed` | The crown moves; the new host gets `lobby:youreHost.title` as a toast, with no message line |
| Presence | Dots, away, counts, done |
| `state_changed` | The layout follows the state, after the shortlisted beat if one is playing (the hold) |

## Copy

M6.9 adds the whole `swipe` namespace (`i18n/locales/fr/swipe.json` and `en/swipe.json`) at once, so later tasks never edit the same locale files. Proposed French terms follow the glossary.

| Key | French | English |
| --- | --- | --- |
| `pills.you` | Toi | You |
| `pills.done` | Fini | Done |
| `loading.a11y` | Chargement du film suivant | Loading the next film |
| `loading.slow` | On distribue encore les cartes. | Still dealing the cards. |
| `waiting.title` | En attente du réseau | Waiting for the connection |
| `waiting.body` | Tes votes sont gardés. Ils partiront dès ton retour. | Your swipes are saved. They'll go as soon as you're back. |
| `done.title` | Tu as vu toutes tes cartes | That's all your cards |
| `done.body` | On attend que les autres finissent. | Waiting for the others to finish. |
| `card.noSynopsis` | Pas encore de résumé pour ce film. | No synopsis for this one yet. |
| `nearMiss_one` | {{count}} sur {{of}} a aimé | {{count}} of {{of}} of you liked this |
| `nearMiss_other` | {{count}} sur {{of}} ont aimé | {{count}} of {{of}} of you liked this |
| `rewatchChip.text` | Déjà vu. On le revoit ce soir ? | Seen it. Watch it again tonight? |
| `rewatchChip.yes` | Oui | Yes |
| `rewatchChip.done` | Partant pour le revoir | Up for a rewatch |
| `hints.swipe` | À droite : j'aime. À gauche : bof. | Swipe right to like, left to nope. |
| `hints.seen` | Déjà vu ? Glisse vers le haut. On te demandera si tu le reverrais. | Seen it? Swipe up. We'll ask if you'd watch it again. |
| `hints.seenHide` | Déjà vu ? Glisse vers le haut, il quitte la partie. | Seen it? Swipe up and it leaves the game. |
| `hints.flip` | Touche la carte pour voir l'histoire. | Tap the card for the story. |
| `hints.superLikes_one` | {{count}} coup de cœur par partie. Il compte double s'il faut un vote final. | {{count}} super like per game. It counts double if it comes to a final vote. |
| `hints.superLikes_other` | {{count}} coups de cœur par partie. Ils comptent double s'il faut un vote final. | {{count}} super likes per game. They count double if it comes to a final vote. |
| `hints.dismiss` | Masquer l'astuce | Hide this tip |
| `a11y.card` | {{title}}, {{meta}}. Sur {{services}}. | {{title}}, {{meta}}. On {{services}}. |
| `a11y.cardBack` | {{title}}. Note TMDB {{rating}}. {{synopsis}} | {{title}}. TMDB rating {{rating}}. {{synopsis}} |
| `a11y.actions.like` | J'aime | Like |
| `a11y.actions.nope` | Bof | Nope |
| `a11y.actions.superLike` | Coup de cœur | Super like |
| `a11y.actions.seen` | Déjà vu | Seen it |
| `a11y.cardBackNoRating` | {{title}}. {{synopsis}} | {{title}}. {{synopsis}} |
| `a11y.cardBackServices` | Sur {{services}}. | On {{services}}. |
| `a11y.actions.flip` | Retourner la carte | Flip the card |
| `a11y.actions.trailer` | Voir la bande-annonce | Watch the trailer |
| `a11y.actions.save` | Garder pour plus tard | Save for later |
| `a11y.actions.unsave` | Retirer de Plus tard | Remove from Later |
| `a11y.saved` | {{title}} : gardé pour plus tard | {{title}}: saved for later |
| `a11y.unsaved` | {{title}} : retiré de Plus tard | {{title}}: removed from Later |
| `a11y.superLeft_one` | Coup de cœur, il en reste {{count}} | Super like, {{count}} left |
| `a11y.superLeft_other` | Coup de cœur, il en reste {{count}} | Super like, {{count}} left |
| `a11y.superNone` | Plus de coup de cœur | No super likes left |
| `a11y.undoNone` | Rien à annuler | Nothing to undo |
| `a11y.seenYes` | Oui, on le revoit ce soir | Yes, watch it again tonight |
| `a11y.seenNo` | Non, pas ce soir | No, not tonight |
| `a11y.pill_one` | {{name}}, {{count}} film | {{name}}, {{count}} film |
| `a11y.pill_other` | {{name}}, {{count}} films | {{name}}, {{count}} films |
| `a11y.pillAway` | {{name}}, pas là | {{name}}, away |
| `a11y.pillHost` | {{name}}, hôte | {{name}}, host |
| `a11y.done` | {{name}} a fini | {{name}} is done |
| `a11y.thrown` | {{answer}} : {{title}} | {{answer}}: {{title}} |

**Added by M6.37** (the shortlist), in the same files:

| Key | French | English |
| --- | --- | --- |
| `shortlist.count` | {{count}}/{{of}} | {{count}}/{{of}} |
| `shortlist.a11y` | Sélection, {{count}} sur {{of}} : {{titles}} | Shortlist, {{count}} of {{of}}: {{titles}} |
| `shortlist.a11yEmpty` | Sélection vide. Le vote commence à {{of}} matchs. | Shortlist empty. The vote starts at {{of}} matches. |
| `shortlisted.title` | C'est un match : {{count}} sur {{of}} | It's a match: {{count}} of {{of}} |
| `shortlisted.a11y` | C'est un match : {{title}}. {{count}} sur {{of}} dans la sélection. {{votes}} | It's a match: {{title}}. {{count}} of {{of}} on the shortlist. {{votes}} |
| `shortlisted.a11yNoTitle` | C'est un match. {{count}} sur {{of}} dans la sélection. {{votes}} | It's a match. {{count}} of {{of}} on the shortlist. {{votes}} |
| `a11y.undoShortlisted` | Ce film est dans la sélection | This film is on the shortlist |

In `shortlisted.*`, `count` is the shortlist's count and `of` its size; `{{votes}}` is the `match:count.*` line, or empty before the event. In French, the space before each colon is a no-break space (U+00A0). "Sélection" for "the shortlist" is proposed (the `copy` skill's glossary). No exclamation mark: this is a small cheer, and the pick's overlay keeps "C'est un match !". "C'EST UN MATCH : 3 SUR 3" takes 2 lines at 375 points in `display-m`, which the title allows.

`nearMiss_one` never shows (the minimum is 2 likes) but French needs the form. The `a11y.pill*` keys stay for `PlayerPill`, which the swipe screen no longer uses (M6.63). `a11y.thrown` is the polite announcement after an answer from a screen reader action.

**Added by M6.63** (the player stack and the players sheet), in the same files:

| Key | French | English |
| --- | --- | --- |
| `players.more` | +{{count}} | +{{count}} |
| `players.title` | Joueurs | Players |
| `players.films_one` | {{count}} film | {{count}} film |
| `players.films_other` | {{count}} films | {{count}} films |
| `a11y.players_one` | {{count}} joueur dans la salle de {{host}} | {{count}} player in {{host}}'s room |
| `a11y.players_other` | {{count}} joueurs dans la salle de {{host}} | {{count}} players in {{host}}'s room |
| `a11y.playersDone_one` | {{count}} a fini | {{count}} is done |
| `a11y.playersDone_other` | {{count}} ont fini | {{count}} are done |
| `a11y.playersAway_one` | {{count}} pas là | {{count}} away |
| `a11y.playersAway_other` | {{count}} pas là | {{count}} away |
| `a11y.playersHint` | Affiche qui joue et où chacun en est | Shows who is playing and how far each is |

The stack's label joins `a11y.players`, then `a11y.playersDone` and `a11y.playersAway` when their count isn't 0, with commas: "4 players in Harry's room, 1 is done". On your own room, `host` is your own name. Reused: `lobby:seat.you`, `lobby:seat.away`, `lobby:seat.host`, `lobby:a11y.seat`, `pills.done`, `common:actions.close`.

**In `common`, added by M6.51:** `card.bookmarkSave` (Garder pour plus tard / Save for later) and `card.bookmarkRemove` (Retirer de Plus tard / Remove from Later), the bookmark's label by state.

**In `common`, added by M6.9** (the card is shared): `card.stampSeen` (Déjà vu / Seen it) and `card.stampSuper` (Super / Super; "COUP DE CŒUR" doesn't fit a 52-point stamp).

**Reused:** `match:count.unanimous` and `match:count.majority` (the beat's vote count), `common:answers.*` (the button labels), `common:card.*`, `common:states.offlineVotes_*`, `common:states.offlineRoom`, `common:states.reconnecting`, `common:states.stillTrying`, `common:actions.retry`, `common:errors.generic.title`, `lobby:a11y.leave`, `lobby:leave.*`, `lobby:a11y.seat`, `lobby:seatSheet.*`, `lobby:remove.*`, `lobby:youreHost.title`, `join:errors.removed`.

## Motion, haptics, sound

- Motion as in the sections above; tokens only. A new touch cancels anything still moving on the top card; a thrown card finishes on its own.
- Haptics: `commit` at the line, `throw` on every throw, `press` from the buttons, the bookmark and the player stack, `shortlist` once per shortlisted beat (M6.37). Nothing for the flip, the near miss, the hints, a disc turning Done, a refusal or the shortlist filling on a re-read.
- Sound: only the shortlisted beat's bell, with its haptic ([sounds.md](../sounds.md#a-match-joins-the-shortlist)), and the match overlay's own ([match.md](match.md)). Swipes, the flip, the near miss and the hints are silent.

## Accessibility

- **Focus order:** Leave, the player stack (one button, `swipe:a11y.players`), the shortlist (`swipe:shortlist.a11y` or `a11yEmpty`), the banner, the top card, the hint, Undo, Nope, Super, Like, Seen it. When the done card shows, it takes the top card's place in this order (its own order is in [the done card](#the-done-card-nothing-left)).
- **The top card is one element:** `swipe:a11y.card` on the front, `swipe:a11y.cardBack` on the back, with custom actions like, nope, super like, seen it and flip (`swipe:a11y.actions.*`). After an action, `swipe:a11y.thrown` is announced and focus stays on the new top card. While the back shows, the card also offers a `trailer` custom action (the card is one element, so a button inside it can't take focus). The back's reading adds the director, the cast and the services after the synopsis. The reason label waits for the reason codes (M17 to M20): until the app knows a code, no label shows, front or back.
- **The buttons** use `common:answers.*` as labels; Super uses `swipe:a11y.superLeft_*` or `superNone`; a disabled Undo has `swipe:a11y.undoNone` as its hint.
- **The rewatch chip** is announced when it shows (`swipe:rewatchChip.text`) and again for the confirmation (`rewatchChip.done`), without moving focus. Yes is labelled `swipe:a11y.seenYes`. With a screen reader on the chip never leaves on a timer; it stays until the next answer.
- **The near-miss toast** is announced once, politely, when it shows on the focused card.
- **The shortlisted beat** is announced once, assertively (`swipe:shortlisted.a11y`); focus stays where it was. A disabled Undo after a match has the hint `swipe:a11y.undoShortlisted`.
- **Reduce Motion:** the drag follows the finger without the tilt; a throw becomes a short slide toward its side with a fade (`timing.base`); the stamp (label included) shows at full as soon as the drag starts toward an answer, with its coloured border, without growing; the second card is already full size, and its dim layer changes at once with the depth; Undo fades the card back in place; the flip crossfades in place (`timing.flip`); the toast fades (`layout.fadeIn`, `layout.fadeOut`) and the glow doesn't pulse; the hint lean becomes the still stamps; the shortlisted beat fades instead of popping and crossfades instead of flying ([The shortlisted beat](#the-shortlisted-beat)).
- Largest text: the player stack keeps its size (only "+N" is text, capped at 1.2); the shortlist's count grows to its cap (1.2) and its slots keep their size; the beat's title keeps 2 lines at `display-m`'s capped scale; the hint line wraps to two lines; the question's title wraps; the card's meta is cut before the title.

## Design-system changes

Spec here; app-dev builds them with their gallery states in the task named.

| Change | Task |
| --- | --- |
| `MovieCard`: two more stamps, `seen` (SEEN IT, `accent.default` border, centred over the poster's middle, not rotated) and `super` (SUPER, `marquee.default`, where LIKE sits, -14 degrees) | M6.9 |
| `MovieCard`: the stamp's opacity and scale and the border's opacity driven by shared values from the drag (on the UI thread), as well as the `stamp` prop for the gallery and the buttons | M6.9 |
| `MovieCard`: `glow` (the near miss's `glow-like` around the card, under the drag's border) | M6.13 |
| `PlayerPill`: `you` (the label), `away` (muted name, no dot), `done` (the count replaced by `swipe:pills.done` in tone `like`), `host` (the crown), and `onPress` | M6.27 |
| `SeatRow` moves from `screens/lobby/` to `shared/seat-row` for the players sheet: `services` becomes `detail` (any string), and a new `done` gives the `like` Tag with `check` and `swipe:pills.done` (at most one tag: away, then Done, then the host; the crown icon follows the name when the host's tag gives way). The lobby passes its services line as `detail` and no `done`, so it looks the same. A gallery entry with every state | M6.63 |
| `PlayerPill` leaves the swipe screen; it stays in `shared/` for the store scenes, unchanged | M6.63 |
| `MovieCard`: the bookmark moves to the bottom right of both faces, 44 points, with the landing guard ([The bookmark](#the-bookmark)); the gallery shows it empty, saved, on the back, and at the largest text on a 375-point card | M6.58 |
| `RoomBanner`: an optional `waitingVotes` count for the offline note | M6.9 |
| `EmptyState`: an optional `children` slot between the body and the action (the done card's filters and count). A gallery state with a row of tags | M6.17 |
| Tokens: `rotation.card-tilt` 10 and `rotation.card-tilt-max` 15 (degrees, the swipe), `duration.hint-delay` 600ms (the card 1 lean's wait), each with a `$description`, then `mise run tokens` | M6.9, M6.18 |
| `PosterThumb`: a size `xs`, 24 by 36 (`h-9 w-6`), with `rounded-xs` instead of `rounded-sm`. A gallery state with a missing poster | M6.37 |
| Token: `duration.shortlist-hold`, 1200ms, "The shortlisted beat: the poster over the stack before it flies to the shortlist (a starting value)", then `mise run tokens` | M6.37 |
| Haptic: `haptics.shortlist()` in `lib/haptics`, "A match joins the shortlist": two `Light` impacts 100 ms apart, a starting point for the feel check. The `motion` skill's haptics table gets the row | M6.37 |
| Tokens: `opacity.stack-dim-near` 0.3, "The dark layer over the swipe stack's second card: dims it without letting the third show through (a starting value)", and `opacity.stack-dim-far` 0.55, the same for the third card. `opacity.stack-far` goes (nothing else uses it); `opacity.stack-near` stays for `ServiceTile`'s dimmed logo, and its description says so. Then `mise run tokens`; the `design-system` skill's opacity line follows | M6.61 |
| `MovieCard`, the back: the poster's middle, `card-front-scrim`, the inline score, "Read more", one row of logos with "+n", no flip-back line ([The card back, reworked](#the-card-back-reworked)) | M6.61 |

No new component: the new pieces are single-use screen pieces in `components/screens/swipe/` (the shortlist and the beat's layer are M6.37's, the player stack M6.63's). No new token for design pass (b): the player stack, its badges and the bookmark use existing sizes, colors and motion tokens. Design pass (a) adds two (`opacity.stack-dim-near` and `opacity.stack-dim-far`, above), and the synopsis sheet is a single-use piece too (M6.61's).

## Differences from the Figma

- The Figma's top row (an avatar stack, "3 swiping", "You're on card 14" and a sliders button) became Leave and the player pills with each count (Q27.1); design pass (b) brings the avatar stack back, with Done and away on the discs and the counts in the players sheet. No sliders button: the host's tools are in the players sheet, through the seat sheet.
- The near-miss toast drops "One more yes and it's a match": the count only, always true (moments.md#copy). It sits over the player stack and keeps Leave visible.
- The hints share one line between the card and the buttons, so the card never moves when one arrives. Onboarding put the card 2 hint under the buttons; this spec moves it (onboarding.md and moments.md are updated).
- Nothing left (26, `30:2000`): no top-row avatars or sliders, and no Vote on our likes or Change filters until M18.5 and M18.6 (Q17.1). The title and body stay M6.9's ("That's all your cards"), not "You've seen the whole lineup", because the body has to say what happens next while there is no button. The filters are `Tag`s, not selected `Chip`s: a chip looks pressable, and nothing here can be pressed yet. The icon is `EmptyState`'s, without the Figma's marquee glow: a glow is for the shared moments. The count says "liked so far", not "liked by at least one player".
- Copy on the Figma's game screens is English only; this spec is the copy.
- The shortlist and the shortlisted beat have no Figma frame; this spec is their source (M6.33). The draft's visible "Shortlist" label isn't in the bar: at 375 points it would leave the players under 100 points. The word is in the shortlist's screen-reader label and the beat's announcement.

## Solo

M6.44. The same screen in a solo room (mode `solo`, one seat): S3 Solo swipe, S4 Checkpoint, S5 Pick sheet and S7 Cap card on the Figma's First release page ([the Figma map](../figma-map.md#first-release-page-993537)). Written on 5 November 2026 (M6.39) from [what solo ends with](../../product/solo-and-my-films.md#3-what-solo-ends-with), [the cap](../../product/solo-and-my-films.md#8-the-cap), [the checkpoint](../moments.md#the-checkpoint) and [the solo pick](../moments.md#the-solo-pick). Everything above holds unless this section says otherwise. The phone knows it's solo from the room's `mode` (`solo`).

### What solo leaves out

No player pills, no shortlist, no near miss, no shortlisted beat, no match overlay, no host menu, no rewatch chip (solo rooms use `hide_seen`, so Seen it throws the card up), and no presence track (nobody else reads it). The super like's badge isn't shown (`SwipeAction` without `left`) and never runs out (Q40.4). First-game hints show as in a group game, on a phone that hasn't seen them. The age cap's rules hold as in any room: in a solo room capped under 13 there is no Trailer button and no PostHog event (the `privacy-and-kids` skill).

### The solo top bar

`screens/swipe/top-bar.tsx` in its solo form, 56 high, `px-5`, a row `items-center gap-3`:

- **Leave:** `IconButton` filled, icon `x`, label `solo:a11y.leave`. **No alert:** every like is already saved. The phone goes to Play at once (`useExitRoomToHome`); in the background the queue sends this room's waiting votes, then `api.leave_room` (the room ends `done`). Offline: Play at once; the votes and the leave wait in the queue and go when the phone is back. M6.44 makes the queue send a solo room's votes on the next launch too, since a solo room is never reopened. The edge swipe and Android's back do the same as Leave (the room layout's `RoomLeaveGuard` asks nothing in a solo room).
- **The label:** `Tag` neutral, icon `user`, `solo:topBar.label`.
- **The likes count**, last, `ml-auto`: a row `gap-1.5` of `Icon` `heart` 20 filled `like-default` and the number in `mono-data` tone `primary` (`Intl`, `maxFontSizeMultiplier` 1.2). It counts this session's likes and super likes from the phone's own answers (the queue included), and goes down on an undo. It changes in place with no animation, and it opens nothing (a `View`, not a `Pressable`).

### The checkpoint card

`CheckpointCard` in `screens/swipe/status-cards.tsx`, from [the checkpoint](../moments.md#the-checkpoint). After the 20th answered card of the session, then every 20 more (after undos; each multiple once per session, Q44.1). It is a card in the phone's stack, placed behind the 20th card, so it never waits on the network.

**Layout.** The card's frame and size (`bg-bg-surface`, `rounded-xl`, `border border-marquee-strong`), a `ScrollView` centred when it fits, `p-6`, `gap-4`, centred:

1. **The fan:** up to 5 `PosterThumb` (72 by 108) of this session's likes, super likes first, then newest. They overlap by 32 points (`-ml-8`); each turns by `rotation.poster-fan` times its distance from the middle (minus 16, minus 8, 0, 8 and 16 degrees for five), the middle one on top. Hidden from screen readers.
2. **The count:** the number of likes in `display-xl`, tone `marquee`. Hidden from screen readers (the line says it).
3. **The line:** `solo:checkpoint.liked_one` or `liked_other` in `title-m`, tone `primary`, centred.
4. **The buttons**, `self-stretch gap-3`: `Button` marquee L, `block`, icon `ticket`, `solo:checkpoint.pick`, opening [the pick sheet](#the-pick-sheet); `Button` secondary L, `block`, `solo:checkpoint.continue`.

**No like yet:** no fan and no count; `Icon` `popcorn` 32 `text-muted`, the line `solo:checkpoint.none`, and `Button` secondary L `solo:checkpoint.continue` only.

**Answering it.** Keep going, or a drag past the commit line in any direction, throws it like a card: no stamp, the `commit` tick and `haptics.throw()` as usual. A tap does nothing (it has no back). While it's on top, Nope, Super, Like and Seen it are disabled; Undo is not (it takes the checkpoint away and brings the 20th card back). Pick one leaves it in place under the sheet.

Measured at 375 by 667 (a card about 324 by 487): the fan, the count, a two-line line and both buttons fit without scrolling.

### The pick sheet

`/room/[id]/pick`, a `formSheet` over the swipe screen (M6.44 adds `pick` to the solo `swiping` row of `SHEETS`), `screens/solo/pick-sheet.tsx`. S5 on the Figma.

- **Header**, `px-5 pt-5`, a row: the title `solo:pickSheet.title` in `display-s` (role `header`), and `IconButton` plain `x` (`common:actions.close`) on the right. Under it, `solo:pickSheet.helper` in `body-s` muted.
- **The grid:** this session's likes as [`FilmTile`](my-films.md#new-components) in 3 columns, `px-5`, gap 8, super likes first (each with its star), then newest first. No "Picked" badge here. It scrolls; there is no paging (a session holds at most the day's cap). The list is the phone's own answers, the same one the checkpoint counts; posters come from the cards the phone held this session, else one `api.title_cards` read (a cold start reads the likes from `api.my_votes`).
- **Tapping a tile** is tonight's pick: [the solo pick](../moments.md#the-solo-pick) beat starts (the tile lifts) and `api.solo_pick(room, title)` goes after any votes still in the queue.

| Answer or state | What the player sees |
| --- | --- |
| `ok` `{title_id}` | The beat: the sheet slides down, the poster flies to [the solo pick](winner.md#the-solo-pick). The room is `done` with the pick |
| `not_liked` (the like was undone in a race) | The tile leaves the grid (`layout.fadeOut`); `showToast` warn `solo:pickSheet.notLiked` |
| `closed` `{state}` (the sweeper ended the session) | Play, with `showToast` info `solo:ended.title` and `solo:ended.body` |
| The call failed, or `rate_limited` | The tile settles back; `showToast` warn `solo:pickSheet.error`; `haptics.error()` |
| Offline | `Banner` warn `solo:pickSheet.offline` under the helper; tiles at `opacity-disabled` and not pressable |
| One like | One tile, at the left |
| Many likes | The grid scrolls; the header stays |
| A missing poster or a long title | The tile's placeholder: the title on 3 lines, then an ellipsis, and the year |

Closing the sheet (the cross, a swipe down) goes back to the checkpoint, the out of films card or the cap card, whichever opened it.

### Out of films

`request_cards` answers `done` `{liked}` in a solo room before the cap (Q39.1): `OutOfFilmsCard` in `status-cards.tsx`, in place of the group [done card](#the-done-card-nothing-left). The checkpoint's frame and layout: the title `solo:outOfFilms.title` in `display-s`, then the fan and the line `solo:checkpoint.liked_*` when there is at least one like, then `Button` marquee L `solo:checkpoint.pick` (only with a like) and `Button` secondary L `solo:actions.myFilms`. With no like: `solo:outOfFilms.body` under the title, and My films only. My films leaves the room as Leave does and opens the My films tab. No haptic; `layout.fadeIn`.

### The cap card

`request_cards` answers `daily_limit` in a solo room (M6.42, Q42.3: 5 or fewer cards left and the cap reached). The phone stores today's Paris date (for [setup](solo-setup.md#at-the-cap)) and keeps swiping its last cards; after the last one, `CapCard` in `status-cards.tsx`, S7 on the Figma. The same frame: `Icon` `ticket` 32 `text-muted`, `solo:cap.title` in `display-s`, `solo:cap.body` in `body-m` secondary, the line `solo:checkpoint.liked_*` when there is a like, then `Button` marquee L `solo:checkpoint.pick` (only with a like), `Button` secondary L `solo:actions.myFilms` and `Button` secondary L `solo:actions.host` (leaves the room, then [host setup](host-setup.md)). It never shows mid-gesture: the deal stops at the cap, so the card comes when the held cards run out. When the 100th card is also a checkpoint, the cap card shows instead. No countdown, no "3 left", no Pro mention. No haptic; `layout.fadeIn`.

### Solo states and answers

| State or answer | What the player sees |
| --- | --- |
| `dealing` (from `start_solo`) | The loading card; after 8 seconds the phone calls `api.start_game(room_id)` once ([lobby](lobby.md#starting)) |
| `cast_vote` `ok`, `duplicate` | Nothing (`match` never comes in solo) |
| `cast_vote` `closed` | The queued votes are dropped; the room is re-read (it ended: Play and `solo:ended.*`) |
| `request_cards` `done` `{liked}` | [Out of films](#out-of-films) once the stack is empty |
| `request_cards` `daily_limit` | [The cap card](#the-cap-card) once the stack is empty |
| `state_changed` `done` with a pick | [The solo pick](winner.md#the-solo-pick) |
| `state_changed` `done` without a pick, not from this phone's Leave (the sweeper, 30 minutes without a vote, or a Start on another screen) | Play, with `showToast` info `solo:ended.title` and `solo:ended.body` (Q39.2) |
| Offline, cards left | Swiping carries on; `RoomBanner`'s offline note as in a group game |
| The largest text | The status cards scroll inside their frame; the top bar's count is capped at 1.2 |

### Solo copy (`solo` namespace)

| Key | French | English |
| --- | --- | --- |
| `topBar.label` | Solo | Solo |
| `a11y.leave` | Arrêter de jouer seul | Stop playing alone |
| `a11y.likes_one` | {{count}} film aimé | {{count}} film liked |
| `a11y.likes_other` | {{count}} films aimés | {{count}} films liked |
| `checkpoint.liked_one` | Tu as aimé 1 film. Il est dans Mes films. | You liked 1 film. It's in My films. |
| `checkpoint.liked_other` | Tu as aimé {{count}} films. Ils sont dans Mes films. | You liked {{count}} films. They're in My films. |
| `checkpoint.none` | Rien pour l'instant. On continue ? | Nothing yet. Keep going? |
| `checkpoint.pick` | Choisir | Pick one |
| `checkpoint.continue` | Continuer | Keep going |
| `pickSheet.title` | Lequel ce soir ? | Which one tonight? |
| `pickSheet.helper` | Touche un film pour le choisir. | Tap a film to pick it. |
| `pickSheet.offline` | Tu es hors ligne. Reconnecte-toi pour choisir. | You're offline. Connect to pick. |
| `pickSheet.notLiked` | Ce film n'est plus dans tes j'aime. | That film isn't in your likes any more. |
| `pickSheet.error` | Impossible de choisir ce film. Réessaie. | We couldn't pick that film. Try again. |
| `pickSheet.a11yHint` | Le choisir pour ce soir | Pick it for tonight |
| `outOfFilms.title` | Tu as vu tous les films de ces filtres. | That's every film for these filters. |
| `outOfFilms.body` | La prochaine fois, ajoute une plateforme ou relâche un filtre. | Next time, add a service or loosen a filter. |
| `cap.title` | C'est tout pour le solo aujourd'hui. | That's today's solo deck. |
| `cap.body` | Nouvelles cartes demain. | New cards tomorrow. |
| `actions.myFilms` | Mes films | My films |
| `actions.host` | Organiser une soirée | Host a movie night |
| `ended.title` | Ta partie solo est terminée. | Your solo session ended. |
| `ended.body` | Tes j'aime sont dans Mes films. | Your likes are in My films. |

French counts 0 and 1 as singular; the zero case has its own line (`checkpoint.none`) and the likes count reads "0 film aimé". Every count goes through `Intl`.

### Solo motion, haptics, sound

- The checkpoint: [its beat](../moments.md#the-checkpoint) (the fan with `spring.snappy`, `haptics.checkpoint()` once when it's on top, new in `lib/haptics`).
- The pick: [the solo pick](../moments.md#the-solo-pick) (`haptics.match()` and the solo pick's sound on landing, [sounds.md](../sounds.md#the-solo-pick)).
- Out of films and the cap card: `layout.fadeIn`, no haptic, no sound.
- Swipes, flips and undo as in a group game. No other sound.

### Solo accessibility

- Top bar order: Leave (`solo:a11y.leave`), the label, the count as one element (`solo:a11y.likes_*`), then the card and the buttons row.
- When a status card replaces the top card, focus moves to its line or title (the checkpoint's line, the out of films title, the cap title); then its buttons in order.
- The pick sheet: focus on its title when it opens; then the helper, the tiles row by row (each `FilmTile`'s label, with the hint `solo:pickSheet.a11yHint`), then Close.
- Reduce Motion: the fan starts fanned; the pick has no flight (the sheet closes, the winner fades in).

### Solo, never shown

Nopes or their count, a streak, "you're on a roll", a timer, cards left today, a target, a nudge to keep swiping, or anything about Pro. Nothing in a solo room reaches another phone.

## Questions

Harry accepted every default of slices 10 and 11's plan and of the moments' questions on 4 November 2026; this spec follows them (Q9.3, Q9.4, Q9.5, Q10.1, Q12.1, Q13.1, Q13.2, Q18.1, Q18.2, Q27.1, Q27.2). New choices the spec makes, each with a default:

1. **Hints that overlap.** The card 2 and card 3 hints both run "until card 10". Default: one hint at a time; a later one replaces the one showing, which then counts as shown.
2. **The super likes hint's end.** Onboarding says "Dismissed". Default: a tap on it, or 3 answers later, so it never sits there all game.
3. **The loading card's slow line.** Default: after 10 seconds, "Still dealing the cards." and Try again.
4. **Lock mid-game.** Default: the lock stays in the lobby; the swipe screen's host menu is the seat sheet only.

New choices for the shortlist (M6.33), each with a default; none needs an answer unless Harry objects:

5. **Can you tap the shortlist?** Default: no. The beat showed each film full size, and the Final Cut shows them all. If players ask "what was the second one?" in the playtest (M6.20), a sheet with the shortlisted films can come later.
6. **The count while empty.** Default: "0/3" in muted from the first card, so the bar never shifts and the rule can be seen from the start. It counts what the room has, never what it still needs.
7. **Undo after a match.** Default: disabled while the last card answered is on the shortlist; a `locked` answer takes the card away again with no message.

New choices from design pass (b) (M6.60), each with a default:

8. **The host's name in the bar (decision M4.15).** The stack shows the host by a crown, and names them in its label and in the players sheet, no longer as visible text in the bar. M4.15's purpose (a late joiner sees whose room it is) is met by the join sheet's host line before Join. Default: accept, and the decision row gets a follow-up line when Harry agrees.
9. **The bookmark's place.** A (a sixth button in the row), B (a long press on the card) or C (a button low on the card's right edge). Default: C. B may come later as a shortcut if the playtest asks.
10. **Your own disc.** Default: in seat order like everyone else's, never hidden behind "+N", with no "You" mark in the bar (the sheet says it).
11. **Counts in the bar.** The pills showed each count; the stack shows only Done and away, and the counts move to the players sheet. Default: accept; a count on each disc would be unreadable at 28 points.

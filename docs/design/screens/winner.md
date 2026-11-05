# Winner

Screen 16 Winner (`99:4232`) on the Figma's First release page. Route `/room/[id]/winner`, under the room layout (`/room/[id]/_layout.tsx`), shown while the room is `done`. Built in M6.16; [the solo pick](#the-solo-pick) is M6.44. Written on 4 November 2026 from [the winner](../moments.md#the-winner) (the beat, its arrivals and what it never shows), [after the pick](../../product/game-modes.md#after-the-pick), [the watch link](../../integrations/tmdb.md#the-watch-link) and its [attribution rule](../../integrations/tmdb.md#terms-licence-and-attribution), [the match](match.md) (the hand-over) and slices 12 and 13's plan. Harry took every default on 4 November 2026 (Q4.4, Q4.5, Q15.4, Q16.1 to Q16.4, Q17.2; [decisions.md](../../decisions.md)), and the spec's own three the same day ([Decided](#decided)). The pieces after the pick were added on 5 November 2026 (M6.47): [Share recap](#share-recap) (M6.21, the sheet and the card are in [recap](recap.md)), [the runners-up](#the-runners-up) (M6.32), [Play again](#play-again) and [the Join offer](#the-join-offer) (M6.23), from the slice plan's defaults (Q47.1 to Q47.4, Q48.1, Q21.2, Q23.1 to Q23.3).

## Purpose

The calm after the celebration. Every phone shows the same film and answers the last question on the couch, "where do we put it on?", then lets everyone look up at the TV. The pick belongs to the group: no names, no avatars, no counts. Below it, under their own heading, the runners-up are the plan B for a film that won't play; only there may Party mode name who liked a film. For the host, Play again opens the next game; every other phone gets a Join offer.

## Which film

- **The pick** is the `api.room_matches` row with `pick_order` 1, whatever its `kind` (`unanimous`, `majority` or `finale`). Every kind shows the same screen.
- **A `done` room with no such row is no pick:** the screen's body is the `NoPick` slot (`components/screens/winner/no-pick.tsx`), which M6.16 creates rendering nothing and M6.17 fills with [Nothing fits tonight](#nothing-fits-tonight) (Q17.2). The footer's Home button stays, so the slot is never a dead end.
- **The film's card** comes from `useMatchCard(roomId, titleId, language)`: the stack's held card, else one `api.title_cards` read. M6.16 makes the hook also return the read's error and a `retry`, for [the error state](#states).
- **The single-film pick** (Q4.4) is a `finale` pick made with no vote. The phone knows it from the `match` event's `reason: 'only_film'` (M6.4 adds the field), or on a cold start from a `finale` pick with no row for the room in `api.rounds`.

## Layout

`Screen` with `scroll` and `footer`, on `bg-bg-canvas`. No `TopBar`, no `RoomBanner` (the room is over; only the card read can wait on the network, and it has its own state). The body is centred, `px-5`, `pt-3`, `gap-3`, from the top:

1. **The spotlight:** `Spotlight` `tone="marquee"`, in a square as wide as the screen at the top of the body (`absolute inset-x-0 top-0 aspect-square`), behind everything. Still.
2. **The bulbs:** `MarqueeBulbs`, `count` 13, lit and still (`chasing` false).
3. **The eyebrow:** `winner:eyebrow` in `mono-eyebrow`, tone `marquee`. Hidden from screen readers (the title reads it).
4. **The poster:** a fixed frame `w-36 h-54` (144 by 216), `rounded-sm`, `overflow-hidden`, `bg-bg-raised`, `glow-marquee`, holding `Poster` with the card's `poster_placeholder` as its thumbhash. The URL is built as the match overlay builds it (`posterUrl` with the screen's width), so the image the overlay loaded comes from the cache. The frame never changes size, so nothing below it jumps.
5. **The single-film line** (single-film pick only): `winner:onlyFilm` in `body-m`, tone `secondary`, centred, just above the title.
6. **The title:** the film's title in `display-l`, tone `primary`, centred, at most 3 lines, then cut with an ellipsis (the full title stays in its label).
7. **The meta:** `matchMeta` (`features/match/format.ts`: the year and runtime, as on the overlay) in `mono-data`, tone `secondary`. Left out when empty.
8. **Where to watch** (`WhereToWatch`, `components/shared/where-to-watch.tsx`: it moved from `screens/winner/` in M6.45), centred, `gap-2`, `pt-2`:
   - `winner:whereToWatch` in `mono-eyebrow`, tone `secondary`.
   - **The logos:** one tile per `provider_id` in the card's `providers`, whatever its offer kinds (Q16.3), in the card's order, in a centred `flex-row flex-wrap gap-2`. A tile: `min-h-11`, `px-3`, `gap-2`, `rounded-md`, `bg-bg-raised`, `border border-border-default`, a row of the logo (`expo-image`, `size-6 rounded-xs`, from `tmdb_image_base` at `w92`, the size the card back uses) and the service's name in `title-m`, one line. A provider with no `logo_path` shows its name only. Tiles are not pressable: no link into a service's app (decision row 35).
   - **No service:** when `providers` is empty, `winner:notListed` in `body-m`, tone `secondary`, in place of the logos (Q16.2).
   - **The credit:** `winner:justwatch` in `body-s`, tone `muted`. Always shown with this block, with or without logos (the "not listed" line is JustWatch's data too).
   - **More details:** `Button` `ghost` S, icon `external-link`, `winner:moreDetails`. It opens `watch_link` with `WebBrowser.openBrowserAsync` (`expo-web-browser`), an in-app browser. Hidden when `watch_link` is null (Q16.1).
9. **Share recap** (M6.21, a pick only, never solo): [below](#share-recap).
10. **The runners-up** (M6.32, a pick only, never solo): [below](#the-runners-up). Hidden until the read answers with at least one film.
11. **The footer**, pinned, `gap-2`, from the top:
    - **The Join offer** (M6.23), on any phone once the room has an open next room: [below](#the-join-offer).
    - **Play again** (M6.23), for the host only and only while there is no open next room: `Button` `primary` L, `block`, icon `refresh`, `playAgain:playAgain`. [Below](#play-again).
    - **Home:** `Button` `secondary`, `block`, `winner:home`: size L when it is the only button, S under Play again or the Join offer (Q47.1, so the host's footer stays short on a small phone). It releases the room guards (`releaseRoomGuards`) and goes Home (the Play tab, `/play`) through `useExitRoomToHome` (Q16.4). The edge swipe and Android's back do the same, with no leave alert ([Decided](#decided) 1).

Measured at 375 by 667 (the smallest iPhone): with Home alone, a one-line title and the whole block fit above the footer. With the host's footer (Play again and Home S, about 116 points with its padding) or the Join offer (about 190), the body scrolls: the poster, the title and the logos show first, and Share recap and the runners-up are a short scroll down. The footer is always pinned. The poster keeps its 144 by 216 frame, since the match overlay hands its poster over at that size.

**Components:** `Screen`, `Spotlight`, `MarqueeBulbs`, `Text`, `Poster`, `PosterThumb`, `Avatar`, `Pressable`, `Button`, `Skeleton`, `Icon`, `MovieCard`, `WhereToWatch` (`shared/`, since M6.45), `showToast`. Screen pieces in `components/screens/winner/`: `WinnerScreen` (`winner-screen.tsx`), `NoPick` (`no-pick.tsx`), and one file per later task, each mounted by one line in `winner-screen.tsx` (decisions.md, Q0.3): `ShareRecap` (`share-recap.tsx`, M6.21), `RunnersUp` (`runners-up.tsx`, M6.32), `PlayAgain` (`play-again.tsx`) and `JoinOffer` (`join-offer.tsx`, M6.23). The runner-up sheet is a route ([below](#the-runner-up-sheet)). No new `ui/` or `shared/` component: `ResultRow` is not used (see [Differences from the Figma](#differences-from-the-figma)).

## How it arrives

From [the winner](../moments.md#how-it-arrives). Tokens from `@/theme/motion`.

| From | What the screen does |
| --- | --- |
| The match overlay | Mounted under the overlay with no animation (match.md, "The hand-over"); the overlay fades out (`layout.fadeOut`) and the poster is already there, still. Nothing animates in |
| The Final Cut (until M6.31, Q15.4) | The whole screen fades in (`layout.fadeIn`, `duration.base`) as "Counting the votes" goes. Here the players learn the winner, so focus goes to the title |
| The Final Cut's reveal (from M6.31) | The layout replaces the Final Cut screen without a navigation animation, and the whole screen fades in (`layout.fadeIn`) with the same poster, still ([final-cut.md](final-cut.md#the-reveal)). Nothing else animates in; focus goes to the title |
| The single-film pick (Q4.4, Q4.5) | No overlay, no vote. The swipe stack stops taking input as for a match (a drag springs back, `spring.card`), then the screen fades in (`layout.fadeIn`) |
| A cold start or a return to a `done` room | Straight to the screen, no transition, once the overlay rule has played or skipped (`match-shown`) |

The fade plays only when the room turned `done` while this phone was on the swipe or Final Cut screen and no overlay is showing.

## States

| State | What shows |
| --- | --- |
| The card is on the phone (after the overlay, usually) | Everything at once |
| The pick row or the card is still loading | The poster frame with its thumbhash (or plain `bg-bg-raised` before the card), a `Skeleton` one title line high and one meta line high, no Where to watch block. The footer is there. When the card arrives, the title, meta and block fade in (`layout.fadeIn`); the poster frame doesn't move |
| The poster is missing (`poster_path` null) | The frame stays `bg-bg-raised` with `Icon` `film`, size 32, `text-muted`, centred. The rest as usual |
| A logo is missing (`logo_path` null) | That tile shows the name only |
| No service lists it any more (`providers` empty) | `winner:notListed`, the credit, and More details if there is a link |
| No watch link | No More details. The logos and the credit as usual |
| Neither services nor a link | `winner:notListed` and the credit only |
| The single-film pick | `winner:onlyFilm` above the title |
| A long title | Wraps to 3 lines, then an ellipsis |
| The card read fails (`rate_limited`, `too_many`, an `ok` with no card, or a network error) | The poster frame stays; in place of the title, `winner:error.title` in `body-m` tone `secondary` and `Button` `secondary` S `common:actions.retry`, inline, never `ErrorScreen` ([Decided](#decided) 2). The Home footer stays |
| Offline before the card came | `winner:error.offline` instead of the error line, same retry; the read also retries by itself when the phone is back online |
| `done` with no `pick_order` 1 row | [Nothing fits tonight](#nothing-fits-tonight) in the `NoPick` slot, the Home footer kept; no poster |
| A player leaves with Home | Nothing reaches the other phones; their screen doesn't change |
| The host's phone | Play again above Home S, while the room has no open next room |
| The room has an open next room | The Join offer above Home S on every phone, the host's included; Play again hides |
| The runners-up read loading, failing or offline | No runners-up section; the rest of the screen is unaffected ([its states](#the-runners-up)) |
| A solo room | No Share recap, runners-up, Play again or Join offer ([the solo pick](#the-solo-pick)) |

There is no timer and no automatic exit: the screen stays until the player leaves.

## Nothing fits tonight

The `NoPick` slot (`components/screens/winner/no-pick.tsx`), filled by M6.17 (Q17.2). No Figma frame. It is the third ending without a film, next to [the closed room](closed.md) and the swipe screen's [done card](swipe.md#the-done-card-nothing-left); closed.md lists all three.

**When.** The room is `done` and `api.room_matches` has no `pick_order` 1 row (`state_changed {state: 'done', outcome: 'no_pick'}`). That happens when everyone ran out of cards and no film has a like, after the host's 5 minutes; when the card count or time limit is reached with nothing liked (M6.4, Q4.1); or when the finale has no film to show ([how a game ends](../../product/game-modes.md#how-a-game-ends)). In every case nothing was liked, so the copy can say so without pointing at anyone.

**Layout.** The slot fills the body above the winner screen's footer: one `EmptyState`, centred vertically (`flex-1 justify-center`), icon `film`, title `ending:noPick.title`, body `ending:noPick.body`, no action (the footer's Home is the way out, `winner:home`, as for a pick). No `Spotlight`, no `MarqueeBulbs`, no eyebrow: the lights are for a pick. No Share recap and no runners-up (there is no pick to share and nothing was liked). The footer is the same as for a pick: [Play again](#play-again) above Home for the host, [the Join offer](#the-join-offer) once there is a next room ("change the filters or play again", [how a game ends](../../product/game-modes.md#how-a-game-ends)). No Change filters (M18.6).

**States.**

| State | What shows |
| --- | --- |
| The matches read is still loading | The winner screen's loading state (the poster frame and skeletons); when the read says no pick, the slot replaces it with `layout.fadeIn` |
| No pick | The empty state and Home |
| Offline before the matches read | The winner screen's offline line and retry (`winner:error.offline`); the read retries when the phone is back |
| The largest text | The body scrolls, Home stays pinned; `display-s` is capped at 1.25 |
| 375 by 667 | The icon, a two-line title and a three-line body fit with room to spare |
| A player taps Home | Nothing reaches the other phones |

**Motion, haptics, sound.** Arriving from the swipe or Final Cut screen, the whole winner screen fades in (`layout.fadeIn`, `duration.base`), as in [How it arrives](#how-it-arrives); a cold start or a return shows it with no transition. Nothing else moves. No haptic and no sound: nothing to celebrate, and it isn't a refusal. Reduce Motion: the fade stays.

**Accessibility.** On arrival, focus goes to the title (`EmptyState` `autoFocus`, role `header`). Order: the title, the body, then the footer as for a pick (the Join offer, Play again, Home `winner:a11y.home`). The edge swipe and Android's back go Home, as for a pick ([Decided](#decided) 1).

**Never shown.** Who noped what, or how many likes any film got (there were none). No player names or avatars (the Join offer's host name aside), no film titles or posters, no blame ("you were too picky"), no countdown, no "play again now": Play again is a plain button for the host, never a prompt.

**Copy** (`ending` namespace; closed.md lists the rest):

| Key | French | English |
| --- | --- | --- |
| `noPick.title` | Rien à l'affiche ce soir | Nothing fits tonight |
| `noPick.body` | Aucun film n'a trouvé preneur ce soir. La prochaine fois, ajoute des plateformes ou relâche un filtre. | No film got a like tonight. Next time, add services or loosen a filter. |

The French title borrows the marquee ("nothing on the bill tonight") rather than translating "fits". Harry decided it on 4 November 2026 ([closed.md, Decided](closed.md#decided) 2).

## The solo pick

M6.44. The winner screen in a solo room that ended with a pick (`api.solo_pick`), S6 on the Figma's First release page ([the Figma map](../figma-map.md#first-release-page-993537)). Written on 5 November 2026 (M6.39) from [what solo ends with](../../product/solo-and-my-films.md#3-what-solo-ends-with) and [the solo pick](../moments.md#the-solo-pick). The layout above holds, with these changes (`WinnerScreen` takes a `solo` flag from the room's mode; M6.44 may split a `solo-pick.tsx` beside it if the flag grows):

- **The eyebrow** is `solo:pick.eyebrow`; the title reads `solo:pick.a11yTitle`.
- **No single-film line** (the player chose).
- **Where to watch** lists the player's own services that have the film (the solo room's services are the player's). When none does, `solo:pick.notListed` (it says "tes", not "vos"). The JustWatch credit and More details as above.
- **The footer:** `Button` secondary L, `block`, `solo:pick.done`, to Play through `useExitRoomToHome`. The edge swipe and Android's back do the same.
- **No** recap share, runners-up, Play again or Join offer (out of scope at launch).

**How it arrives.** From the pick sheet: [the solo pick](../moments.md#the-solo-pick) beat, the poster flying into this screen's empty poster frame, then the bulbs and the spotlight fading in, then the title, meta and where to watch. `haptics.match()` on landing, no sound. A cold start or a return to the room: straight to the screen, no beat.

**States.** As the winner screen's table, with the footer's Done in place of Home. A `done` solo room with no pick never shows this screen: the room layout sends the phone to Play ([solo states](swipe.md#solo-states-and-answers)).

**Copy** (`solo` namespace):

| Key | French | English |
| --- | --- | --- |
| `pick.eyebrow` | Ton film du soir | Tonight's pick |
| `pick.a11yTitle` | Ton film du soir : {{title}} | Tonight's pick: {{title}} |
| `pick.notListed` | Aucune de tes plateformes ne le propose plus. | None of your services has it any more. |
| `pick.done` | Terminé | Done |
| `pick.a11yDone` | Retour à Jouer | Back to Play |

**Accessibility.** On arrival focus goes to the title. Order as above, ending with Done (`solo:pick.a11yDone`). Reduce Motion: the whole screen fades in, with no flight.

**Never shown.** How many films were liked, "out of 23", or anything about the nopes.

## Share recap

M6.21. The entry to [the recap sheet](recap.md), on every phone (Q21.6), for a pick only: never on [Nothing fits tonight](#nothing-fits-tonight) and never on [the solo pick](#the-solo-pick).

- **Where:** item 9 of the layout, under More details (or under the credit when there is no watch link), centred, `pt-1`.
- **What:** `Button` `secondary` S, icon `share`, `recap:entry` (label `recap:a11y.entry`). It pushes `/room/[id]/recap`, the sheet. Nothing is read or captured until the sheet is open.
- **States:** shown once the pick's card is on the phone (`view.status` `ready`); not shown while loading, on the card's error state, or offline before the card. The sheet has its own states ([recap](recap.md#states)).
- **Motion:** it arrives with the late card's fade (`layout.fadeIn`), like the rest of the block. `press` haptic only.

## The runners-up

M6.32, on the read M6.48 adds (`api.room_runners_up`). For when the stream turns out to be missing: the other finalists, or after a single match the most liked films ([after the pick](../../product/game-modes.md#after-the-pick)). Q47.4 and Q48.1 (Harry, 5 November 2026): in Party mode each runner-up names only who liked it; Blind shows how many.

**Set apart from the pick.** The beat keeps the pick free of names and counts ([the winner](../moments.md#the-winner)). So the section sits below Share recap, after a hairline (`h-px self-stretch bg-border-default`, `mt-4`), under its own heading, and everything personal stays inside it.

**What the phone reads.** Once the room is `done` with a pick (never on no pick, never solo): `api.room_runners_up(room_id)`, then the cards of its `title_id`s through `api.title_cards` (cards the stack still holds come from it). The list's order is the read's order (seed order for finalists, likes for the most liked); the phone never sorts it.

**Layout** (`components/screens/winner/runners-up.tsx`), `self-stretch gap-3 pt-4`:

1. **The heading:** `winner:runnersUp.finalists` when `source` is `finalists`, `winner:runnersUp.mostLiked` when it is `most_liked`, in `mono-eyebrow`, tone `secondary`, left-aligned (role `header`).
2. **The hint:** `winner:runnersUp.hint` in `body-s`, tone `muted`.
3. **The row:** `flex-row flex-wrap justify-center gap-3`. The read gives at most 3 films (a vote has at most 4 finalists; the most liked are up to 3), so one row fits at 375 points; a fourth would wrap.
4. **A runner-up:** a `Pressable` column, `w-24 items-center gap-1.5`, from the top:
   - `PosterThumb` size `m` (72 by 108), the card's `poster_path` at `w185` and its `poster_placeholder`. A missing poster shows the thumb's `bg-bg-raised` with `Icon` `film`, size 24, `text-muted`.
   - The title in `body-s`, tone `primary`, centred, at most 2 lines, then an ellipsis.
   - **Party** (`reveal` is `party`, `likers` present): the likers' `Avatar`s, size `s`, `overlap` after the first, in the read's order (seat order), at most 3 (the names below list everyone; no "+2", so Party shows no count). Under them, the likers' `display_name`s joined with `formatList` (`features/lobby/names.ts`), in `body-s`, tone `secondary`, centred, at most 2 lines. A liker's color comes from `avatar_key` (`toAvatarColor`). A seat that left is named like any other (Q48.5).
   - **Blind** (no `likers` key): `winner:runnersUp.likes` with `likes` as the count, in `mono-data`, tone `secondary`.
   - **No likes** (`likes` 0 or `likers` empty, possible for a finalist in a Final Cut mode room): nothing under the title. Never "0 likes", never "nobody".
   - The tap opens [the runner-up sheet](#the-runner-up-sheet). `press` haptic.

**States.**

| State | What shows |
| --- | --- |
| The read or its cards are loading | No section. The pick's block doesn't wait for it |
| `ok` with films, cards read | The section fades in (`layout.fadeIn`), usually below the fold |
| `ok` with an empty list (`source` null: no pick, a single-film pick, a solo room) | No section |
| `not_finished` (a race: the screen only shows for `done`) | No section; the read is made again on the next `state_changed` |
| Party, a runner-up with likers | Avatars and names |
| Party, more than 3 likers | The first 3 avatars and every name (2 lines, then an ellipsis; all of them in the label) |
| Blind | The like count only, no avatar, no name |
| A runner-up with no likes | Its poster and title only |
| A card missing from `title_cards` | That runner-up is left out; if none is left, no section |
| A missing poster, a long title | The thumb's film icon; 2 lines, then an ellipsis |
| The read fails (`42501`, `rate_limited`, a network error) | No section and no error copy: the screen is complete without it. The query retries when the phone comes back to the foreground or online |
| Offline | No section; read when the phone is back online |
| The largest text | Titles and names grow and the columns get taller; they keep their 2-line caps, and the body scrolls |

**Never shown here either:** who didn't like a film, "2 of 4", anything about nopes, Seen it or vetoes, the Final Cut's points, a vetoed finalist (the read leaves them out), a super like mark, or a rank number. A missing face can be a nope, a Seen it or a film that player was never dealt, and the screen never says which.

### The runner-up sheet

A tap on a runner-up opens the card back with where to watch (Q47.4). Route `/room/[id]/film/[title]` (`app/room/[id]/film/[title].tsx`), a `formSheet` registered in the room layout like the others: `gestureEnabled: true` (the room stack turns gestures off), `sheetGrabberVisible: true`, `sheetAllowedDetents: [0.9]`.

**Layout**, the [film sheet](film-sheet.md#layout)'s top half with no footer: a `ScrollView`, `px-5 pt-5 pb-8 gap-4`:

1. **The header row:** `IconButton` plain `x` (`common:actions.close`) on the right.
2. **The card's back:** `MovieCard` with `flipped` and `still`, as wide as the sheet minus `px-5`: the poster header, the title, the meta, the TMDB rating, the synopsis and the credits. Left out as on the film sheet: the reason label, a friend's rating, the Trailer button, the service tags.
3. **Where to watch:** `WhereToWatch` with the card's `providers` (the room's services), `winner:notListed` when there are none, the JustWatch credit and More details. More details is not tracked (`winner:watch_page_open` is for the pick only).

No likers, no counts and no "Pick this instead" in the sheet: the group's pick stays the pick.

| State | What shows |
| --- | --- |
| The card is on the phone (always, once the section shows) | Everything at once |
| Opened with no card on the phone (a cold start on the route) | A `Skeleton` the card's size (`rounded-xl`), then the card; on an error, `winner:error.title` with `Button` secondary S `common:actions.retry`; offline, `winner:error.offline` |
| The room isn't `done` or the film isn't one of its runners-up | The route closes (`router.back()`) |

**Motion:** the system sheet's slide; nothing else moves. **Accessibility:** on open, focus goes to the card back's title; order: the card back, Where to watch, More details, Close. The swipe down and Android's back close it.

## Play again

M6.23, on `api.play_again` (M6.22). "Play again, for the host" ([after the pick](../../product/game-modes.md#after-the-pick)): it opens a new room with the same mode and settings, and the host lands in its lobby.

**Who sees it** (Q23.1): the phone whose seat in `api.room_seats` has `role = 'host'` and hasn't left, on the winner route, with or without a pick, while the room's `next_room_code` is null. Never in solo, never on [the closed room](closed.md). Once the room has an open next room, every phone sees [the Join offer](#the-join-offer) instead, the host's too, so a host role passed on in the finished room never leads to a second Play again.

**What it is:** `Button` `primary` L, `block`, icon `refresh`, `playAgain:playAgain` (label `playAgain:a11y.playAgain`), the footer's first button, with Home S under it.

**The tap.** No confirmation (Q23.2: two taps is the goal). The button turns `loading` at once (Pressable's `press` haptic), so a double tap sends one call.

### Answers (`api.play_again`)

| Answer | What the phone does |
| --- | --- |
| `ok` `{room_id, code}` | The kept room becomes `room_id` with its `code`, the old room's guards are released (`releaseRoomGuards`), and `router.replace` goes to `/room/<room_id>/lobby`: the new room's layout takes over. No toast and no extra haptic. The old seat is **not** left: the room is over, and a leave would hand its host role to a guest |
| `not_finished` (a race) | `showToast` warn, `playAgain:errors.notFinished`; `haptics.error()`; the button is back |
| `unknown_mode` | `showToast` warn, `playAgain:errors.unknownMode`; `haptics.error()`; Play again hides for this room |
| `name_required` | Pushes `/name?edit=1`, which comes back here after a save, as [host setup](host-setup.md) does; the host taps Play again again |
| Raises `42501` (no longer the host) | The seats are read again; `showToast` warn, `playAgain:errors.notHost`; `haptics.error()`; Play again hides when the seats say so |
| Offline | No call. `showToast` warn, `playAgain:errors.offline`, no haptic; the button stays as it was |
| The call failed | `showToast` warn, `playAgain:errors.network`; `haptics.error()`; the button is back. A retry is safe: a repeat returns the same open room (Q22.3) |

A Jest test walks `PLAY_AGAIN_ANSWERS` and fails if an answer has no row here.

## The Join offer

M6.23. "Every phone still on the old room's screen gets 'Harry started another game: Join'" ([after the pick](../../product/game-modes.md#after-the-pick)). An inline card in the footer, above Home, not a modal and not a toast (Q47.2): it stays until the player joins or leaves.

**When.** The room's `api.rooms` row has a `next_room_code`. The phone reads the row again on the `next_room` event (Realtime only tells), and the row also carries it on a cold start, a return to the room or a refocus, so a phone that slept through the event still gets the offer (Q22.4). When a re-read finds `next_room_code` null again (the next room ended), the card fades out (`layout.fadeOut`). A second `next_room` with a new code updates the card in place.

**Who started it.** From the event's `host_member_id`, looked up in the seat list (`display_name`, `avatar_key`; seats that left are still listed). When that seat is this phone's own: `playAgain:offer.titleSelf`. No event (a cold start) or no such seat: `playAgain:offer.titleNoName`, with no avatar. The payload carries no name (Q22.7).

**Layout** (`components/screens/winner/join-offer.tsx`): a card, `self-stretch rounded-lg border border-marquee-default bg-bg-surface p-4 gap-3`:

1. A row, `flex-row items-center gap-3`: the host's `Avatar` size `m` (or, with no name, `Icon` `ticket`, size 24, color `marquee-default`, in a `size-10 rounded-pill bg-bg-raised items-center justify-center`), then a column `flex-1 gap-0.5`: the title (`playAgain:offer.title` with the name) in `body-m-strong`, tone `primary`, at most 2 lines; the line `playAgain:offer.body` in `body-s`, tone `secondary`. A refusal replaces this line (below).
2. `Button` `primary` L, `block`, `playAgain:offer.join` (label `playAgain:a11y.join`).

**The tap.** `joinRoom({code: next_room_code, ref: next_room_id, via: 'play_again'})`; the button turns `loading` at once. The kept room's id is read before the call, as [the join sheet](join-sheet.md#leaving-the-old-seat) does.

| Answer | What the card does |
| --- | --- |
| `ok` | The old seat is left once, as the join sheet does (`leaveOldSeat`); the kept room becomes the new one; the guards are released; the phone enters the new room by its state, as a join does (the lobby, or straight into swiping) |
| `starting` | The button stays `loading` and the line reads `join:shuffling`; retries every second for up to 10 seconds (the join sheet's `STARTING_RETRIES`), then the line reads `join:errors.starting` and the button `common:actions.retry` |
| `name_required` | Opens the join sheet for the code (`/join/<code>?r=<room id>`), which asks for the name first |
| `full` | Line `join:errors.full` (`max` is this room's `max_players`, which the next room copies); `haptics.error()`; the button reads Retry |
| `locked` | Line `join:errors.locked`; `haptics.error()`; Retry (the host can unlock) |
| `in_finale` | Line `join:errors.inFinale`; `haptics.error()`; the button hides |
| `closed`, `not_found` | Line `join:errors.closed`; `haptics.error()`; the button hides; the card goes at the next re-read that finds no open next room |
| `removed` | Line `join:errors.removed`; `haptics.error()`; the button hides |
| `rate_limited` | Line `join:errors.rateLimited`; `haptics.error()`; Retry |
| Offline | Line `join:errors.offline`, no haptic, the button `loading`; it joins by itself when the connection comes back, as the join sheet does |
| The call failed | Line `join:errors.network`; `haptics.error()`; Retry |

Refusal lines are `body-s`, tone `secondary`: calm, in the card, never a sheet over the winner. Home stays under the card in every case. When the offer arrives while the recap sheet or a runner-up sheet is open, the card waits under it, with no toast.

**Motion, haptics.** The card enters with `layout.toastIn` when it arrives while the screen is showing (the footer grows and the body's scroll area shrinks; nothing in the body moves). On a cold start or a return, it is there from the first frame. No haptic and no sound when it arrives: a room event, not a shared moment. `press` on Join, `haptics.error()` on a refusal.

**Accessibility.** When the card arrives on a showing screen, its title is announced (`AccessibilityInfo.announceForAccessibility`) without moving focus. The card's row is one element (the title and the line); Join is next, then Home.

## Copy (`winner` namespace)

A new file pair, `i18n/locales/fr/winner.json` and `en/winner.json`, registered in `i18n/resources.ts` and `i18next.d.ts`. Glossary: "tonight's pick" is "le film du soir" (Harry kept it on 4 November 2026), services are "plateformes". Calm: no exclamation marks. `vous` for the room's services, since it speaks to the whole room.

| Key | French | English |
| --- | --- | --- |
| `eyebrow` | Le film du soir | Tonight's pick |
| `onlyFilm` | Le seul film qui a plu | The only film anyone liked |
| `whereToWatch` | Où regarder | Where to watch |
| `notListed` | Aucune de vos plateformes ne le propose plus. | None of your services has it any more. |
| `justwatch` | Disponibilités fournies par JustWatch. | Streaming availability by JustWatch. |
| `moreDetails` | Plus d'infos | More details |
| `home` | Accueil | Home |
| `error.title` | Impossible de charger le film. | Couldn't load the film. |
| `error.offline` | Tu es hors ligne. Le film s'affiche dès ton retour. | You're offline. The film shows when you're back. |
| `a11y.title` | Le film du soir : {{title}} | Tonight's pick: {{title}} |
| `a11y.poster` | Affiche de {{title}} | Poster for {{title}} |
| `a11y.services` | Disponible sur {{names}} | Available on {{names}} |
| `a11y.moreDetails` | Plus d'infos sur TMDB | More details on TMDB |
| `a11y.moreDetailsHint` | S'ouvre dans le navigateur | Opens in a browser |
| `a11y.home` | Retour à l'accueil | Back to Home |
| `a11y.loading` | Chargement du film | Loading the film |
| `runnersUp.finalists` | Les autres finalistes | The other finalists |
| `runnersUp.mostLiked` | Les plus aimés | Most liked |
| `runnersUp.hint` | Plan B, si le film du soir ne passe pas. | Plan B, if tonight's pick won't play. |
| `runnersUp.likes_one` | {{count}} j'aime | {{count}} like |
| `runnersUp.likes_other` | {{count}} j'aime | {{count}} likes |
| `a11y.runnerUp` | {{title}}. {{detail}} | {{title}}. {{detail}} |
| `a11y.likedBy` | Aimé par {{names}} | Liked by {{names}} |
| `a11y.runnerUpHint` | Affiche où le regarder | Shows where to watch it |

The service names are joined with `Intl.ListFormat` (`formatList`). The credit's text matches the invite page's (`web:credits.justwatch`). "PLUS D'INFOS" and "ACCUEIL" fit their buttons at 375 points.

A runner-up's label is `a11y.runnerUp`: `detail` is `a11y.likedBy` with every liker's name (Party), the `runnersUp.likes` line (Blind), or nothing (no likes: the label is the title alone). The French "j'aime" is the Like answer's word (glossary) and doesn't take a plural. The runner-up sheet reuses `winner:whereToWatch`, `notListed`, `justwatch`, `moreDetails` and the `error` lines, and `common:actions.close`.

## Copy (`playAgain` namespace)

A new file pair for M6.23, `i18n/locales/fr/playAgain.json` and `en/playAgain.json` (its own namespace, so it never collides with M6.21 and M6.32). The offer's refusal lines reuse the `join` namespace (`join:errors.*`, `join:shuffling`) and `common:actions.retry`. "Une partie" is one game; the room stays "la salle". `tu` everywhere: each line speaks to one player.

| Key | French | English |
| --- | --- | --- |
| `playAgain` | Rejouer | Play again |
| `a11y.playAgain` | Lancer une autre partie avec les mêmes réglages | Start another game with the same settings |
| `errors.notFinished` | Cette partie n'est pas encore finie. | This game isn't over yet. |
| `errors.unknownMode` | Cette partie ne se relance pas. Organise une nouvelle soirée depuis l'accueil. | This game can't start again. Host a new movie night from Home. |
| `errors.notHost` | Seul l'hôte peut lancer la partie suivante. | Only the host can start the next game. |
| `errors.offline` | Tu es hors ligne. Connecte-toi pour lancer la partie suivante. | You're offline. Connect to start the next game. |
| `errors.network` | Impossible de lancer la partie suivante. Vérifie ta connexion. | We couldn't start the next game. Check your connection. |
| `offer.title` | {{name}} a lancé une autre partie | {{name}} started another game |
| `offer.titleSelf` | Ta prochaine partie est ouverte | Your next game is open |
| `offer.titleNoName` | Une autre partie est ouverte | Another game is open |
| `offer.body` | Mêmes réglages que celle-ci. | Same settings as this one. |
| `offer.join` | Rejoindre | Join |
| `a11y.join` | Rejoindre la nouvelle partie | Join the new game |

`name_required` has no line: it opens the name screen. "REJOUER" and "REJOINDRE" fit `label-button-l` at 375 points. No exclamation marks: the next game is an offer, not a celebration.

## Motion, haptics, sound

- Almost nothing moves (the beat). The arrival fade as in [How it arrives](#how-it-arrives); the late card's fade (`layout.fadeIn`), which Share recap shares; the poster and logo images' own fade over their placeholder (`expo-image`'s `transition`, `duration.fast`, as `Poster` already does). The spotlight and bulbs are still.
- **After the pick:** the runners-up fade in when their read answers (`layout.fadeIn`); the Join offer enters with `layout.toastIn` and leaves with `layout.fadeOut`. Nothing in the pick's block moves for either, and neither has a haptic or a sound.
- **No haptic and no sound** on arrival, from any path: the overlay already fired `haptics.match()` and `playSound('match')`, and the reveal fires `haptics.match()` and `playSound('reveal')` before the hand-over ([final-cut.md](final-cut.md#the-reveal)). Until M6.31 the Final Cut and the single-film pick arrive in silence, on purpose. Buttons keep their `press` haptic; Play again's and Join's refusals use `haptics.error()`.
- No new token.

## Accessibility

- **On arrival, focus goes to the title**, read as `winner:a11y.title` (role `header`). From the Final Cut and the single-film pick, this is the announcement of the winner.
- **Order from the title:** the single-film line, the meta, the poster (`winner:a11y.poster`), "Where to watch" (role `header`), the logos as one element (`winner:a11y.services`, or the "not listed" line), the credit, More details (`winner:a11y.moreDetails`, hint `winner:a11y.moreDetailsHint`, role `link`), Share recap (`recap:a11y.entry`), the runners-up's heading (role `header`), the hint, each runner-up (role `button`, `winner:a11y.runnerUp`, hint `winner:a11y.runnerUpHint`), then the footer: the Join offer's row and Join (`playAgain:a11y.join`), Play again (`playAgain:a11y.playAgain`), Home (`winner:a11y.home`). The bulbs, the spotlight and the eyebrow are hidden from screen readers; a runner-up's avatars are hidden too (its label names them).
- While loading, the skeletons are one element, `winner:a11y.loading`; when the card arrives, focus moves to the title.
- The Join offer is announced when it arrives, without taking focus ([the Join offer](#the-join-offer)).
- Android's back and the iOS edge swipe do what Home does, with no leave alert ([Decided](#decided) 1).
- **Reduce Motion:** the fades stay (opacity only); the Join offer appears with `layout.fadeIn` instead of `toastIn`; nothing else moves.
- **Largest text:** the body scrolls and the footer stays pinned; the title keeps 3 lines at `display-l`'s capped scale; tiles grow taller and wrap to more rows; the credit and the "not listed" line wrap; the Join offer's title wraps to 2 lines and the footer grows with it.

## Never shown

- **On the pick:** who liked, super liked, noped or vetoed the film. No `Avatar`, no `PlayerPill`, no seat name in the pick's block (game-modes.md#what-players-see-party-and-blind: "A match never shows who said yes"). Avatars and names appear only in the runners-up (Party) and in the Join offer (the host who opened the next game).
- The like count or the Final Cut's points for the pick: "7 of 9" on a still screen asks "who were the two?". Blind's like counts appear only on the runners-up.
- **On the runners-up:** who didn't like a film, "2 of 4" or any total, nopes, Seen it, who vetoed what, points, ranks ([the runners-up](#the-runners-up)).
- Any "Open in Netflix" link or deep link into a service (decision row 35).
- Anything that pushes: no timer, no countdown, no "play again now", no streak. Play again is a plain button for the host; the Join offer never expires on screen and never nags.

## Differences from the Figma

- The service tiles are TMDB's logos with the service's name, not the Figma's placeholder tiles (figma-map.md).
- No "Matched in 3 min 42 s · 41 swipes" line: those are the recap's numbers (M6.21, [recap](recap.md)), and the beat keeps counts off this screen. The meta is the film's year and runtime.
- Play again and Share recap are not a pair of buttons under the block: Play again is the host's primary button in the footer, above Home (Q47.1), and Share recap is a secondary S button under where to watch (Q47.3).
- The runners-up are a row of posters (Q47.4), not the Figma's `ResultRow` list: `ResultRow` shows a rank ("02") and "2 of 3 liked", and the first release has neither (finalists keep their seed order, never points, Q48.3; Q48.1 forbids "of 3"). `ResultRow` stays in the gallery, unused here.
- The poster is 144 by 216 instead of 86 by 130, and it stays so with the runners-up: the match overlay hands its poster over at that size, and the body scrolls on a small phone.
- The single-film line is new (Q4.4). The Join offer has no frame.

## Decided

Harry took these defaults on 4 November 2026:

1. **The way back on a done room.** The edge swipe and Android's back do what Home does, with no "Leave the room?" alert: the room is over, so there is nothing to leave. On a `done` room the room layout's leave guard goes Home (`releaseRoomGuards`, then `useExitRoomToHome`) instead of asking.
2. **A failed card read** is an inline Try again on the screen, never `ErrorScreen`, so Home stays reachable.
3. **The French** stays as written: "Le film du soir" for the eyebrow and "Le seul film qui a plu" for the single-film line.

On 5 November 2026 (M6.47), Harry answered Q48.1 and Q21.2, and every other question of the after the pick slice took its default (Q47.1 to Q47.4, Q23.1 to Q23.3, Q22.4, Q22.7; [decisions.md](../../decisions.md)). This spec's own defaults, written under "Defaults taken" in its pull request:

4. **Once a next room is open, the Join offer replaces Play again on every phone**, the host's included, so a host role passed on in the finished room never opens a second next room, and a host back on the old room rejoins their own seat.
5. **Play again doesn't leave the old seat**, unlike opening a room from host setup: a leave would hand the finished room's host role to a guest. Joining from the offer leaves the old seat as any join does.
6. **The runners-up hide while loading and on an error**, with no skeleton and no error copy: they are a plan B under a complete screen. Runner-up likers are named as the read gives them, the phone's own player included, so every phone shows the same names.
7. **A runner-up's tap opens a room sheet** (`/room/[id]/film/[title]`), the film sheet's card back and where to watch with no footer.
8. **Home is S under Play again or the Join offer**, so the host's footer stays short on a 375 by 667 phone.

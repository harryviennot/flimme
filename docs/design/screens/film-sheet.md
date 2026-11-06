# The film sheet

S10 Film sheet on the Figma's First release page ([the Figma map](../figma-map.md#first-release-page-993537)). Route `/my-films/[title]` (`app/(tabs)/my-films/[title].tsx`), a `formSheet` over [My films](my-films.md) at the full detent, covering the tab bar. Built in M6.45 on M6.41's reads and edits. Written on 5 November 2026 (M6.39) from [the film sheet](../../product/solo-and-my-films.md#6-my-films-grouping-and-tiles) and [what Seen records](../../product/solo-and-my-films.md#7-what-seen-records).

**Reworked on 6 November 2026 (M6.59, built by M6.62)** from Harry's feel test on his iPhone: "Mark as seen and Remove from Liked take too much space, when it'd be nice to have it full page." The pinned footer goes; the two edits become quiet controls in the top bar, beside Close; the card's back shows its whole synopsis. Later is now a solo like ([decisions.md](../../decisions.md), 6 Nov 2026), so the sheet's "Remove from Later" and "Save for later" go: a saved film is in Liked, and Remove from Liked covers it.

## Purpose

One film from your list: what it is, where you can watch it on your services, and two edits. Mark it seen (so decks leave it out), or take it out of Liked. The film gets the whole page; the edits stay one tap away without taking room.

## Layout

The sheet is the full detent it already has (`sheetAllowedDetents: [1]`, grabber on). It stays a sheet, not a pushed screen: swiping it down is how a list's detail closes, and the grid stays under it.

1. **The top bar** (`screens/my-films/film-sheet-bar.tsx`, single use), pinned above the scroll: `flex-row items-center gap-2 px-5 pt-3 pb-2`, `bg-bg-canvas`, 56 high at the default text size. Left to right:
   - **Seen:** `Chip` with `myFilms:sheet.seen` ("Vu", "Seen"), `selected` when the film is seen (accent pill with its check), `role="checkbox"`. The word says the state, so it never rests on colour or an icon alone.
   - **Remove:** `IconButton` plain, `trash`, color `text-secondary`, label `myFilms:sheet.remove` ("Remove from Liked"). Only for a film in Liked; a film that is only seen has none (Q39.5).
   - A `flex-1` spacer, then **Close:** `IconButton` plain `x` (`common:actions.close`), where it is today. The destructive icon is kept away from Close by the spacer, never next to it.
2. **`Banner`** warn `myFilms:sheet.offlineActions` under the bar, only offline once the card has come.
3. **The scroll** (Gesture Handler's `ScrollView`, as today: a plain one paints nothing in a form sheet), `px-5 pt-2 gap-4`, bottom padding `max(insets.bottom, 16)`:
   - **The card's back:** `MovieCard` with `flipped` and `still`, as wide as the sheet minus `px-5`. Since M6.62 a still back is not cut to the card's shape: it is at least the card's 345 by 518 shape and grows with its content, and its synopsis shows in full (no cut, no "Read more"). Its header is the swipe card's reworked header (the poster's middle, the front's fade, the TMDB score in the meta line: [swipe](swipe.md#the-card-back-reworked)). **Left out:** the reason label, a friend's Letterboxd rating, the Trailer button, the service logos (the block below says it better), the flip badge.
   - **Where to watch:** `WhereToWatch`, unchanged: the player's saved services that have the film, `myFilms:sheet.notListed` when none does, the JustWatch credit, More details.

**What the sheet reads.** `api.my_film_card(title, language)` (M6.41): `ok {card, seen, liked}`. The `saved` field M6.50 added is no longer read. The tile's row gives the poster, the title and the year at once.

**Components:** `Chip`, `IconButton`, `Banner`, `MovieCard`, `WhereToWatch`, `Skeleton`, `EmptyState`, `showToast`. No new component; `MovieCard`'s `still` changes ([below](#design-system-changes)). No `Button` any more.

## What the controls do

| Action | At once | The call | Answers |
| --- | --- | --- | --- |
| Seen, off to on | The chip turns selected; `haptics.press()` (from `Pressable`); announced `myFilms:sheet.a11ySeen` | `api.set_film_seen(title, true)` | `ok`: nothing. `not_found`: [the not found state](#states). `rate_limited` or a failure: the chip turns back, `showToast` warn `myFilms:sheet.failed` |
| Seen, on to off | The chip turns unselected; announced `myFilms:sheet.a11yNotSeen`. Opened from Seen, the tile leaves Seen when the sheet closes; the film can come back in decks | `api.set_film_seen(title, false)` | As above |
| Remove | The sheet closes; the tile leaves Liked; `showToast` info `myFilms:removed.title` with the action `myFilms:removed.undo`, for 5 seconds | `api.remove_my_film(title)`, sent when the toast closes (Q41.6), or at once if the app goes to the background first | `ok`, `not_found`: nothing. `rate_limited` or a failure: the tile comes back, `showToast` warn `myFilms:removed.failed` |
| Undo (in the toast) | The tile comes back in its place (`layout.fadeIn`); the call is never sent | | |

No confirmation for Remove: the undo toast is the safety net, unchanged. Remove never changes a game's votes, and `seen` stays (Q41.6). A removed film can come back if it's liked again later, a save from the bookmark included.

## States

| State | What the player sees |
| --- | --- |
| Loading the card | The bar shows Close only. A `Skeleton` the card's shape (`rounded-xl`) and two lines for where to watch, one element `myFilms:a11y.loadingFilm` |
| Loaded, in Liked, not seen | The chip unselected, Remove, Close |
| Loaded, in Liked, seen | The chip selected, Remove, Close |
| A film only in Seen | The chip selected, no Remove |
| A write on its way | The chip already shows the new state; a second tap waits for the answer (the chip is disabled until it lands, under a second) |
| A missing poster | The card back's own placeholder |
| A long title | The card back's header follows its own rule (one line, or the body at large text) |
| A long synopsis | Shown whole; the page scrolls |
| No service has it | `myFilms:sheet.notListed`, the credit, More details when there is a link |
| `my_film_card` `not_found` (the film left the list on another screen, a stale grid) | Close only in the bar. `EmptyState` icon `film`, `myFilms:sheet.notFound`, action `common:actions.close`; the grid refetches and the tile goes |
| `my_film_card` `rate_limited`, or the read failed | Close only. `EmptyState` `error`, `myFilms:sheet.error`, action `common:actions.retry` |
| Offline before the card came | Close only. `EmptyState` icon `wifi-off`, `myFilms:sheet.offline`; it loads when the phone is back |
| Offline after it came | The card stays. The banner under the bar; the chip and Remove disabled (`opacity-disabled`) |
| The largest text | The bar stays one row: the chip's label grows to its cap (1.8), the chip keeps `h-9`, and the icons keep 40 points. The card's back puts its title in the body ([swipe](swipe.md#the-card-back-reworked)); the page scrolls |
| 375 by 667 | The bar, then the card's whole header and the start of the synopsis on the first screen; the rest scrolls. "VU" and "SEEN" leave the bar more than 200 points of spacer |

## Copy (`myFilms` namespace)

New key:

| Key | French | English |
| --- | --- | --- |
| `sheet.seen` | Vu | Seen |

Changed value (the helper line goes, so the announcement carries it):

| Key | French | English |
| --- | --- | --- |
| `sheet.a11ySeen` | Marqué comme vu. Il reste hors de tes parties. | Marked as seen. It stays out of your games. |

Kept as they are: `sheet.remove` (Retirer des aimés / Remove from Liked, now the trash's label), `sheet.a11yNotSeen`, `sheet.failed`, `sheet.notFound`, `sheet.error`, `sheet.offline`, `sheet.offlineActions`, `sheet.notListed`, `removed.title`, `removed.undo`, `removed.failed`.

Removed by M6.62 (nothing shows them any more): `sheet.markSeen`, `sheet.notSeen`, `sheet.seenHelper`, `sheet.removeLater`, `sheet.saveLater`, `sheet.a11yRemovedLater`, `sheet.a11ySavedLater`.

The card's own strings stay in `common:card.*`; where to watch keeps `winner:whereToWatch`, `winner:justwatch` and `winner:moreDetails`.

## Motion, haptics, sound

- The sheet opens and closes as the system's form sheet. The card is there when the read lands, with no flip.
- The chip: `haptics.press()`, and its own selected change (`duration.fast`). Remove: `haptics.press()`, then the sheet closes and the toast comes in (`layout.toastIn`, `layout.toastOut`).
- No sound beyond the tap every button has.

## Accessibility

- On open, focus goes to the film's title (role `header`, in the card back), not to the bar.
- Order: the title, the meta (with the score), the synopsis, the credits, "Where to watch" (header), the services as one element, the credit, More details, then the bar: Seen (a checkbox, checked when seen), Remove, Close. The bar comes last so the film is read first; the swipe down and the screen reader's escape gesture also close the sheet.
- Seen announces `a11ySeen` or `a11yNotSeen` politely after a tap; the chip's checked state reads by itself.
- Remove's label says what it does ("Remove from Liked"); after it, focus moves to the toast's Undo, reachable while the toast shows, and the toast stays while it has focus.
- Every control keeps a 44-point target (the chip's `h-9` gets hit slop).
- Reduce Motion: the system sheet's own behaviour; the tile's fade becomes instant.

## Never shown

Who else liked the film, a friend's rating, the reason a deck dealt it, the night or the group it came from, any name. No trailer: outside a room there is no age cap to check, so the sheet never offers one ([privacy and kids](../../architecture/security.md)).

## Design-system changes

| Component | Change | Task |
| --- | --- | --- |
| `MovieCard` (`shared/`) | `still`: no flip badge and no flip-back line | M6.45 |
| `MovieCard` (`shared/`) | `still` also lets the back grow with its content (at least the card's shape) and shows the synopsis whole, with no cut and no "Read more". The runner-up sheet ([winner](winner.md#the-runner-up-sheet)) uses the same still back and gets the whole synopsis too. A gallery state: a still back with a long synopsis | M6.62 |
| `WhereToWatch` | Moves to `shared/where-to-watch` with a gallery entry; takes the "not listed" line as a prop (M6.44 adds the prop for the solo pick) | M6.44, M6.45 |
| `Toast` and `showToast` (`ui/`) | An optional `action` (`{ label, onPress }`), drawn as `Button` ghost S at the right, and an optional `duration`; the toast stays while the screen reader is on it | M6.45 |

No new token.

## What M6.62 changes

- `components/screens/my-films/film-sheet.tsx`: the footer and its three buttons go; the new bar (`film-sheet-bar.tsx`) above the scroll; the banner moves under the bar; Later's code goes.
- `features/my-films`: the sheet stops reading `saved` and calling `api.set_film_saved` (the function stays in the API for now; removing it is a backend task).
- `shared/movie-card.tsx`: `still` grows with its content (shared with M6.61's back rework; whichever lands second rebases).
- `myFilms` locales: the key changes above, in both languages.
- Tests: the chip's checked state follows `seen`; no Remove for a film only in Seen; a failed write turns the chip back; Remove closes the sheet and shows the toast with Undo; offline disables both controls.

## Questions

Defaults taken; none needs an answer unless Harry objects.

1. **Seen as a chip, or an icon?** Default: a `Chip` reading "Vu" / "Seen", checked when seen, because an eye icon alone doesn't say whether it marks or shows the state. Alternative: an overflow menu (`...`) with both edits, which needs a new icon and a menu component for two items.
2. **The helper line** "It stays out of your games." Default: it moves into the announcement after the tap; no toast, so marking stays quiet.
3. **A sheet or a pushed screen?** Default: the full-height sheet it already is (swipe down to close). A pushed screen would need a back button and lose the grid behind it.

## Changes this asks

- **M6.41's brief:** `api.my_film_card` answers `ok {card, seen, liked}`, where `liked` is true when the film has `liked_at` or `picked_at` in one of the caller's rows. Without it the sheet can't tell the chip's state, or offer Remove only on Liked films. Since Later is a solo like, a film saved with the bookmark has `liked_at` and shows Remove.

## Differences from the Figma

- New screen. The card back is 13 Card flipped (`99:4122`) without the reason, the friend's rating, the trailer and the flip hint.
- S10 has the edits as two full-width buttons at the bottom; since 6 November 2026 they are a chip and an icon in the top bar, and the card's back is the reworked one (the Figma predates both).

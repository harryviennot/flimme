# The film sheet

S10 Film sheet on the Figma's First release page ([the Figma map](../figma-map.md#first-release-page-993537)). Route `/my-films/[title]` (`app/(tabs)/my-films/[title].tsx`), a `formSheet` over [My films](my-films.md) at the large detent, covering the tab bar. Built in M6.45 on M6.41's reads and edits. Written on 5 November 2026 (M6.39) from [the film sheet](../../product/solo-and-my-films.md#6-my-films-grouping-and-tiles) and [what Seen records](../../product/solo-and-my-films.md#7-what-seen-records).

## Purpose

One film from your list: what it is, where you can watch it on your services, and two edits. Mark it seen (so decks leave it out), or take it out of Liked.

## Layout

A `ScrollView`, `px-5 pt-5 pb-4 gap-4`, with a pinned footer:

1. **The header row:** `IconButton` plain `x` (`common:actions.close`) on the right. The sheet's own grabber above it.
2. **The card's back:** `MovieCard` with `flipped` and no `onFlip`, as wide as the sheet minus `px-5`, in the card's shape. It shows the poster header, the title, the meta (year and runtime), the TMDB rating, the synopsis and the credits. **Left out:** the reason label (`reason`), a friend's Letterboxd rating (`friendRating`), the Trailer button (`onTrailer`), the service tags (the block below says it better). `MovieCard` gains a `still` prop (M6.45): no flip badge and no "Tap the card to flip back" line, since this back never turns over.
3. **Where to watch:** `WhereToWatch` (it moves from `screens/winner/` to `shared/where-to-watch` in M6.45, with a gallery entry, since a second screen needs it): the player's saved services that have the film, the "not listed" line `solo:pick.notListed` when none does, the JustWatch credit, and More details. Tiles are not pressable.
4. **The footer** (pinned, `px-5 pb-2 gap-3`, `bg-bg-surface` with a `border-t border-border-default` hairline):
   - `Button` secondary L, `block`, icon `eye`: `myFilms:sheet.markSeen`, or `myFilms:sheet.notSeen` on a seen film. Under it, on a seen film only, `myFilms:sheet.seenHelper` in `body-s` muted.
   - `Button` ghost L, `block`, icon `trash`, `myFilms:sheet.remove` ("Remove from Liked" since M6.51, so it is not mistaken for the next button). Only for a film in Liked; a film that is only seen has no Remove (Q39.5).

**What the sheet reads.** `api.my_film_card(title, language)` (M6.41) for the card, scoped to the player's own films (security gap 2). The tile's row gives the poster, the title and the year at once. The sheet also needs to know whether the film is seen and whether it's in Liked: `my_film_card`'s `ok` carries `seen` and `liked`. A film saved with the card's bookmark is a solo like (decided on 6 November 2026), so it is in Liked and Remove takes it out; the sheet has no Later button and `my_film_card` no `saved` flag any more.

**Components:** `Text`, `IconButton`, `MovieCard`, `WhereToWatch`, `Button`, `Skeleton`, `EmptyState`, `Banner`, `showToast`. No new component; `MovieCard` gains `still`, `Toast` gains an action ([below](#design-system-changes)).

## What the buttons do

| Action | At once | The call | Answers |
| --- | --- | --- | --- |
| Mark as seen | The button turns into Not seen, the helper appears; `haptics.press()`; announced `myFilms:sheet.a11ySeen` | `api.set_film_seen(title, true)` | `ok`: nothing. `not_found`: [the not found state](#states). `rate_limited` or a failure: the button turns back, `showToast` warn `myFilms:sheet.failed` |
| Not seen | The button turns into Mark as seen; announced `myFilms:sheet.a11yNotSeen`. Opened from Seen, the tile leaves Seen when the sheet closes; the film can come back in decks | `api.set_film_seen(title, false)` | As above |
| Remove | The sheet closes; the tile leaves Liked; `showToast` info `myFilms:removed.title` with the action `myFilms:removed.undo`, for 5 seconds | `api.remove_my_film(title)`, sent when the toast closes (Q41.6), or at once if the app goes to the background first | `ok`, `not_found`: nothing. `rate_limited` or a failure: the tile comes back, `showToast` warn `myFilms:removed.failed` |
| Undo (in the toast) | The tile comes back in its place (`layout.fadeIn`); the call is never sent | | |

No confirmation for Remove: the undo toast is the safety net. Remove never changes a game's votes, and `seen` stays (Q41.6). A removed film can come back if it's liked again later.

## States

| State | What the player sees |
| --- | --- |
| Loading the card | A `Skeleton` the card's size (`rounded-xl`) and two lines for where to watch, one element `myFilms:a11y.loading`; the footer's buttons disabled |
| Loaded | Everything |
| A seen film | Not seen, and the helper line |
| A film only in Seen | Not seen only, no Remove |
| A missing poster | The card back's own placeholder |
| A long title | The card back's header wraps (its own rule) |
| No service has it | `solo:pick.notListed`, the credit, More details when there is a link |
| `my_film_card` `not_found` (the film left the list on another screen, a stale grid) | `EmptyState` icon `film`, `myFilms:sheet.notFound`, action `common:actions.close`; the grid refetches and the tile goes |
| `my_film_card` `rate_limited`, or the read failed | `EmptyState` `error`, `myFilms:sheet.error`, action `common:actions.retry` |
| Offline before the card came | `EmptyState` icon `wifi-off`, `myFilms:sheet.offline`; it loads when the phone is back |
| Offline after it came | The card stays. `Banner` warn `myFilms:sheet.offlineActions` above the footer; both buttons disabled |
| The largest text | The sheet scrolls; the footer stays pinned and its buttons grow taller |
| 375 by 667 | The card's header, the rating and the start of the synopsis show above the footer; the rest scrolls |

## Copy (`myFilms` namespace)

| Key | French | English |
| --- | --- | --- |
| `sheet.markSeen` | Marquer comme vu | Mark as seen |
| `sheet.notSeen` | Pas encore vu | Not seen |
| `sheet.seenHelper` | Il reste hors de tes parties. | It stays out of your games. |
| `sheet.remove` | Retirer des aimés | Remove from Liked |
| `sheet.a11ySeen` | Marqué comme vu | Marked as seen |
| `sheet.a11yNotSeen` | Plus marqué comme vu. Il peut revenir dans tes parties. | No longer marked as seen. It can come back in your games. |
| `sheet.failed` | Impossible d'enregistrer. Réessaie dans un instant. | We couldn't save that. Try again in a moment. |
| `sheet.notFound` | Ce film n'est plus dans Mes films. | This film isn't in My films any more. |
| `sheet.error` | Impossible de charger le film. | We couldn't load the film. |
| `sheet.offline` | Tu es hors ligne. Le film s'affiche dès ton retour. | You're offline. The film shows when you're back. |
| `sheet.offlineActions` | Tu es hors ligne. Reconnecte-toi pour modifier tes films. | You're offline. Connect to change your films. |
| `removed.title` | Retiré de Mes films | Removed from My films |
| `removed.undo` | Annuler | Undo |
| `removed.failed` | Impossible de retirer ce film. Réessaie. | We couldn't remove that film. Try again. |

"MARQUER COMME VU" fits a block L button at 375 points. The card's own strings stay in `common:card.*`; where to watch keeps `winner:whereToWatch`, `winner:justwatch` and `winner:moreDetails`.

## Motion, haptics, sound

- The sheet opens and closes as the system's form sheet. The card is there when the read lands, with no flip.
- Buttons: `haptics.press()`. The seen button's label changes in place.
- The toast: `layout.toastIn` and `layout.toastOut`, as every toast.
- No sound.

## Accessibility

- On open, focus goes to the film's title (role `header`, in the card back).
- Order: the title, the meta, the rating, the synopsis, the credits, "Where to watch" (header), the services as one element, the credit, More details, Mark as seen (or Not seen, then the helper), Remove, Close.
- The toast's Undo is reachable by the screen reader while the toast shows; the toast stays while it has focus.
- Reduce Motion: the system sheet's own behaviour; the tile's fade becomes instant.

## Never shown

Who else liked the film, a friend's rating, the reason a deck dealt it, the night or the group it came from, any name. No trailer: outside a room there is no age cap to check, so the sheet never offers one ([privacy and kids](../../architecture/security.md)).

## Design-system changes

| Component | Change | Task |
| --- | --- | --- |
| `MovieCard` (`shared/`) | `still`: no flip badge and no flip-back line | M6.45 |
| `WhereToWatch` | Moves to `shared/where-to-watch` with a gallery entry; takes the "not listed" line as a prop (M6.44 adds the prop for the solo pick) | M6.44, M6.45 |
| `Toast` and `showToast` (`ui/`) | An optional `action` (`{ label, onPress }`), drawn as `Button` ghost S at the right, and an optional `duration`; the toast stays while the screen reader is on it | M6.45 |

## Changes this asks

- **M6.41's brief:** `api.my_film_card` answers `ok {card, seen, liked}`, where `liked` is true when the film has `liked_at` or `picked_at` in one of the caller's rows. Without it the sheet can't tell Mark as seen from Not seen, or offer Remove only on Liked films.

## Differences from the Figma

- New screen. The card back is 13 Card flipped (`99:4122`) without the reason, the friend's rating, the trailer and the flip hint.

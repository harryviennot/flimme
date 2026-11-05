# My films

S8 My films and S9 My films, empty on the Figma's First release page ([the Figma map](../figma-map.md#first-release-page-993537)); no frame before them. Route `/my-films`, the second tab of the `(tabs)` group ([the tab bar](tab-bar.md)); the stack in `app/(tabs)/my-films/` holds this grid (`index.tsx`) and [the film sheet](film-sheet.md) (`[title].tsx`). Built in M6.45 on M6.41's reads. Written on 5 November 2026 (M6.39) from [My films: grouping and tiles](../../product/solo-and-my-films.md#6-my-films-grouping-and-tiles), [what Seen records](../../product/solo-and-my-films.md#7-what-seen-records) and [accounts](../../product/solo-and-my-films.md#11-accounts), decided by Harry that day.

## Purpose

The films you liked and the films you've seen, as posters, newest first. Tonight's film may already be in here. Only ever your own: nothing says who else liked a film.

## Layout

`Screen` (no `scroll`: the grid is the scroller), above [the tab bar](tab-bar.md). Top to bottom:

1. **The title:** `myFilms:title` in `display-m`, `px-5 pt-3` (the same top as Play's header row). Role `header`.
2. **The segments:** `SegmentedControl` (new, `ui/`, [below](#new-components)) with `myFilms:segments.liked` and `myFilms:segments.seen`, `mx-5 mt-4`. Liked is the default. The title and the segments stay put while the grid scrolls.
3. **The grid:** a `FlatList` with `numColumns` 3, `px-4`, a gap of 8 between columns and rows (tiles about 109 by 163 points at 375 wide, 2:3), `pb-6`. Its header, which scrolls away with it, `gap-3 pt-4 pb-3`:
   - **The chips** (Liked only): a row of `Chip role="radio"`, `myFilms:filters.all` (default), `myFilms:filters.friends`, `myFilms:filters.solo`, in a `View` with `accessibilityRole="radiogroup"` labelled `myFilms:filters.label`. They wrap at the largest text.
   - **The accounts line:** `myFilms:accounts` in `body-s`, tone `muted`. Under the chips on Liked, under the segments on Seen, so it shows once per segment (Q39.4).
4. **A tile:** `FilmTile` (new, `shared/`, [below](#new-components)): the poster only, `rounded-sm`, its placeholder when there's no poster (the title and the year on it), and at most one badge in the top right corner:
   - **Picked:** `Tag` tone `marquee`, `myFilms:tile.picked`, on a film a group picked while the player sat in the room.
   - **The star:** a 24-point round `bg-bg-sunken` badge with `Icon` `star` 14 filled `marquee-default`, on a super like.
   - "Picked" wins when both apply (Q41.10). Seen tiles have no badge (Q39.3).
   - Tapping a tile opens [the film sheet](film-sheet.md).

**What each grid holds** (`api.my_films(segment, filter, cursor, language)`, pages of 60, Q41.9):

| Segment, chip | Films | Order |
| --- | --- | --- |
| Liked, All | Every film you liked or super liked, alone or in a group, and every group pick you sat for, one tile each (Q41.10) | Newest first, by the latest time |
| Liked, With friends | Likes from group rooms, and group picks you sat for even if you didn't like them | Newest first |
| Liked, Solo | Likes from solo sessions | Newest first |
| Seen | Films you marked seen in the app: Seen it in any game, Mark as seen. Not Letterboxd's (M20) | Newest first, by when you marked it |

**Paging.** The next page loads when the list is within two rows of its end (`onEndReachedThreshold`); a row of three `Skeleton` tiles shows at the end while it does. Each segment and chip keeps its own pages in the query cache, so switching back is instant. The first page refetches when the tab comes back into view, and after any game ends.

**Components:** `Screen`, `Text`, `SegmentedControl` (new), `Chip`, `FilmTile` (new), `Tag`, `Icon`, `Poster`, `Skeleton`, `EmptyState`, `Banner`, `Button`. Screen pieces in `components/screens/my-films/`: `my-films-screen.tsx`, `films-grid.tsx`; data in `features/my-films/`.

## States

| State | What the player sees |
| --- | --- |
| First load | The title, the segments, the chips, the line, then 9 `Skeleton` tiles (three rows, the tile's size and radius), one element for screen readers, `myFilms:a11y.loading` |
| Loaded | The grid |
| Liked, All, empty (a new player) | Under the line, `EmptyState` icon `heart`, `myFilms:empty.title`, body `myFilms:empty.liked`, action `solo:card.cta` (Play alone, to `/solo`). The chips stay, so the other filters can be tried |
| Liked, With friends, empty | `EmptyState` icon `users`, `myFilms:empty.title`, `myFilms:empty.friends`, no action |
| Liked, Solo, empty | `EmptyState` icon `user`, `myFilms:empty.title`, `myFilms:empty.solo`, action `solo:card.cta` |
| Seen, empty | `EmptyState` icon `eye`, `myFilms:empty.title`, `myFilms:empty.seen`, no action |
| Offline with pages already read | Those pages, and a `Banner` warn `myFilms:offlineBanner` above the grid; tiles still open (the sheet has its own offline state) |
| Offline with nothing read | `EmptyState` icon `wifi-off`, `myFilms:offline.title`, `myFilms:offline.body`; it loads by itself when the phone is back |
| The first page fails | `EmptyState` `error`, `myFilms:error.title`, action `common:actions.retry` |
| A later page fails | The skeleton row gives way to `myFilms:error.more` in `body-s` muted and `Button` ghost S `common:actions.retry`, centred under the grid |
| Many films | Infinite scroll; nothing counts them on screen |
| A missing poster | The placeholder: `bg-bg-raised`, the title in `body-m-strong` (3 lines, then an ellipsis) and the year in `mono-data` muted, `p-2`, at the bottom |
| A long title | Only the placeholder shows it (3 lines); the screen reader reads it in full |
| A film removed in the sheet | The tile leaves (`layout.fadeOut`, the others close up with `LinearTransition`); Undo in the toast puts it back in place |
| Not seen in the sheet, from Seen | The tile leaves Seen when the sheet closes |
| The largest text | The title and the segments grow to their caps (1.3); the chips wrap; the line wraps; tiles keep their size; the placeholder's text is capped at 1.2 |
| 375 by 667 | Two full rows of tiles show under the header, above the tab bar |

`api.my_films` answers `ok` with an empty `films` list for an empty grid; it has no rate limit (Q41.8). Opening My films counts as activity for guest cleanup (Q41.7); nothing on screen says so.

## Copy (`myFilms` namespace)

A new file pair, `i18n/locales/fr/myFilms.json` and `en/myFilms.json`, registered by M6.43.

| Key | French | English |
| --- | --- | --- |
| `title` | Mes films | My films |
| `segments.liked` | Aimés | Liked |
| `segments.seen` | Vus | Seen |
| `filters.label` | Afficher | Show |
| `filters.all` | Tous | All |
| `filters.friends` | Entre amis | With friends |
| `filters.solo` | Solo | Solo |
| `accounts` | Enregistré sur ce téléphone pour l'instant. | Saved with this phone for now. |
| `tile.picked` | Choisi | Picked |
| `empty.title` | Rien pour l'instant | Nothing here yet |
| `empty.liked` | Les films que tu aimes arrivent ici. Joue seul ou entre amis. | Films you like land here. Play alone or with friends. |
| `empty.friends` | Les films que tu aimes entre amis arrivent ici. | Films you like with friends land here. |
| `empty.solo` | Les films que tu aimes en jouant seul arrivent ici. | Films you like on your own land here. |
| `empty.seen` | Les films que tu as déjà vus arrivent ici. | Films you've seen land here. |
| `offline.title` | Tu es hors ligne | You're offline |
| `offline.body` | Tes films s'affichent dès ton retour. | Your films show when you're back. |
| `offlineBanner` | Tu es hors ligne. Ta liste n'est peut-être pas à jour. | You're offline. Your list may be out of date. |
| `error.title` | Impossible de charger tes films. | We couldn't load your films. |
| `error.more` | Impossible d'en charger plus. | We couldn't load more. |
| `a11y.tile` | {{title}}, {{year}} | {{title}}, {{year}} |
| `a11y.picked` | choisi en soirée film | picked on a movie night |
| `a11y.superLiked` | coup de cœur | super liked |
| `a11y.tileHint` | Ouvre la fiche du film | Opens the film |
| `a11y.loading` | Chargement de tes films | Loading your films |

The year comes from the row as a number; with no year, the label is the title alone. When M15 lands, `accounts` becomes the save offer ("Keep your films on any device").

## Motion, haptics, sound

- No entrance animation: the grid is there. Posters fade in over their thumbhash (`Poster`'s own `transition`, `duration.fast`).
- `SegmentedControl`: the selected background slides to the other segment (`spring.snappy`) and the grid swaps at once (no cross-fade). Chips change with `timing.toggle`. Both `haptics.press()`.
- A tile scales to 0.96 while pressed (`timing.press`, back with `timing.release`); `haptics.press()`.
- A removed tile: `layout.fadeOut`, the grid closes up with a `LinearTransition` (`duration.base`); an undone remove comes back with `layout.fadeIn`.
- Tapping the My films tab again scrolls to the top (animated).
- No sound.

## Accessibility

- Focus order: the title (header), the segments (a `tablist`, each a `tab` with its selected state), the chips (a radio group), the accounts line, the tiles row by row, then the tab bar.
- A tile is a `button` read as `myFilms:a11y.tile` with the badge after it ("Heat, 1995, picked on a movie night"; "Heat, 1995, super liked"), with the hint `myFilms:a11y.tileHint`. The badge's own text is hidden.
- When the sheet closes, focus goes back to the tile that opened it (or to the next one, if the film left the grid).
- Switching a segment or a chip announces nothing; the grid's first tile is next in focus order.
- Reduce Motion: no slide in the segments (the background jumps), no scale on press, no close-up transition (tiles move at once).

## Never shown

Only ever your own rows (rule 6 and [the decision](../../product/solo-and-my-films.md#6-my-films-grouping-and-tiles)): no count of who else liked a film, no "Sam liked this too", no player names, no nights, no groups, no room codes, no dates of nights. The Picked badge says a group picked the film, never which group or who liked it. No ratings on tiles, no streaks, no totals.

## New components

Both get a gallery entry and a behaviour test (press, selected, disabled).

**`FilmTile` (`shared/film-tile`).** A film's poster as a tile, used here and in [the pick sheet](swipe.md#the-pick-sheet), which is why it's shared. A `width` prop sets its size, the height 1.5 times it (the poster's 2:3 shape, as the swipe card computes its own size); the grid passes `(the window width minus 48) / 3` and the pick sheet `(the sheet width minus 56) / 3`. `rounded-sm`, `overflow-hidden`, `bg-bg-raised`. Props: `width`, `title`, `year`, `poster` and `thumbhash` (as `Poster`), `badge` (`{ kind: 'picked', label } | { kind: 'super' }`, optional), `onPress`, `disabled`, `accessibilityLabel`, `accessibilityHint`. The placeholder (title and year) shows when `poster` is null. Gallery: a poster, no poster with a long title, Picked, the star, disabled, three in a row at 375.

**`SegmentedControl` (`ui/segmented-control`).** Two or three equal segments in one track: `bg-bg-sunken`, `rounded-md`, `p-1`, `border border-border-default`; each segment `min-h-10`, `rounded-sm`, its label in `label-button-s` (tone `secondary`; `primary` when selected). The selected segment sits on a `bg-bg-raised` thumb with `border border-border-strong`, which slides (`spring.snappy`). Props: `segments` (`{ key, label }[]`), `selected`, `onSelect`. `accessibilityRole="tablist"`, each segment a `tab`. Gallery: two segments each selected, three segments, the largest text. Not `Chip`: chips filter a list, segments switch between two lists, and the screen needs both at once.

**No new token.** The sizes come from the window, the gaps and radii from the theme.

## Differences from the Figma

- New screen; the Figma has no grid or list. 18 Profile (`26:1214`) shows a row of five posters with `rounded-sm` corners, the look the tiles keep.

## Decided

Harry, 5 November 2026 ([solo mode and My films](../../product/solo-and-my-films.md#decided), question 6, 7 and 11), and the designer's defaults of M6.39: no badges on Seen tiles (Q39.3); the accounts line once per segment (Q39.4).

# Winner

Screen 16 Winner (`99:4232`) on the Figma's First release page. Route `/room/[id]/winner`, under the room layout (`/room/[id]/_layout.tsx`), shown while the room is `done`. Built in M6.16. Written on 4 November 2026 from [the winner](../moments.md#the-winner) (the beat, its arrivals and what it never shows), [after the pick](../../product/game-modes.md#after-the-pick), [the watch link](../../integrations/tmdb.md#the-watch-link) and its [attribution rule](../../integrations/tmdb.md#terms-licence-and-attribution), [the match](match.md) (the hand-over) and slices 12 and 13's plan. Harry took every default on 4 November 2026 (Q4.4, Q4.5, Q15.4, Q16.1 to Q16.4, Q17.2; [decisions.md](../../decisions.md)).

## Purpose

The calm after the celebration. Every phone shows the same film and answers the last question on the couch, "where do we put it on?", then lets everyone look up at the TV. It belongs to the group: no names, no avatars, no counts.

## Which film

- **The pick** is the `api.room_matches` row with `pick_order` 1, whatever its `kind` (`unanimous`, `majority` or `finale`). Every kind shows the same screen.
- **A `done` room with no such row is no pick:** the screen's body is the `NoPick` slot (`components/screens/winner/no-pick.tsx`), which M6.16 creates rendering nothing and M6.17 fills with "Nothing fits tonight" (Q17.2). The footer's Home button stays, so the slot is never a dead end.
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
8. **Where to watch** (the `WhereToWatch` piece, `components/screens/winner/where-to-watch.tsx`), centred, `gap-2`, `pt-2`:
   - `winner:whereToWatch` in `mono-eyebrow`, tone `secondary`.
   - **The logos:** one tile per `provider_id` in the card's `providers`, whatever its offer kinds (Q16.3), in the card's order, in a centred `flex-row flex-wrap gap-2`. A tile: `min-h-11`, `px-3`, `gap-2`, `rounded-md`, `bg-bg-raised`, `border border-border-default`, a row of the logo (`expo-image`, `size-6 rounded-xs`, from `tmdb_image_base` at `w92`, the size the card back uses) and the service's name in `title-m`, one line. A provider with no `logo_path` shows its name only. Tiles are not pressable: no link into a service's app (decision row 35).
   - **No service:** when `providers` is empty, `winner:notListed` in `body-m`, tone `secondary`, in place of the logos (Q16.2).
   - **The credit:** `winner:justwatch` in `body-s`, tone `muted`. Always shown with this block, with or without logos (the "not listed" line is JustWatch's data too).
   - **More details:** `Button` `ghost` S, icon `external-link`, `winner:moreDetails`. It opens `watch_link` with `WebBrowser.openBrowserAsync` (`expo-web-browser`), an in-app browser. Hidden when `watch_link` is null (Q16.1).
9. **The footer:** `Button` `secondary` L, `block`, `winner:home`. It releases the room guards (`releaseRoomGuards`) and goes Home through `useExitRoomToHome` (Q16.4). Play again (M6.23) takes this place later.

Measured at 375 by 667 (the smallest iPhone), a one-line title and the whole block fit above the footer; a longer title scrolls a little, with Home always pinned.

**Components:** `Screen`, `Spotlight`, `MarqueeBulbs`, `Text`, `Poster`, `Button`, `Skeleton`, `Icon`. Screen pieces in `components/screens/winner/`: `WinnerScreen` (`winner-screen.tsx`), `WhereToWatch` (`where-to-watch.tsx`, the logo tile lives inside it), `NoPick` (`no-pick.tsx`). No new `ui/` or `shared/` component. If a second screen needs the logo tile (the room's list of services, the recap), it moves to `shared/` then.

## How it arrives

From [the winner](../moments.md#how-it-arrives). Tokens from `@/theme/motion`.

| From | What the screen does |
| --- | --- |
| The match overlay | Mounted under the overlay with no animation (match.md, "The hand-over"); the overlay fades out (`layout.fadeOut`) and the poster is already there, still. Nothing animates in |
| The Final Cut (until M6.31, Q15.4) | The whole screen fades in (`layout.fadeIn`, `duration.base`) as "Counting the votes" goes. Here the players learn the winner, so focus goes to the title |
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
| The card read fails (`rate_limited`, `too_many`, an `ok` with no card, or a network error) | The poster frame stays; in place of the title, `winner:error.title` in `body-m` tone `secondary` and `Button` `secondary` S `common:actions.retry` |
| Offline before the card came | `winner:error.offline` instead of the error line, same retry; the read also retries by itself when the phone is back online |
| `done` with no `pick_order` 1 row | The `NoPick` slot as the body, the Home footer kept; no poster |
| A player leaves with Home | Nothing reaches the other phones; their screen doesn't change |

There is no timer and no automatic exit: the screen stays until the player leaves.

## Copy (`winner` namespace)

A new file pair, `i18n/locales/fr/winner.json` and `en/winner.json`, registered in `i18n/resources.ts` and `i18next.d.ts`. Glossary: "tonight's pick" is "le film du soir" (still proposed), services are "plateformes". Calm: no exclamation marks. `vous` for the room's services, since it speaks to the whole room.

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

The service names are joined with `Intl.ListFormat` (`formatList`). The credit's text matches the invite page's (`web:credits.justwatch`). "PLUS D'INFOS" and "ACCUEIL" fit their buttons at 375 points.

## Motion, haptics, sound

- Almost nothing moves (the beat). The arrival fade as in [How it arrives](#how-it-arrives); the late card's fade (`layout.fadeIn`); the poster and logo images' own fade over their placeholder (`expo-image`'s `transition`, `duration.fast`, as `Poster` already does). The spotlight and bulbs are still.
- **No haptic and no sound** on arrival, from any path: the overlay already fired `haptics.match()` and `playSound('match')`, and the reveal (M6.31) will bring its own. Until M6.31 the Final Cut and the single-film pick arrive in silence, on purpose. Buttons keep their `press` haptic.
- No new token.

## Accessibility

- **On arrival, focus goes to the title**, read as `winner:a11y.title` (role `header`). From the Final Cut and the single-film pick, this is the announcement of the winner.
- **Order from the title:** the single-film line, the meta, the poster (`winner:a11y.poster`), "Where to watch" (role `header`), the logos as one element (`winner:a11y.services`, or the "not listed" line), the credit, More details (`winner:a11y.moreDetails`, hint `winner:a11y.moreDetailsHint`, role `link`), then Home (`winner:a11y.home`). The bulbs, the spotlight and the eyebrow are hidden from screen readers.
- While loading, the skeletons are one element, `winner:a11y.loading`; when the card arrives, focus moves to the title.
- Android's back and the iOS edge swipe do what Home does (see [Questions](#questions)).
- **Reduce Motion:** the fades stay (opacity only); nothing else moves.
- **Largest text:** the body scrolls and Home stays pinned; the title keeps 3 lines at `display-l`'s capped scale; tiles grow taller and wrap to more rows; the credit and the "not listed" line wrap.

## Never shown

- Who liked, super liked, noped or vetoed the film. No `Avatar`, no `PlayerPill`, no seat name anywhere on the screen (game-modes.md#what-players-see-party-and-blind: "A match never shows who said yes").
- The like count or the Final Cut's points: "7 of 9" on a still screen asks "who were the two?".
- Any "Open in Netflix" link or deep link into a service (decision row 35).
- Anything that pushes: no timer, no countdown, no "play again now", no streak.

## Differences from the Figma

- The service tiles are TMDB's logos with the service's name, not the Figma's placeholder tiles (figma-map.md).
- No "Matched in 3 min 42 s · 41 swipes" line: those are the recap's numbers (M6.21), and the beat keeps counts off this screen. The meta is the film's year and runtime.
- No Play again or Share recap (M6.23, M6.21) and no runners-up (M6.32). A Home button takes the footer until Play again.
- The poster is 144 by 216 instead of 86 by 130, since the first release has nothing below the block. It may shrink back when the runners-up arrive.
- The single-film line is new (Q4.4).

## Questions

New choices this spec makes, each with a default:

1. **The way back on a done room.** Today the room layout's leave guard asks "Leave the room?" on the edge swipe and Android's back, which means nothing once the room is over. Should both do what Home does on the winner screen, with no alert? Default: yes.
2. **A failed card read.** Should it be an inline retry on the screen (keeping Home reachable) rather than `ErrorScreen`? Default: yes, inline.

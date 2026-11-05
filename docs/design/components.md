# Components

The Figma library's components as built in code, with what the Figma says about each. Extracted on 29 October 2026 from the Components frame (node ids in [figma-map.md](figma-map.md)); the values live in `mobile/src/theme/tokens.json`, and the code in `mobile/src/components/` is now the source of truth. Every component is in the gallery (`/dev/gallery` in a development build) in all its states. Values marked "(raw)" have no variable in the Figma and became a token.

## Button (`ui/button`)

"Arcade button. Default has a 4 px lip. Pressed drops the lip and darkens; in code, move the button down 4 px for duration/fast and spring back with easing/arcade. Disabled uses state/disabled and text/disabled; it draws no lip but keeps the 4 points of space, so the button does not change height when it becomes enabled."

| | Face | Lip | Label |
| --- | --- | --- | --- |
| Primary | `accent.default`, pressed `accent.pressed` | `accent.pressed` | `text.on-accent` |
| Secondary | `bg.raised` with a `border.default` hairline; pressed `bg.surface`, `border.strong` | `bg.sunken` | `text.primary` |
| Ghost | none; pressed `accent.soft` | none | `accent.text` |
| Danger | `nope.default`, pressed `nope.strong` | `nope.strong` | `text.inverse`, pressed `text.on-accent` |
| Marquee | `marquee.default`, pressed `marquee.strong` | `marquee.strong` | `text.inverse` |
| Disabled | `state.disabled` (ghost: none) | none | `text.disabled` |

Size L: 56 high, 24 padding, `radius.md`, gap 10, `label-button-l`, icon 20. Size S: 40 high, 16 padding, `radius.sm`, gap 8, `label-button-s`, icon 18.

## Swipe action (`shared/swipe-action`)

"Swipe deck buttons. Flat colored caps on the same 4 px lip as the main buttons. Pressed sinks onto the lip, Lit glows while a card is dragged toward that button. Super shows the super likes left (1 or 2 per game)."

| | Cap | Lip | Icon | Label | Lit |
| --- | --- | --- | --- | --- | --- |
| Nope | 68, `nope.default` | `nope.strong` | x, 30, `text.inverse` | `nope.text` | `glow-nope` |
| Super | 56, `marquee.default` | `marquee.strong` | star filled, 26 | `marquee.default` | `glow-marquee` |
| Like | 68, `like.default` | `like.strong` | heart filled, 30 | `like.default` | `glow-like` |
| Undo, Seen it | 48, `border.default` with a `border.strong` hairline | `bg.sunken` with a `border.default` hairline | undo or eye, 22, `text.secondary` | `text.muted` | `accent.default` border, `glow-accent`, label `accent.text` |

Pressed: the cap moves down 4 and darkens (`nope.strong`, `marquee.strong`, `like.strong`, `bg.raised`). The super likes badge: 22, `bg.canvas`, a 1.5 (raw) `marquee.default` border, `mono-eyebrow`.

**Label spacing on the swipe screen.** The five buttons sit in equal-width columns. At 375 points wide the labels need at least 12 points between them. The long French ones ("J'AIME" and "DÉJÀ VU") are only about 6.5 points apart in the gallery today, so the swipe screen needs a smaller side gutter for that row, or less tracking on the outer labels. Check it in French on the iPhone 16e.

## Chip (`ui/chip`)

"Selectable filter chip." 36 high, `radius.pill`, `body-m-strong`. Default: `bg.raised`, `border.default` hairline, padding 14. Selected: `accent.default`, a 16-point check, padding 10 then 14, gap 6, `text.on-accent`.

`role`: `checkbox` (the default: independent filters such as moods) or `radio` (one choice per row, such as the time budget and the age cap in [host setup](screens/host-setup.md)). The chip is announced with that role and its checked state; for `radio`, the row around it is a `View` with `accessibilityRole="radiogroup"` labelled by the row's eyebrow. The look doesn't change. Gallery: a radio row. Added in M4.9.

## Tag (`ui/tag`)

"Small uppercase label with optional icon. Wildcard (neon) marks exploration cards." 24 high, padding 8, `radius.xs`, gap 4, `mono-eyebrow`, icon 14. Tones (background, text): neutral `bg.raised`, `text.secondary`; accent `accent.soft`, `accent.text`; like `like.soft`, `like.default`; nope `nope.soft`, `nope.text`; marquee `marquee.soft`, `marquee.default`; wildcard `neon.soft`, `neon.default`.

## Avatar (`ui/avatar`)

"Player avatar. Players pick one of 6 colors, and two players in a room may share one" (decisions.md, 30 Oct 2026; the picker is `AvatarPicker`). The Figma defines 10 swatches, all in the gallery. Sizes S 28, M 40, L 64; the initial in Staatliches at 14, 20 and 30 (raw, `avatar-s/m/l`), `text.inverse`. Colors: blue, green, gold, red, violet, teal, pink, orange, sky, lime (`color.avatar.*`). Online dot: `like.default` with a 2-point `bg.canvas` ring (8, 12 or 16).

## Input (`ui/input`)

"Labeled text field with helper text." Label `mono-eyebrow`, `text.secondary`; field 56 high, padding 16, `radius.md`, `bg.raised`; value `body-l`; helper `body-s`, `text.muted`. Default border: `border.control` hairline. Focused: 2-point `accent.default` border and `glow-accent`. Error: 2-point `nope.default` border, the helper in `nope.text`.

## PIN box (`ui/pin-box`)

"Single digit of a room code." 48 by 60, `radius.md`, `bg.sunken`. Empty: `border.control` hairline and a 12 by 2 `text.muted` dash. Active: 2-point `accent.default` border, a 14-point glow (raw, `glow-focus`), a 2 by 30 caret. Filled: `border.strong` hairline, the digit in `display-m`.

## Hidden input (`ui/hidden-input`)

An invisible input that owns a value and draws nothing: it fills its `relative` parent at `opacity-0`, caret hidden, autocomplete and autocorrect off. Props: `value`, `onChangeText`, `accessibilityLabel`, `accessibilityValueText`, `maxLength`, `keyboardType`, and a `ref` with `focus()`. It is the one accessible element of what the screen draws over it (the code field's boxes, [Join with a code](screens/join-code.md#layout)).

## Toggle (`ui/toggle`)

"On/off switch." 52 by 32, `radius.pill`. On: `accent.default` track, white 24-point knob 4 from the right. Off: `bg.raised` track with a `border.control` hairline, `text.secondary` knob.

## Icon button (`ui/icon-button`)

"Round icon-only button." 40, `radius.pill`, a 20-point icon. Filled: `bg.raised` with a `border.default` hairline. Plain: the icon alone.

## Option card (`ui/option-card`)

"Radio-style card for single choice." Padding 16, `radius.lg`, gap 14. Default: `bg.surface`, `border.default` hairline; icon box 44, `radius.md`, `bg.raised`; radio 22 with a 2-point `border.control` ring. Selected: `accent.soft`, 2-point `accent.default` border, icon box `accent.default`, radio filled with a 14-point check. Title `title-m`, description `body-s`, `text.secondary`.

## List row (`ui/list-row`)

"Settings and profile row inside a grouped surface." 56 high, padding 16, gap 14, a `border.subtle` bottom hairline. Icon 20, label `body-l`, value `body-m` `text.muted`, chevron 18.

## Top bar (`ui/top-bar`)

"Screen header with back and one optional action." 56 high, padding 12, gap 8; back and action are filled icon buttons; title `title-m`, centred.

## Toast (`ui/toast`)

"Transient message with icon." `bg.raised`, a hairline border in the tone's color, `radius.md`, padding 12 (14 on the left), gap 12, `elevation-card`. Title `body-m-strong`, message `body-s` `text.secondary`. Tones: info (info icon, `accent.text`), like (heart, `like.default`), success (check, `like.default`: something the player did worked, such as a copied code), warn (wifi-off, `marquee.default`).

## Player pill (`shared/player-pill`)

"In-game presence: who is swiping and how many cards they have seen." `bg.surface`, `border.default` hairline, `radius.pill`, padding 4 then 12, gap 8; avatar S, name `body-m-strong`, count `mono-data` `text.muted`.

## Room ticket (`shared/room-ticket`)

"Cinema ticket that shows the room code. Use on lobby, invite and recap." `bg.surface`, a `marquee.strong` hairline, `radius.lg`, `elevation-card`. "Room code" in `mono-eyebrow` `marquee.default`; the code in Staatliches 60 with 8% tracking (raw, `display-ticket`; the tracking after the last digit is pulled back so the code is centred); a dashed perforation with notches that are half circles cut into the card's two sides (a circle in the screen's canvas color centred on the edge, clipped by the card, with a `marquee.strong` outline; the shadow sits on an outer view so the clip does not cut it); details `mono-data` `text.secondary`. An optional `locked` (slice 8, M4.13) adds a `Tag` tone `neutral`, icon `lock`, `common:ticket.locked`, at the top right ([host menu](screens/host-menu.md#lock-room)). An optional `stamp` (M6.17) dims the code to `text.disabled` and lays a still stamp across it, drawn like `MovieCard`'s Nope stamp (`bg.sunken`, 4-point `nope.default` border, `radius.sm`, `display-stamp` in `nope`) and rotated `rotation.ticket-stamp` (-8 degrees): the closed room's "CLOSED" ([room closed](screens/closed.md#design-system-changes)). `display-stamp` is shared by these two components only.

## Service tile (`shared/service-tile`)

"Selectable streaming service." Fills its grid cell (three per row with a gap of 8: 106 on a 375-wide phone, 108 on a 430-wide one; never a fixed width, so a small iPhone fits), padding 12 (the unselected tile's 1-point border is made up with 1 more point of padding, so both states are the same height; only a long name such as "Apple TV+" shrinks, down to 80%, before it is cut), `radius.md`, gap 4. Default: `bg.surface`, `border.default` hairline, "Tap to add" in `text.muted`. Selected: `accent.soft`, 2-point `accent.default` border, a 16-point check beside "Added" on the second line (not on the name line, so names keep the full width and keep one size), "Added" in `accent.text` ("You have it" did not fit a 106-point tile). Name `title-m`.

## Movie card (`shared/movie-card`)

"Swipe card. Tap flips between Side=Front and Side=Back. Swap Poster; set Title, Meta, Rating and Synopsis." 345 by 518, `radius.xl`, `bg.surface`, `elevation-card`.

- **Front:** the poster fills the card; the `card-front-scrim` gradient over the bottom 92% (clear at the top, 88% `bg.sunken` at the bottom, nine eased stops; the back header, the match poster and the Final Cut bands keep `card-scrim`); a 36-point `bg.sunken` flip badge (info icon) top right; at the bottom, the reason tag (accent, zap), title `title-l`, meta `mono-data` `text.primary`, service tags.
- **Like / Nope:** a 3-point `like.default` or `nope.default` border, and a stamp rotated -14 or 14 degrees: `bg.sunken`, 4-point border, `radius.sm`, Staatliches 52 (raw, `display-stamp`).
- **Back:** a 132-point header with the poster, scrim, flip badge (refresh icon), title and meta; then the ratings (TMDB: star and `display-m` in `marquee.default`; a seated player's Letterboxd rating with their avatar), the synopsis (`mono-eyebrow` label, `body-m`), credits (`body-s`), service tags and the Trailer button (secondary S, play icon), and "Tap the card to flip back".

## Poster thumb (`shared/poster`)

"Small poster for lists, Final Cut and profile. Rescale proportionally." 72 by 108 (54 by 81 in result rows), `radius.sm`, `bg.raised` behind.

## Result row (`shared/result-row`)

"Ranked runner-up on the winner screen." `bg.surface`, `border.default` hairline, `radius.lg`, padding 12 then 16, gap 14. Rank `display-m` `marquee.default`, a 54 by 81 thumb, title `title-m`, meta `mono-data` `text.muted`, overlapping avatars and "2 of 3 liked" in `body-s`. The first release's winner screen doesn't use it: its runners-up are a poster row with no rank and no "of 3" ([winner](screens/winner.md#the-runners-up)).

## Rating logos (`shared/rating-logo`)

TMDB and Letterboxd only (IMDb and Rotten Tomatoes are in the Figma from the original app but aren't used). The Letterboxd mark is three dots; TMDB's logo must follow TMDB's attribution rules: check the file against TMDB's current logo before the store release.

## Built from the tokens, not in the Figma's library

`Text`, `Icon`, `Pressable`, `Screen`, `Banner`, `Countdown`, `Skeleton`, `EmptyState`, `MarqueeBulbs`, `Spotlight`, `GradientFill`. The designer should add them to the Figma library, or confirm them in the gallery.

`EmptyState` gains an optional `children` slot between its body and its action in M6.17, for the swipe screen's done card (tonight's filters and the liked count, [swipe.md](screens/swipe.md#the-done-card-nothing-left)).

## Proposed in the screen specs

Specified in the screen specs (`docs/design/screens/`) from 30 October 2026 on, not built yet. App-dev builds each with its gallery entry.

| Component | Tier | What changes | Spec |
| --- | --- | --- | --- |
| `AvatarPicker` | ui | New: a row of `Avatar` M swatches, one per color, with the typed initial and a selection ring | [Your name](screens/name.md#new-components) |
| `NameForm` | shared | New: the color picker and the name `Input`, used by the name screen and the join sheet | [Your name](screens/name.md#new-components) |
| `ServiceGrid` | shared | New: `ServiceTile`s in rows of three, with a loading state, used by host setup and the lobby's services sheet | [Host setup](screens/host-setup.md#new-component) |
| `PinBox` | ui | Gains an `error` state: a 2-point `nope.default` border | [Join with a code](screens/join-code.md#design-system-change) |
| `Icon` | ui | Gains `crown` (24 points, 2-point stroke) for the host's tag | [Lobby](screens/lobby.md#design-system-change) |
| `ListRow` | ui | Gains `tone="danger"`, `loading`, `disabled`, a minimum height with a two-line label for large text, and a label hidden from screen readers when `trailing` is set | [Settings](screens/settings.md#design-system-changes) |
| `Icon` | ui | Gains `volume` (24 points, 2-point stroke) for the Sound row | [Settings](screens/settings.md#design-system-changes) |
| `TabBar` | ui | New: two tabs (icon and label), the selected one in `marquee` | [The tab bar](screens/tab-bar.md#new-component) |
| `SegmentedControl` | ui | New: two or three segments in one track, a sliding thumb (My films' Liked and Seen) | [My films](screens/my-films.md#new-components) |
| `FilmTile` | shared | New: a film's poster as a grid tile, its placeholder, one badge (Picked or the star), used by My films and the pick sheet | [My films](screens/my-films.md#new-components) |
| `MovieCard` | shared | Gains `still`: the back with no flip badge and no flip-back line (the film sheet) | [The film sheet](screens/film-sheet.md#design-system-changes) |
| `WhereToWatch` | shared | Moves from `screens/winner/` to `shared/`, and takes the "not listed" line as a prop | [The film sheet](screens/film-sheet.md#design-system-changes) |
| `Toast` | ui | Gains an optional `action` (Undo) and `duration` | [The film sheet](screens/film-sheet.md#design-system-changes) |

Single-use pieces, in `components/screens/`: `splash/splash-view`, `welcome/hero`, `home/host-card`, `home/join-card`, `home/solo-card`, `swipe/status-cards` (the checkpoint, out of films and cap cards), `solo/pick-sheet`, `my-films/films-grid`, `join/code-field`, `lobby/seat-row`, `lobby/shuffling-overlay`, `invite/qr-panel`. The QR panel adds the `react-native-qrcode-svg` dependency named in [app structure](../architecture/app-structure.md#invites-and-deep-links).

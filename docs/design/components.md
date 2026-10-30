# Components

The Figma library's components as built in code, with what the Figma says about each. Extracted on 29 October 2026 from the Components frame (node ids in [figma-map.md](figma-map.md)); the values live in `mobile/src/theme/tokens.json`, and the code in `mobile/src/components/` is now the source of truth. Every component is in the gallery (`/dev/gallery` in a development build) in all its states. Values marked "(raw)" have no variable in the Figma and became a token.

## Button (`ui/button`)

"Arcade button. Default has a 4 px lip. Pressed drops the lip and darkens; in code, move the button down 4 px for duration/fast and spring back with easing/arcade. Disabled uses state/disabled and text/disabled."

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

## Chip (`ui/chip`)

"Selectable filter chip." 36 high, `radius.pill`, `body-m-strong`. Default: `bg.raised`, `border.default` hairline, padding 14. Selected: `accent.default`, a 16-point check, padding 10 then 14, gap 6, `text.on-accent`.

## Tag (`ui/tag`)

"Small uppercase label with optional icon. Wildcard (neon) marks exploration cards." 24 high, padding 8, `radius.xs`, gap 4, `mono-eyebrow`, icon 14. Tones (background, text): neutral `bg.raised`, `text.secondary`; accent `accent.soft`, `accent.text`; like `like.soft`, `like.default`; nope `nope.soft`, `nope.text`; marquee `marquee.soft`, `marquee.default`; wildcard `neon.soft`, `neon.default`.

## Avatar (`ui/avatar`)

"Player avatar. 10 colors for up to 10 players, assigned in join order and never repeated in a room." Sizes S 28, M 40, L 64; the initial in Staatliches at 14, 20 and 30 (raw, `avatar-s/m/l`), `text.inverse`. Colors: blue, green, gold, red, violet, teal, pink, orange, sky, lime (`color.avatar.*`). Online dot: `like.default` with a 2-point `bg.canvas` ring (8, 12 or 16).

## Input (`ui/input`)

"Labeled text field with helper text." Label `mono-eyebrow`, `text.secondary`; field 56 high, padding 16, `radius.md`, `bg.raised`; value `body-l`; helper `body-s`, `text.muted`. Default border: `border.control` hairline. Focused: 2-point `accent.default` border and `glow-accent`. Error: 2-point `nope.default` border, the helper in `nope.text`.

## PIN box (`ui/pin-box`)

"Single digit of a room code." 48 by 60, `radius.md`, `bg.sunken`. Empty: `border.control` hairline and a 12 by 2 `text.muted` dash. Active: 2-point `accent.default` border, a 14-point glow (raw, `glow-focus`), a 2 by 30 caret. Filled: `border.strong` hairline, the digit in `display-m`.

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

"Transient message with icon." `bg.raised`, a hairline border in the tone's color, `radius.md`, padding 12 (14 on the left), gap 12, `elevation-card`. Title `body-m-strong`, message `body-s` `text.secondary`. Tones: info (info icon, `accent.text`), like (heart, `like.default`), warn (wifi-off, `marquee.default`).

## Player pill (`shared/player-pill`)

"In-game presence: who is swiping and how many cards they have seen." `bg.surface`, `border.default` hairline, `radius.pill`, padding 4 then 12, gap 8; avatar S, name `body-m-strong`, count `mono-data` `text.muted`.

## Room ticket (`shared/room-ticket`)

"Cinema ticket that shows the room code. Use on lobby, invite and recap." `bg.surface`, a `marquee.strong` hairline, `radius.lg`, `elevation-card`. "Room code" in `mono-eyebrow` `marquee.default`; the code in Staatliches 60 with 8% tracking (raw, `display-ticket`); a dashed perforation with half-circle notches; details `mono-data` `text.secondary`.

## Service tile (`shared/service-tile`)

"Selectable streaming service." 108 wide, padding 12, `radius.md`, gap 4. Default: `bg.surface`, `border.default` hairline, "Tap to add" in `text.muted`. Selected: `accent.soft`, 2-point `accent.default` border, a 16-point check, "You have it" in `accent.text`. Name `title-m`.

## Movie card (`shared/movie-card`)

"Swipe card. Tap flips between Side=Front and Side=Back. Swap Poster; set Title, Meta, Rating and Synopsis." 345 by 518, `radius.xl`, `bg.surface`, `elevation-card`.

- **Front:** the poster fills the card; the `card-scrim` gradient over the bottom 64%; a 36-point `bg.sunken` flip badge (info icon) top right; at the bottom, the reason tag (accent, zap), title `title-l`, meta `mono-data` `text.secondary`, service tags.
- **Like / Nope:** a 3-point `like.default` or `nope.default` border, and a stamp rotated -14 or 14 degrees: `bg.sunken`, 4-point border, `radius.sm`, Staatliches 52 (raw, `display-stamp`).
- **Back:** a 132-point header with the poster, scrim, flip badge (refresh icon), title and meta; then the ratings (TMDB: star and `display-m` in `marquee.default`; a seated player's Letterboxd rating with their avatar), the synopsis (`mono-eyebrow` label, `body-m`), credits (`body-s`), service tags and the Trailer button (secondary S, play icon), and "Tap the card to flip back".

## Poster thumb (`shared/poster`)

"Small poster for lists, Final Cut and profile. Rescale proportionally." 72 by 108 (54 by 81 in result rows), `radius.sm`, `bg.raised` behind.

## Result row (`shared/result-row`)

"Ranked runner-up on the winner screen." `bg.surface`, `border.default` hairline, `radius.lg`, padding 12 then 16, gap 14. Rank `display-m` `marquee.default`, a 54 by 81 thumb, title `title-m`, meta `mono-data` `text.muted`, overlapping avatars and "2 of 3 liked" in `body-s`.

## Rating logos (`shared/rating-logo`)

TMDB and Letterboxd only (IMDb and Rotten Tomatoes are in the Figma from the original app but aren't used). The Letterboxd mark is three dots; TMDB's logo must follow TMDB's attribution rules: check the file against TMDB's current logo before the store release.

## Built from the tokens, not in the Figma's library

`Text`, `Icon`, `Pressable`, `Screen`, `Banner`, `Countdown`, `Skeleton`, `EmptyState`, `MarqueeBulbs`, `Spotlight`, `GradientFill`. The designer should add them to the Figma library, or confirm them in the gallery.

## Proposed for slices 4 to 7

Specified in the screen specs (`docs/design/screens/`) of 30 October 2026, not built yet. App-dev builds each with its gallery entry.

| Component | Tier | What changes | Spec |
| --- | --- | --- | --- |
| `AvatarPicker` | ui | New: a row of `Avatar` M swatches, one per color, with the typed initial and a selection ring | [Your name](screens/name.md#new-components) |
| `NameForm` | shared | New: the color picker and the name `Input`, used by the name screen and the join sheet | [Your name](screens/name.md#new-components) |
| `ServiceGrid` | shared | New: `ServiceTile`s in rows of three, with a loading state, used by host setup and the lobby's services sheet | [Host setup](screens/host-setup.md#new-component) |
| `PinBox` | ui | Gains an `error` state: a 2-point `nope.default` border | [Join with a code](screens/join-code.md#design-system-change) |
| `Icon` | ui | Gains `crown` (24 points, 2-point stroke) for the host's tag | [Lobby](screens/lobby.md#design-system-change) |

Single-use pieces, in `components/screens/`: `splash/splash-view`, `welcome/hero`, `home/host-card`, `home/join-card`, `join/code-field`, `lobby/seat-row`, `lobby/shuffling-overlay`, `invite/qr-panel`. The QR panel adds the `react-native-qrcode-svg` dependency named in [app structure](../architecture/app-structure.md#invites-and-deep-links).

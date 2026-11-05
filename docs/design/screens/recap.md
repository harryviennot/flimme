# Recap

Screen 17 Recap card (`99:4268`) on the Figma's First release page. Route `/room/[id]/recap` (`app/room/[id]/recap.tsx`), a `formSheet` over [the winner](winner.md), opened by its [Share recap](winner.md#share-recap) button. Built in M6.21. Written on 5 November 2026 (M6.47) from [after the pick](../../product/game-modes.md#after-the-pick), [sharing](../../architecture/app-structure.md#invites-and-deep-links) ("the recap card is shared as an image with `expo-sharing`"), [images](../../integrations/tmdb.md#images), the `winner:recap_share` event ([analytics](../../product/analytics.md#events)) and the slice plan. Harry's answer (Q21.2, 5 November 2026): the card shows nothing personal, just the film, the time, the number of people, the swipe count and the flimme.com link. The other questions took their defaults (Q21.1, Q21.3 to Q21.7; [decisions.md](../../decisions.md)).

## Purpose

One image of tonight's pick that any player can drop in a group chat: the film, how fast the group got there, how many people and swipes. It is the night's souvenir and free marketing ([monetization](../../product/monetization.md)), so it carries the app's link and nothing about anyone.

## Who and when

- **Every phone** in the room (Q21.6), for a pick only. Never on [Nothing fits tonight](winner.md#nothing-fits-tonight), never on [the solo pick](winner.md#the-solo-pick).
- The sheet is registered in the room layout (already there, `sheetAllowedDetents: [0.9]`, grabber). It needs `gestureEnabled: true` like the other room sheets, since the room stack turns gestures off; without it the sheet doesn't swipe down. M6.21 adds it.

## The numbers

Computed on the phone from reads the winner screen already holds, with `internal.write_room_stats`'s own definitions (Q21.1; `rooms.stats` is written later by the server and has no total swipe count):

| Number | From |
| --- | --- |
| The time | `round(decided_at - started_at)` in seconds, from `api.rooms` |
| People | Seats in `api.room_seats` with `swipe_count` above 0 |
| Swipes | The sum of `swipe_count` over every seat in `api.room_seats` |

**The time's format** (Q21.7), the same in both languages, the numbers through `Intl.NumberFormat` in the app's language: under a minute `recap:time.seconds` ("48 s"); under an hour `recap:time.minutesSeconds` ("3 min 42 s"), or `recap:time.minutes` when the seconds are 0 ("4 min"); from an hour, `recap:time.hoursMinutes` ("1 h 5 min"), seconds dropped. No zero padding.

## Layout

The sheet, `px-5 pt-5 pb-4 gap-4`, a column filling the detent:

1. **The header row:** `recap:sheet.title` in `title-l`, tone `primary`, on the left (role `header`); `IconButton` plain `x` (`common:actions.close`) on the right.
2. **The line:** `recap:sheet.body` in `body-s`, tone `secondary`.
3. **The preview** (`flex-1 items-center justify-center`): [the card](#the-card), scaled down as one piece to fit the space left in both width and height, keeping its 9 by 16 shape. At 375 by 667 it is about 230 by 410 points; on a larger phone it is limited by the width.
4. **Share:** `Button` `primary` L, `block`, icon `share`, `recap:sheet.share`.

**The capture copy.** The image is taken from a second card at its full size (360 by 640 points), laid out off screen, with `collapsable={false}`, `pointerEvents="none"` and hidden from screen readers. A scaled view is never captured. It is captured with `react-native-view-shot` (Q21.3) to a PNG of 1080 by 1920 pixels (a story's size), then shared.

**Components:** `Text`, `IconButton`, `Button`, `Poster`, `Icon`, `Spotlight`, `MarqueeBulbs`, `Skeleton`, `EmptyState`, `showToast`. Screen pieces in `components/screens/recap/`: `RecapSheet` (`recap-sheet.tsx`) and `RecapCard` (`recap-card.tsx`). The numbers, the time's format, the capture and the share live in `features/recap/`. No new `ui/` or `shared/` component and no new token.

## The card

`RecapCard`: a fixed `w-90 h-160` (360 by 640 points), `rounded-xl`, `border border-marquee-default`, `bg-bg-canvas`, `overflow-hidden`, `px-6 py-6`, a centred column with `gap-2.5`, content centred vertically. From the top:

1. **The spotlight:** `Spotlight` `tone="accent"`, a square as wide as the card behind the poster (`absolute inset-x-0 top-16 aspect-square`). Still.
2. **The bulbs:** `MarqueeBulbs`, `count` 11, lit and still.
3. **The eyebrow:** `recap:card.eyebrow` in `mono-eyebrow`, tone `marquee`.
4. **The heading:** `recap:card.heading` in `display-m`, tone `secondary`.
5. **The poster:** a frame `w-36 h-54` (144 by 216), `rounded-sm`, `overflow-hidden`, `bg-bg-raised`, `elevation-card`, holding `Poster` at `w342` (tmdb.md's size for the recap card) with the card's `poster_placeholder`. No poster: `Icon` `film`, size 40, `text-muted`, centred in the frame.
6. **The title:** the film's title in `display-l`, tone `marquee`, centred, at most 2 lines, then an ellipsis.
7. **The time:** `recap:card.time` with [the time](#the-numbers), in `display-s`, tone `primary`.
8. **The counts:** a row, `self-stretch flex-row gap-2`, of two boxes, each `flex-1 items-center gap-1 rounded-md border border-border-default bg-bg-surface py-3`: the number in `display-m`, tone `primary` (`Intl.NumberFormat`), and its label in `mono-eyebrow`, tone `muted`: `recap:card.people` and `recap:card.swipes`, both with `count`.
9. **The hairline:** `h-px self-stretch bg-border-default`.
10. **The link:** `recap:card.footer` in `mono-data`, tone `muted`, with `site` as `invite_base_url`'s host (`flimme.com`, Q21.4, from `api.app_config`; a development build prints `flimme.com` too, since the card names the site, not a link).

Every `Text` on the card has `allowFontScaling={false}`: the card is an image of a fixed size, so the phone's text size must not reflow it. Its words are in the preview's label for screen readers. The card is in the app's language.

**Measured:** the tallest case (a 2-line title) uses about 630 of the 640 points. Nothing else fits on the card; anything new means taking something out.

**Never on the card:** a player's name or avatar, the room code (codes are reused once a room ends), the services or their logos (no JustWatch data, so no credit needed), the date, the mode, Party or Blind, who liked anything, the runners-up, a like count, a rating. The TMDB notice stays in Settings, About.

## Sharing

- **Tap Share:** the button turns `loading` at once (`press` haptic). If the poster hasn't loaded yet, the capture waits for it (`Poster`'s load event) for up to 3 seconds (a constant in `features/recap/`, not a token), then goes ahead with the placeholder. Then the capture, then the system share sheet with the PNG (`expo-sharing`, `mimeType` `image/png`, iOS `UTI` `public.png`, Android `dialogTitle` `recap:sheet.title`).
- **The image goes alone.** No message text: the link is printed on the card, and `expo-sharing` sends a file without text on both platforms.
- **Analytics:** `winner:recap_share` with `method: 'share_sheet'` (Q21.5), once per share. A share the system reports as cancelled tracks nothing. Where the platform can't tell a cancel from a share (`expo-sharing` resolves the same way for both), it is tracked when the sheet closes without an error, and M6.21's pull request says which platforms do that. No film id or title in the event; the analytics wrapper drops it in a room with an age cap under 13.
- **After the sheet closes,** the recap sheet stays open with Share ready again: the player can share to a second chat, or close it.
- The capture file goes in the cache folder and is deleted when the share sheet closes, as the data export does.

## States

| State | What shows |
| --- | --- |
| The room, seats and card are on the phone (usual: the winner screen read them) | The preview at once; Share ready |
| The room or seats not read yet (a cold start on the route) | A `Skeleton` the preview's size (`rounded-xl`), one element `recap:a11y.loading`; Share disabled |
| A read failed | In the preview's place, `EmptyState` icon `alert`, `recap:errors.load`, action `common:actions.retry`; Share hidden |
| Offline before the reads | `EmptyState` icon `wifi-off`, `recap:errors.offline`, no action; the reads retry when the phone is back |
| The poster still loading | The preview shows the placeholder; Share is ready and [waits for the poster](#sharing) |
| No poster (`poster_path` null) | The film icon in the frame, on the preview and the image |
| A long title | 2 lines, then an ellipsis, on the card; the full title in the label |
| `started_at` or `decided_at` missing (never for a pick, but the row allows it) | No time line; the rest as usual |
| 1 person | `recap:card.people` singular |
| Capturing | Share `loading` |
| The capture failed | `showToast` warn, `recap:errors.capture`; `haptics.error()`; Share ready again |
| The share sheet is open | The system sheet over the recap sheet |
| Shared, or cancelled | Share ready again; nothing else shows. Tracked only for a share ([sharing](#sharing)) |
| The system share failed | `showToast` warn, `recap:errors.share`; `haptics.error()`; Share ready again |
| Offline at Share | Sharing still works (the image is made on the phone); a poster never loaded is the placeholder |
| The room isn't `done` with a pick, or is solo (a stray link) | The route closes (`router.back()`) |
| The Join offer arrives under the sheet | Nothing here; the offer waits on the winner screen ([the Join offer](winner.md#the-join-offer)) |
| The largest text | The header and the line wrap; the preview shrinks to keep Share on screen; the card itself doesn't change |

## Copy (`recap` namespace)

A new file pair for M6.21, `i18n/locales/fr/recap.json` and `en/recap.json`, registered in `i18n/resources.ts` and `i18next.d.ts`. Glossary: the share image is "le récap" (proposed); "soirée film" (proposed); "tonight's pick" is "le film du soir". `tu` in the sheet (it speaks to one player); "On a choisi" on the card speaks for the group. No exclamation marks: the celebration already happened.

| Key | French | English |
| --- | --- | --- |
| `entry` | Partager le récap | Share recap |
| `sheet.title` | Ton récap | Your recap |
| `sheet.body` | Une image du film du soir, à envoyer où tu veux. Aucun prénom dessus. | An image of tonight's pick to send anywhere. No names on it. |
| `sheet.share` | Partager | Share |
| `card.eyebrow` | Soirée film | Movie night |
| `card.heading` | On a choisi | We picked |
| `card.time` | En {{time}} | In {{time}} |
| `card.people_one` | personne | person |
| `card.people_other` | personnes | people |
| `card.swipes_one` | swipe | swipe |
| `card.swipes_other` | swipes | swipes |
| `card.footer` | Fait avec Flimme · {{site}} | Made with Flimme · {{site}} |
| `time.seconds` | {{seconds}} s | {{seconds}} s |
| `time.minutes` | {{minutes}} min | {{minutes}} min |
| `time.minutesSeconds` | {{minutes}} min {{seconds}} s | {{minutes}} min {{seconds}} s |
| `time.hoursMinutes` | {{hours}} h {{minutes}} min | {{hours}} h {{minutes}} min |
| `errors.load` | Impossible de charger le récap. | Couldn't load the recap. |
| `errors.offline` | Tu es hors ligne. Le récap s'affiche dès ton retour. | You're offline. The recap shows when you're back. |
| `errors.capture` | Impossible de créer l'image. Réessaie. | Couldn't make the image. Try again. |
| `errors.share` | Le partage n'a pas marché. Réessaie. | Sharing didn't work. Try again. |
| `a11y.entry` | Partager une image du film du soir | Share an image of tonight's pick |
| `a11y.preview` | Récap : {{title}}, choisi en {{time}}. {{people}}, {{swipes}}. | Recap: {{title}}, picked in {{time}}. {{people}}, {{swipes}}. |
| `a11y.people_one` | {{count}} personne | {{count}} person |
| `a11y.people_other` | {{count}} personnes | {{count}} people |
| `a11y.swipes_one` | {{count}} swipe | {{count}} swipe |
| `a11y.swipes_other` | {{count}} swipes | {{count}} swipes |
| `a11y.shareHint` | Ouvre le menu de partage | Opens the share sheet |
| `a11y.loading` | Chargement du récap | Loading the recap |

The card's labels are uppercase in their fonts (`display-*`, `mono-eyebrow`): "ON A CHOISI", "EN 3 MIN 42 S", "PERSONNES". At 360 points the longest, "EN 12 MIN 48 S" in `display-s`, fits one line; "PARTAGER LE RÉCAP" fits `label-button-s` on the winner screen at 375 points. French keeps "swipe" as the app's other strings do. `site` is a host name, never translated.

## Motion, haptics, sound

- The system sheet's slide in and out. The preview's poster fades over its placeholder (`Poster`'s own `transition`, `duration.fast`). Nothing else moves: the card is a still image.
- `press` on Share recap, Share and Close; `haptics.error()` when the capture or the share fails. No `match` haptic and no sound: sound is only for the match and the reveal.
- **Reduce Motion:** nothing to change.

## Accessibility

- On open, focus goes to the sheet's title (role `header`).
- **Order:** the title, the line, the preview (one element, role `image`, `recap:a11y.preview` with the title, the time and the counts), Share (hint `recap:a11y.shareHint`), Close (`common:actions.close`). The capture copy is hidden from screen readers.
- The swipe down and Android's back close the sheet.
- **Largest text:** the sheet's text grows; the card doesn't (it is an image), and its words are in the label.

## Never shown

- On the card or in the sheet: names, avatars, the room code, services, who liked or noped anything, the runners-up, the Final Cut's points, the date.
- Nothing that pushes: no "share to unlock", no streak, no nudge to share.

## Differences from the Figma

- **No date** ("Friday 24 October"): Harry's list for the card is the film, the time, the people, the swipes and the link (Q21.2). The eyebrow reads "Movie night".
- **The time is a line,** "In 3 min 42 s", not a third box reading "3:42": "3 min 42 s" (Q21.7) doesn't fit a third of the card in `display-m`. Two boxes stay, for the people and the swipes.
- **"We picked"** is `display-m`, not `display-l`, and **the title** is 2 lines at most, so a 9 by 16 image (a story's shape) holds everything.
- **The poster is upright,** with no tilt: the Figma's small angle has no rotation token, and an upright poster reads better when the image is shrunk in a chat.
- **The link is flimme.com,** not the placeholder flimme.app (decided 4 November 2026).
- **A solid hairline** instead of the dashed rule: React Native draws a dashed border on one side unreliably.
- The Figma has no sheet around the card; the sheet's title, line and Share button are new.

## Decided

On 5 November 2026 (M6.47), from Harry's answer to Q21.2 and the slice's defaults. This spec's own defaults, written under "Defaults taken" in its pull request:

1. **No date on the card,** following Harry's list word for word.
2. **A fixed 360 by 640 card, captured at 1080 by 1920,** so every phone makes the same image and it fills a story.
3. **The image goes without message text,** since the link is on the card and `expo-sharing` shares a file alone.
4. **A cancel tracks nothing where the system says so;** otherwise the share is tracked when the sheet closes, and M6.21's pull request names the platforms.
5. **The capture waits up to 3 seconds for the poster,** then uses the placeholder.

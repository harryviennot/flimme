# It's a match

Screen 14 It's a match (`99:4149`) on the Figma's First release page. Not a route: `MatchOverlay` (`components/screens/room/match-overlay.tsx`) is mounted in the room layout (`/room/[id]/_layout.tsx`) above whichever room screen shows, so it shares no file with the swipe screen (Q0.4). Built in M6.14. Written on 4 November 2026 from [the match](../moments.md#the-match) (the beat, its sequence and edge cases), [realtime](../../architecture/app-structure.md#realtime), [what players see](../../product/game-modes.md#what-players-see-party-and-blind) and slices 10 and 11's plan; Harry accepted every default on 4 November 2026 ([decisions.md](../../decisions.md)). Updated on 5 November 2026 (M6.33): a match now joins the room's shortlist, so this overlay plays only for the night's pick ([when it's a match](../../product/game-modes.md#when-its-a-match)).

## Purpose

Every phone in the room celebrates the night's film at the same second, then hands over to where to watch it. It celebrates the group: nothing says who liked it last, or who didn't.

## When it shows

- **Only for the pick:** a `match` with `decided: true` and a kind other than `finale`. That is:
  - **`only_match`**, in Quick Match and Date Night: swiping ended (the card count, the time limit, everyone out of cards) with exactly one film on the shortlist, so it's the pick with no vote. The event is `{title_id, kind, likes, of, decided: true, reason: 'only_match'}`, with the match row's own kind (`unanimous` or `majority`) and counts. Nothing else changes for the overlay: it reads the event as it reads any decided match. Nobody just swiped, so the event is the only signal.
  - **Any match in a mode with `matches_to_end` 1** (none at launch).
- **Not for a shortlisted match:** a `match` with `decided: false` plays [the shortlisted beat](swipe.md#the-shortlisted-beat) on the swipe screen; the overlay ignores it. Quick Match is no longer "always decided": its first and second matches are shortlisted, and its third starts the Final Cut.
- **Not for a finale pick** (kind `finale`): the Final Cut's reveal is that celebration (Q15.1).
- **The first of two signals:** the `ok` answer to this phone's own vote with `match: true` and `decided: true` (the film is the voted card; only in a mode with 1), or the `match` event.
- **Once per room.** A second `match` event for a room already shown is ignored.
- **Missed it** (offline, in the background, killed): when the room's re-read finds it `done` with a pick (`pick_order` 1 in `api.room_matches`) of kind `unanimous` or `majority`, and this room isn't marked as shown, the overlay plays once in full, haptic and sound included, then the winner screen. The room's other shortlisted rows (no `pick_order`) never start it, and a pick of kind `finale` is the reveal's.
- **"Already shown" is persisted per room** (Q14.3): `features/room/match-shown.ts`, a small persisted store like `kept-room.ts`, holding the ids of the last 20 rooms whose overlay played. A room is marked once its avatars have landed (about 1.6 seconds) or when the overlay leaves, whichever comes first. A phone that cold-starts in a marked room goes straight to the winner screen.
- Phones that left the room never get it.

## Layout

Full screen, over everything in the room (`accessibilityViewIsModal`), under the root `ToastHost`.

1. **The scrim:** `bg-overlay-scrim` over the game.
2. **The poster, full screen:** `Poster` of the matched film, cover-fitted edge to edge, then `bg-overlay-scrim` over it, and `GradientFill` `card-scrim` over the bottom 64% so the text below reads.
3. **Top**, under the safe area, `pt-6`, centred, `gap-3`: `MarqueeBulbs` `chasing`, `count` 16; then `match:title` in `display-l` tone `marquee` with `glow-marquee`, centred, at most two lines (French wraps "C'EST UN / MATCH !" at 375 points).
4. **Bottom**, `px-5`, `gap-3`, above the footer:
   - **The avatars:** one `Avatar` M with `overlap` per seat with `left_at` null, in seat order (`joined_at`, then `member_id`), the order of the player pills. No online dots, no marks, no names (Q14.2). Ten fit in one row at 375 points.
   - **The count**, `title-m`: `match:count.unanimous` when `likes` equals `of`, otherwise `match:count.majority`.
   - The film's title in `title-l`, and its meta in `mono-data` tone `secondary` (the year and runtime through `Intl`, as on the card).
5. **Footer:** `Button` marquee L, `block`, icon `tv`, `match:cta`.

**Where the data comes from.** The film: the card store, which keeps every card of this game (mounted, buffered or answered); otherwise `api.titleCards` for that one id (M5.9). The overlay never waits for it: the poster's placeholder shows until the image or the card arrives, then the poster fades in (`layout.fadeIn`). The count: the `match` event, or the `api.room_matches` re-read when the phone started from its own answer (which has no count); if neither has come by the time the last avatar lands, the count fades in when it does. The avatars: the seats the phone already has.

## The sequence

Times from the first signal. Tokens from `@/theme/motion`.

| Time | Every phone |
| --- | --- |
| 0 | The stack stops taking input: a drag springs back (`spring.card`), a thrown card finishes its flight, the rewatch question closes with no vote, the near-miss toast leaves (`layout.fadeOut`). The scrim fades in (`duration.fast`). `haptics.match()` and `playSound('match')`, together, once |
| 0 to 800 ms | The poster scales from the card's frame to full screen (`timing.celebrate`, the arcade overshoot). It starts from the top card's frame when the matched film is the top card or the card just thrown, otherwise from a card-size frame centred where the stack is. The bulbs start chasing |
| About 400 ms | The title lands (`layout.popIn`) |
| From 800 ms | The avatars pop in one by one in seat order (`spring.bouncy`), one every `duration.instant`: about 800 ms for 10 players. The count, the film's title and the meta fade in with the last one. The button fades in (`layout.fadeIn`) |
| From 800 ms | A tap anywhere, or the button, goes on. A touch that started before the overlay never counts, so a swipe in progress can't skip it |
| `duration.match-hold` (4 s) | The overlay hands over by itself (Q14.1) |

**The hand-over.** While the overlay shows, the room layout holds its route change (the room is already `done`). On the hand-over it replaces the screen under the overlay with `/room/[id]/winner` without an animation, then the overlay fades out (`layout.fadeOut`). No haptic and no sound for the winner screen.

**Until slice 13.** The winner screen is M6.16 (slice 13). Until it ships, the hand-over lands on the existing winner placeholder (`PlaceholderScreen`, "This screen comes with task M6.16"). The player leaves it with the edge swipe or Android's back, which open the leave guard's alert. The overlay itself doesn't change when M6.16 ships.

## States

| State | What shows |
| --- | --- |
| The film's card is on the phone | Everything at once |
| The film's card isn't on the phone | The poster's placeholder, then the poster fades in from `api.titleCards`; the title and meta fade in with it. If the read fails, the placeholder stays and the title comes from the next re-read |
| No count yet | Everything but the count, which fades in when it arrives |
| Offline when it started (its own `ok` came, then the network went) | The overlay plays the same; the count waits for the re-read |
| A sheet was open (seat, report, invite) | The sheet closes as the room leaves `swiping` (the layout's `SHEETS` rule); the overlay covers what's left |
| The match came from someone leaving | The same overlay: nobody just swiped |
| `only_match` (the finale found one match) | The same overlay, from the event, over the swipe screen or the done card. The film is already in the top bar's shortlist; the poster still starts from a card-size frame centred where the stack is |
| A shortlisted beat is playing | The beat's layer goes at once and the overlay starts from 0 |
| A second `match` for this room | Ignored |
| The room is `done` but marked as shown | No overlay; the winner screen |

## Copy (`match` namespace)

A new file pair, `i18n/locales/fr/match.json` and `en/match.json`, added by M6.14 (so it shares no locale file with M6.9). French from the glossary ("C'est un match", proposed). A celebration, so the title may have an exclamation mark.

| Key | French | English |
| --- | --- | --- |
| `title` | C'est un match ! | It's a match! |
| `count.unanimous` | Unanimité : {{likes}} sur {{of}} | Unanimous: {{likes}} of {{of}} |
| `count.majority` | {{likes}} sur {{of}} ont dit oui | {{likes}} of {{of}} said yes |
| `cta` | Où regarder | Where to watch |
| `a11y.announce` | C'est un match : {{title}}. {{count}} | It's a match: {{title}}. {{count}} |
| `a11y.avatars` | Toute la salle : {{names}} | Everyone in the room: {{names}} |
| `a11y.cta` | Voir où regarder {{title}} | See where to watch {{title}} |

The names are joined with `Intl.ListFormat`. The count is never "one more" or a name: likes of voters only. `count.unanimous` and `count.majority` are also the shortlisted beat's vote count ([swipe.md](swipe.md#copy)), so both moments say it the same way.

## Motion, haptics, sound

- As in [the sequence](#the-sequence); every duration is a token. `duration.match-hold` (4000ms) is new ([Design-system changes](#design-system-changes)).
- `haptics.match()` once at 0; the avatars pop silently.
- `playSound('match')` once at 0: mixed with other audio, quiet on silent, its own setting, a no-op until M6.24.

## Accessibility

- At 0 the overlay takes focus and announces `match:a11y.announce` (assertive). Focus order: the title, the avatars as one element (`match:a11y.avatars`), the count, the film, the button.
- **With a screen reader on, the overlay doesn't hand over by itself:** it waits for the button, so the announcement isn't cut off.
- Android's back goes on, like a tap.
- **Reduce Motion:** the poster fades in at full size (`timing.base`) instead of scaling; the bulbs are lit and still; the avatars, the count and the film fade in together without a stagger or a bounce. The haptic and the sound are unchanged.
- Largest text: the title stays at two lines; the count and the film wrap; the avatars keep their size.

## Design-system changes

- **Token:** `duration.match-hold`, 4000ms, "The match overlay before the winner screen (a starting value)", then `mise run tokens`. M6.14.
- No new component. `MatchOverlay` is a room screen piece (no gallery entry); M6.14 adds a dev menu entry that plays it with fixture data, for the feel check.

## Differences from the Figma

- "Harry, Sam and Jo said yes" becomes every seated player's avatar and the count (Q14.2): a majority match would otherwise show who didn't.
- The poster takes the whole screen (the beat and M6.14) instead of a tilted card-size poster with a green glow.
- The title is in `marquee` with `glow-marquee`; the Figma's sunset gradient on the text would need a masked view, which the system doesn't have.
- The bulbs stay a row above the title, as in the Figma, rather than around the edge.
- No Keep swiping and no "Watch on" link; the Figma's caption already says so. Keep swiping (M18.4) was dropped on 5 November 2026: swiping already goes on after a shortlisted match.

## Questions

Harry accepted Q14.1 (4 seconds, a tap goes on earlier), Q14.2 (every seated avatar, no marks, the count) and Q14.3 (shown once per room, persisted) on 4 November 2026. New choices this spec makes, each with a default:

1. **Taps during the first 800 ms.** Default: they don't count, so a tap or swipe already under way can't skip the moment.
2. **Screen readers.** Default: no automatic hand-over while VoiceOver or TalkBack is on; the button goes on.
3. **Until M6.16.** Default: the hand-over lands on the existing winner placeholder, with no Home button; the leave guard is the way out.

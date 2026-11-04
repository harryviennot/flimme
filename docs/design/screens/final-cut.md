# The Final Cut

Screen 15 Final cut (`99:4187`) on the Figma's First release page. Route `/room/[id]/final-cut`, under the room layout (`/room/[id]/_layout.tsx`), shown while the room is `finale`. Built in M6.15; the reveal is M6.31. Written on 4 November 2026 from [the Final Cut](../moments.md#the-final-cut) (the beat, which wins over this spec where they differ), [the vote](../../product/game-modes.md#the-vote-pick-one-veto-one), [what players see](../../product/game-modes.md#what-players-see-party-and-blind), M6.5's contract and slices 12 and 13's plan. Harry took Q15.1 to Q15.5 and Q5.1 to Q5.5 on 4 November 2026 ([decisions.md](../../decisions.md)), and the beat's questions 9 (a veto can be taken back until lock-in) and 10 (poster, title and year, no details sheet) the same day.

## Purpose

Nobody matched, so the room votes on 2 to 4 finalists in 60 seconds. The couch talks; each phone keeps its own secret ballot. A player ranks by tapping posters, may veto one (Final Cut only), and locks in. The only thing the room learns while it runs is who has locked in. It should feel short, a little tense and fair, and most rounds should end before zero because everyone locked in.

## Layout

`Screen` with `scroll` and `footer`, on `bg-bg-canvas`. The body scrolls only when it must (10 seats, the largest text); the footer is always pinned.

1. **The top bar:** `TopBar`, no back, `title` `finale:title.finalCut` (`finale:title.ranked` in a ranked vote), `action` `{ icon: 'x', accessibilityLabel: lobby:a11y.leave }`. It opens the same leave alert as the lobby and the swipe screen (`lobby:leave.*`); the room layout's `RoomLeaveGuard` already covers the edge swipe and Android's back. A ballot already locked in still counts after leaving.
2. **`RoomBanner`**, in the flow, as on every room screen (reconnecting, offline).
3. **The body**, `px-5 pt-2 pb-3 gap-4`:
   1. **The heading row**, `flex-row items-start gap-3`: the heading in `display-m`, tone `primary`, `flex-1`, at most 2 lines (`finale:heading.finalCut`, or `finale:heading.ranked`); then `Countdown` (see [The countdown](#the-countdown)). French wraps to two lines at 375 points.
   2. **The intro**, `body-m`, tone `secondary`: `finale:intro.veto` in a Final Cut with a veto left, `finale:intro.noVeto` with `vetoes_left` 0, `finale:intro.rank` in a ranked vote.
   3. **The finalists**, `flex-row justify-center gap-2.5`, one `Finalist` per candidate in seed order, each `flex-1 max-w-36`. Widths at 375 points: 4 finalists 76, 3 finalists 105, 2 finalists 144 (the cap, centred).
   4. **The lock-in row** (`LockInRow`), `gap-2`: the count in `mono-eyebrow`, tone `secondary` (`finale:locked.count`); under it one `Avatar` S per seat with `left_at` null, in seat order (`joined_at`, then `member_id`), `flex-row flex-wrap gap-2` (9 fit in a row at 375 points, a tenth wraps).
4. **The footer** (`LockInFooter`), `px-5 pt-3 gap-2`: the button area (one of the four looks in [Locking in](#locking-in)), then the status line, `body-s`, tone `muted`, centred, `min-h-4.5` (one line kept even when empty, so nothing jumps).

**A finalist** (`Finalist`), `gap-1`, from the top:

- **The poster frame:** `rounded-sm overflow-hidden bg-bg-raised`, a 2:3 shape (`style={{ aspectRatio: 2 / 3 }}`, as `MovieCard` keeps its shape), holding `Poster` with the card's `poster_placeholder` as its thumbhash. No poster: `Icon` `film`, 32, `text-muted`, centred.
- **The ring,** drawn over the poster (`absolute inset-0 rounded-sm`), so a change of border never moves the poster: untapped `border border-border-strong`; ranked `border-2 border-accent-default`, and the first place also `glow-accent`; vetoed `border-2 border-nope-default`.
- **The badge,** `absolute top-1.5 left-1.5 size-7.5 rounded-pill items-center justify-center`, its number in `display-s` (`maxFontSizeMultiplier` 1, the circle is fixed and the label carries the number):
  - **ranked:** `bg-accent-default`, tone `on-accent`;
  - **faint** (not tapped): `bg-bg-raised`, tone `muted`. Its number is the place the film gets if the player taps nothing more: the tapped films in tap order, then the rest in seed order, minus the veto (Q15.5);
  - **vetoed:** no badge.
- **The veto stamp:** `Icon` `ban`, 44, `nope-default`, centred on the poster; the poster under it at `opacity-disabled`.
- **The title** in `body-s`, tone `primary`, at most 2 lines with an ellipsis (the full title is in the label), then **the year** in `mono-data`, tone `muted` (left out when unknown).

The whole finalist (poster and text) is one `Pressable` with `haptic={false}`: the screen fires `haptics.press()` itself on a tap that ranks or unranks, so a long press never buzzes twice.

**Components:** `Screen`, `TopBar`, `RoomBanner`, `Text`, `Countdown`, `Poster`, `Icon`, `Pressable`, `Avatar`, `Button`, `Skeleton`. Screen pieces in `components/screens/final-cut/`: `FinalCutScreen` (`final-cut-screen.tsx`), `Finalist` (`finalist.tsx`), `LockInRow` (`lock-in-row.tsx`), `LockInFooter` (`lock-in-footer.tsx`), and `Reveal` (`reveal.tsx`, the slot M6.31 fills; it renders nothing and the layout moves on). No new `ui/` or `shared/` component and no new token. One small change to `Countdown` ([Design-system changes](#design-system-changes)).

**Where the data comes from.** `api.rounds` (the open round: `id`, `kind`, `stage_closes_at`), `api.round_candidates` (`title_id`, `seed`), the cards through `api.title_cards` (one call for every finalist, the stack's held cards first, as `useMatchCard` does), `api.room_seats` (the seats for the row, `vetoes_left` on the phone's own seat) and `api.roundProgress` (`locked`, `of`, `me_locked`) on open. Then `round_progress` events. `finale_started` may prefetch the cards and posters while the swipe screen is still up; only `state_changed` moves the phone here.

## Ranking

- **A tap on an untapped poster** gives it the next number: its faint badge turns solid with a pop (`spring.snappy`) and the ring turns accent. The other faint numbers change in place. `haptics.press()`.
- **A tap on a ranked poster** takes its number off: its badge goes back to faint, the ring back to `border-strong`, and the ranked numbers after it close the gap in place. `haptics.press()`.
- **The posters never move.** Only badges, rings and the stamp change, so nothing slides out from under a finger.
- **None tapped:** every poster shows a faint number, 1 to n in seed order. Locking in sends that order.
- **Some tapped:** solid numbers 1 to k on the tapped ones, faint numbers k+1 onward on the rest, in seed order.
- **All tapped:** every badge solid.
- **A tap on the vetoed poster** does nothing to the order and has no haptic. The status line says `finale:hint.liftVeto` until the next action.

## The veto

Only in a Final Cut (`kind` `final_cut`) with `vetoes_left` 1 or more on the phone's seat.

- **The press:** while a finger is held, the poster frame sinks 4 points (the arcade lip's travel, `timing.press`). Released before the system's long-press time: it springs back (`timing.release`) and counts as a tap.
- **Vetoing:** at the long-press time the stamp pops on (`layout.popIn`, the arcade overshoot), the poster dims to `opacity-disabled`, the ring turns nope, and `haptics.veto()` fires with the stamp. If the film was ranked, it leaves the ranking and the numbers after it close the gap. Its badge goes; the faint numbers on the others update.
- **Lifting it:** a long press on the vetoed poster lifts the veto. The stamp fades out (`layout.fadeOut`), the poster comes back to full opacity with a faint number. It doesn't get its old rank back. No haptic.
- **Moving it:** a long press on another poster moves the veto there: the old stamp fades out and the new one pops on, the new film leaves the ranking if it was in it. No haptic (moving is silent; `haptics.veto()` is for a veto landing on a poster that had none anywhere).
- **One veto at most** on the screen at any time. It is spent only at lock-in.
- **No veto control** in a ranked vote or with `vetoes_left` 0: no sink, no stamp, no hint, and a long press does nothing (it doesn't count as a tap either).

## Locking in

The footer's button area has four looks. Each keeps the same height (56 plus the 4-point lip space), so the screen never jumps.

| Look | What shows |
| --- | --- |
| **Lock in** | `Button` primary L, `block`, icon `lock`, `finale:lockIn`. Always enabled once the finalists are read: locking in untouched sends the seed order |
| **Sending** | The same `Button` with `loading` (its spinner), labelled `finale:sending`. The ballot is frozen: badges and stamp stay, taps and long presses stop. The status line says `finale:hint.sending`, or `finale:hint.offline` when offline |
| **Locked in** | The `LockedIn` look inside `LockInFooter`: a `h-14 mt-1 rounded-md bg-like-soft border-2 border-like-default flex-row items-center justify-center gap-2.5` panel (the button pressed down for good, with no lip), `Icon` `check` 20 `like-default` and `finale:locked.title` in `label-button-l`, tone `like`. Not pressable. The status line is empty |
| **Counting the votes** | `finale:counting.title` in `display-s`, tone `marquee`, centred, in the same space. After 10 seconds (a starting value), the status line adds `finale:counting.slow` |

- One tap sends one `castBallot({round_id, ranking, veto})`: a second tap during Sending does nothing (the button is `loading`).
- The ballot is the tapped films in tap order, then the untapped films in seed order, minus the veto (Q15.5). The veto is sent only when one is on the screen.
- On `ok` (or `already_voted`) the look becomes Locked in, the check pops (`spring.snappy`), and this player's avatar lights up in the row from the answer's `locked`. `Countdown`'s `tick` turns off.
- **No `commit` haptic** on lock-in (the beat wins over the brief's rule 12): only the button's `press`.

## Who has locked in

- **Dim:** the avatar at `opacity-disabled`. **Lit:** full opacity, with a check badge on its bottom right corner: `absolute -right-0.5 -bottom-0.5 size-3.5 rounded-pill bg-like-default border-2 border-bg-canvas`, `Icon` `check` 10 `text-inverse`. No `online` dot here (the badge sits where it would).
- A lock-in lights its avatar (opacity over `duration.fast`) and pops its check (`spring.snappy`), on every phone at once, from `round_progress` `{round_id, locked, of}`. No haptic.
- **The count** is the seats in `locked` that are still in the row, never more than `of`: `locked` can list seats that left.
- Seat order, always. Never the order of lock-ins, never a name on screen, never a word under a dim avatar.
- A seat that leaves: its avatar leaves the row (`layout.fadeOut`) and `of` drops with the next event.

## The countdown

- `Countdown` with `deadline` the shown deadline: `stage_closes_at`, but never more than 60 seconds after the moment this phone first read the round (`features/finale/countdown.ts`). So a slow clock can't promise extra time. `Countdown` already corrects for the phone's clock offset (`lib/server-time`).
- **The last 10 seconds:** `Countdown` turns red by itself.
- **The last 5 seconds:** one `haptics.countdown()` per second, by `Countdown`, with `tick` true only while this phone hasn't locked in (no Sending, no Locked in).
- **Zero** (`onEnd`): a phone that hasn't locked in stops taking taps and sends nothing (Q15.3). The countdown leaves (`layout.fadeOut`), the footer shows Counting the votes (`layout.fadeIn`), the posters dim to `opacity-stack-near` (`timing.base`). A ballot already in flight keeps going quietly.
- **Zero plus 2 seconds:** `api.closeRoundStage({round_id})` (Q5.1). `not_yet`: again each second. A failed call: again each second. `ok` or `closed`: stop, and wait for `state_changed {state: 'done'}`. Several phones calling is harmless.

## States

| State | What shows |
| --- | --- |
| **Arriving** (`state_changed {state: 'finale'}` on the swipe screen) | The screen fades in (`layout.fadeIn`, `duration.base`): heading, countdown at the time left, the row with every avatar dim. The posters pop in one by one in seed order (`layout.popIn`, one every `duration.instant`), each with its faint number. No haptic, no sound |
| **Loading** (a cold open, or the cards not here yet) | The heading and intro; one `Skeleton` per finalist in the poster's shape (`rounded-sm`) and one title line, once the candidate count is known (3 until then); the row from the seats; `Lock in` disabled. The countdown shows as soon as the round is read. Cards arriving fade in (`layout.fadeIn`); no frame moves |
| **Ranking, none tapped** | Faint numbers 1 to n |
| **Ranking, some tapped** | Solid numbers on the tapped, faint numbers after them |
| **Ranking, all tapped** | Every badge solid |
| **Vetoed** | The stamp on one poster, no badge on it, faint numbers on the rest skip it |
| **No veto left** (`vetoes_left` 0) | `finale:intro.noVeto`; long presses do nothing |
| **Ranked vote** (`kind` `ranked_vote`) | `finale:title.ranked`, `finale:heading.ranked`, `finale:intro.rank`; no veto anywhere |
| **Sending** | As in [Locking in](#locking-in) |
| **Locked in** | The Locked in look; badges and stamp kept; no taps |
| **The last 10 seconds** | The countdown is red; ticks for the last 5 only if not locked in |
| **Zero, counting** | Counting the votes; posters dimmed; no taps; the close call at plus 2 seconds |
| **Everyone locked in early** (own `ok` with `locked` covering `of`, the `round_progress` event, or `state_changed`) | The countdown leaves at once and Counting the votes shows, whatever the time left |
| **Restart mid-round, not locked in** (`me_locked` false) | A fresh ballot, unless the phone still has one in memory (a trip to the background keeps it; a cold start doesn't). The countdown starts at the time left, with no animation and no catch-up ticks. The posters show at once, no stagger |
| **Restart mid-round, locked in** (`me_locked` true) | The Locked in look. Badges and stamp if the phone still has them; otherwise none, not even faint numbers (the server never sends a ballot back) |
| **Restart past zero** | Counting the votes, and the close call goes out at once |
| **Offline** | `RoomBanner` (`common:states.offlineRoom`). Ranking and the veto work. A lock-in shows Sending with `finale:hint.offline` and is sent again each second until the room moves on. If it never gets through, the phone moves on with the others and nothing says so |
| **The round or candidates can't be read** | In place of the finalists, `finale:error.load` in `body-m`, tone `secondary`, and `Button` secondary S `common:actions.retry`, inline. The countdown and the row stay if known. Read again by itself when back online |
| **The cards can't be read** (the round is) | The frames with `Icon` `film`, no title; under the posters `finale:error.posters` and `Button` secondary S `common:actions.retry`. Ranking, the veto and Lock in still work (the ballot needs only the ids) |
| **No open round** (it closed between the room read and the round read) | Counting the votes, and the room is re-read |
| **Done** (`state_changed {state: 'done'}`) | The layout moves to the winner screen, which fades in (winner.md, "How it arrives"). Until M6.31 the `Reveal` slot renders nothing (Q15.4) |
| **Abandoned** | The layout moves to the closed screen |
| **Joining during the round** | A new player is refused on the join sheet (`join:errors.inFinale`) and never sees this screen. An existing seat that rejoins gets here and can vote while the round is open |

**Sizes.**

- **2 finalists:** two 144-wide posters, centred. **3:** 105 wide. **4:** 76 wide.
- **A long title** wraps to 2 lines, then an ellipsis.
- **375 by 667** (the smallest iPhone): 3 finalists and up to 9 seats fit without scrolling; 4 finalists fit too (shorter posters); a second row of avatars scrolls a little. Lock in is always pinned.
- **The largest text size:** the heading keeps 2 lines at `display-m`'s capped scale; the intro and titles grow and the body scrolls; badge numbers keep their size; the Lock in label stays on one line ("VALIDER MON VOTE" fits at 375 points).

**Answers the screen can get.** Statuses are answers, not errors.

| Call and answer | What the player sees |
| --- | --- |
| `castBallot` `ok {locked, of}` | Locked in; the row updates from `locked` |
| `castBallot` `already_voted` | Locked in, the same |
| `castBallot` `closed` (a late lock-in) | Counting the votes, nothing else |
| `castBallot` `not_in_room` | Home, as a seat that left (`useExitRoomToHome`), no toast |
| `castBallot` `invalid` | Sentry. The ballot unfreezes, the button is Lock in again, the status line says `finale:error.send` |
| `castBallot` `no_veto` | Sentry, and the seat is re-read: with `vetoes_left` 0 the stamp is lifted and the veto control goes. Then as `invalid` |
| `castBallot` fails (network, server) | Stays Sending and is sent again each second until the room moves on |
| `closeRoundStage` `not_yet {closes_at}` | Nothing; called again each second |
| `closeRoundStage` `ok`, `closed` | Nothing; the phone waits for `done` |
| `closeRoundStage` fails | Nothing; called again each second |
| `roundProgress` `ok` | The row, the count and `me_locked` |
| `roundProgress` fails | The row starts all dim and fills from the next `round_progress` event |
| Votes still queued from the swipe screen answer `closed` | Dropped quietly |

## Copy (`finale` namespace)

A new file pair, `i18n/locales/fr/finale.json` and `en/finale.json`, registered in `i18n/resources.ts` and `i18next.d.ts`. Glossary: "the Final Cut" is "le Final Cut" and "Pick one. Veto one." is « Choisis-en un. Élimine-en un. » (both proposed); a veto is "élimination" in French, "Veto" stays the English word. No exclamation marks: this is a tense moment, not a celebration. The reveal's keys are M6.31's ([Decided](#decided) 1).

| Key | French | English |
| --- | --- | --- |
| `title.finalCut` | Final Cut | Final Cut |
| `title.ranked` | Vote final | Final vote |
| `heading.finalCut` | Choisis-en un. Élimine-en un. | Pick one. Veto one. |
| `heading.ranked` | Classe-les. | Rank them. |
| `intro.veto` | Touche les affiches dans ton ordre, ta préférée d'abord. Appui long sur une affiche pour l'éliminer : c'est secret jusqu'à la fin. | Tap the posters in your order, favourite first. Long-press one to veto it: it stays secret until the end. |
| `intro.noVeto` | Tu as déjà utilisé ton élimination. Touche les affiches dans ton ordre, ta préférée d'abord. | You've used your veto this game. Tap the posters in your order, favourite first. |
| `intro.rank` | Touche les affiches dans ton ordre, ta préférée d'abord. Les autres suivent dans l'ordre affiché. | Tap the posters in your order, favourite first. The rest follow in the order shown. |
| `lockIn` | Valider mon vote | Lock in my vote |
| `sending` | Envoi | Sending |
| `hint.sending` | Envoi de ton vote… | Sending your vote… |
| `hint.offline` | Tu es hors ligne. Ton vote part dès ton retour. | You're offline. Your vote goes as soon as you're back. |
| `hint.liftVeto` | Appui long à nouveau pour annuler l'élimination. | Long-press it again to lift the veto. |
| `locked.title` | Vote validé | Locked in |
| `locked.count_one` | {{count}} sur {{of}} a validé | {{count}} of {{of}} locked in |
| `locked.count_other` | {{count}} sur {{of}} ont validé | {{count}} of {{of}} locked in |
| `counting.title` | On compte les votes | Counting the votes |
| `counting.slow` | On compte encore. Une seconde. | Still counting. Hang on. |
| `error.load` | Impossible de charger les finalistes. | Couldn't load the finalists. |
| `error.posters` | Impossible de charger les affiches. Tu peux quand même voter. | Couldn't load the posters. You can still vote. |
| `error.send` | Ton vote n'est pas passé. Réessaie. | Your vote didn't go through. Try again. |
| `a11y.heading.finalCut` | Le Final Cut. Choisis-en un. Élimine-en un. | The Final Cut. Pick one. Veto one. |
| `a11y.heading.ranked` | Le vote final. Classe-les. | The final vote. Rank them. |
| `a11y.film` | {{title}}, {{year}} | {{title}}, {{year}} |
| `a11y.state.ranked` | Position {{rank}} | Ranked {{rank}} |
| `a11y.state.unranked` | Pas classé, compte en position {{rank}} | Not ranked, counts as {{rank}} |
| `a11y.state.vetoed` | Éliminé | Vetoed |
| `a11y.actions.rankNext` | Classer ensuite | Rank next |
| `a11y.actions.removeRank` | Retirer du classement | Remove from ranking |
| `a11y.actions.veto` | Éliminer | Veto |
| `a11y.actions.liftVeto` | Annuler l'élimination | Lift veto |
| `a11y.vetoLifted` | Élimination annulée | Veto lifted |
| `a11y.timeLeft_one` | Encore {{count}} seconde | {{count}} second left |
| `a11y.timeLeft_other` | Encore {{count}} secondes | {{count}} seconds left |
| `a11y.lockedRow` | Ont validé : {{names}}. {{count}} | Locked in: {{names}}. {{count}} |
| `a11y.lockedRowNone` | Personne n'a encore validé. {{count}} | Nobody has locked in yet. {{count}} |
| `a11y.lockInHint` | Envoie ton classement. Impossible de le changer ensuite. | Sends your order. You can't change it afterwards. |

`{{count}}` in the row keys is `locked.count`. Names are joined with `Intl.ListFormat` (`formatList`). `a11y.film` drops the year when it's unknown. "VALIDER MON VOTE", "VOTE VALIDÉ" and "ON COMPTE LES VOTES" fit their space at 375 points.

In `common` (for `Countdown`, a `ui/` component): `countdown.a11y_one` "Encore {{count}} seconde" / "{{count}} second left", `countdown.a11y_other` "Encore {{count}} secondes" / "{{count}} seconds left". `finale:a11y.timeLeft_*` reuses the same text for the announcements.

## Motion, haptics, sound

From the beat; every duration is a token from `@/theme/motion`.

| Moment | Motion | Haptic |
| --- | --- | --- |
| Arrival | Screen `layout.fadeIn`; posters `layout.popIn`, staggered by `duration.instant` | None |
| Rank or unrank | Badge pop `spring.snappy`; ring colour `duration.fast`; numbers change in place | `haptics.press()` |
| Holding a poster (veto allowed) | Sinks 4 points, `timing.press`; back with `timing.release` | None |
| Veto lands | Stamp `layout.popIn`; poster to `opacity-disabled`, `duration.fast` | `haptics.veto()`, once |
| Veto lifted or moved | Old stamp `layout.fadeOut`; a moved one pops on the new poster | None |
| Lock in | Button press; Sending; Locked in look crossfades (`duration.fast`), check `spring.snappy` | The button's `press` only, no `commit` |
| Someone locks in | Avatar opacity `duration.fast`, check `spring.snappy` | None |
| Last 10 seconds | `Countdown` turns red | None |
| Last 5 seconds | None | `haptics.countdown()` each second, only before lock-in |
| Zero, or everyone locked in | Countdown `layout.fadeOut`; Counting `layout.fadeIn`; posters to `opacity-stack-near`, `timing.base` | None |
| Done | The winner screen fades in | None |

**No sound.** The reveal's `playSound('reveal')` is M6.31's.

**The veto's buzz** fires as the stamp starts popping, not 250 ms later when the pop ends: the arcade curve reaches full size early, and a late buzz feels disconnected. A starting point for the feel check.

## Accessibility

- **On arrival, focus goes to the heading** (role `header`), read as `finale:a11y.heading.finalCut` or `.ranked`, then the countdown.
- **Focus order:** the leave button, the heading, the countdown, the intro, the finalists in seed order, the lock-in row, the button, the status line.
- **Each finalist is one element** (role `button`): `a11y.film`, then its state (`a11y.state.ranked`, `.unranked` with the faint number, or `.vetoed`). A double tap does what a tap does. **Custom actions**, only the ones that apply: `rankNext` (untapped), `removeRank` (ranked), `veto` (veto allowed, not vetoed; on another poster it moves the veto), `liftVeto` (vetoed). After an action the new state is announced politely (`a11y.state.*`, `a11y.vetoLifted`) and focus stays on the poster. Ranking and the veto need no gesture. Once locked or counting, no actions; the state is still read.
- **The countdown** (`accessibilityRole="timer"`) reads `common:countdown.a11y_*`. It is not announced every second: the screen announces `finale:a11y.timeLeft_*` at 30 and 10 seconds, and `finale:counting.title` at zero or when everyone has locked in.
- **The lock-in row is one element:** `a11y.lockedRow` with the locked seats' names in seat order, or `a11y.lockedRowNone`. A change is announced politely with the count only (`locked.count`), never a name.
- **Lock in** has the hint `a11y.lockInHint`. Sending is `busy`. Once locked, the panel reads `locked.title`.
- **Reduce Motion:** the posters fade in together (`layout.fadeIn`), no stagger. Badges and checks fade in and out; numbers change in place. The poster doesn't sink. The stamp fades in at full size (`duration.fast`). The countdown still turns red. Haptics are unchanged.
- Android's back and the edge swipe open the leave alert, as on the swipe screen.

## Never shown

- Who vetoed, how many vetoes there are, or which film anyone vetoed. The stamp is on this phone only.
- How anyone ranked, which film is ahead, or any points.
- The order in which people locked in, beyond the live lights.
- "Waiting for Sam", "deciding", or any line naming who hasn't locked in. No nudge, no buzz on another player's phone, no extra time.
- "Your vote didn't count" for a player who didn't lock in. Everyone sees Counting the votes.
- Another seat's `vetoes_left` (null for seats the phone doesn't control).
- A details sheet or a card back for a finalist.

## The reveal (M6.31)

Written with M6.31, after its beat in [the signature moments](../moments.md). Until then the close goes straight to the winner screen (Q15.4), and `Reveal` renders nothing.

## Design-system changes

- **`Countdown`** (`ui/countdown`): its `accessibilityLabel` becomes `common:countdown.a11y_*` with the seconds left (a screen reader reads "0:42" badly), through `t()`. Its gallery entry is unchanged. No new prop: the 60-second cap is the screen's (`features/finale/countdown.ts`), and `tick` already exists.
- No new token, no new `ui/` or `shared/` component. If a second screen needs the finalist (the reveal is the same screen), it stays here.

## Differences from the Figma

- **The lock-in row:** the Figma's `PlayerPill`s with "locked in" and "deciding" become dim and lit avatars with a check and a count. "Deciding" next to a name is a line naming who hasn't locked in, which the beat rules out.
- **The ordinal tags** under each title (1ST, 2ND, VETOED) are gone: the badge carries the place, the stamp the veto. The year is added under the title (question 10).
- **Untapped posters** carry faint numbers (the beat, Q15.5); the Figma's grey badges with bright numbers read as already ranked.
- **The vetoed poster** stays visible, dimmed under the `ban` stamp, instead of a full `nope-soft` cover, so the player still sees which film they knocked out.
- **The stamp is the `ban` icon** (the Figma's mark), not the beat's word "Veto": it reads in both languages and fits a 76-point poster. It still pops on with the arcade overshoot, as the beat asks.
- **Rings:** every ranked poster gets `border-2` accent (strokes are 1, 1.5 and 2; the Figma's first poster had 3), and the first also `glow-accent`.
- **Posters keep their 2:3 shape** instead of a 166-high frame that crops them, and narrow with the finalist count.
- **The top bar** has no back (leaving a room isn't "back"); the leave `x` is its action.
- **The instructions** drop "your first gets 4 points": the points depend on the finalist count, and the faint numbers already show the order. The footer's "Tap a poster to reorder" hint becomes the status line (Sending, offline, lifting the veto).
- The countdown's border is `marquee-default` (the code), not the Figma's `marquee-strong`.

## Decided

On 4 November 2026:

1. **The reveal's keys.** M6.31 adds the reveal's own keys to `finale.json`; M6.15 doesn't. M6.31 starts only after M6.15 has merged, so the two never share the file at once (decided by the coordinator, since it's sequencing).
2. **The French for "locked in" and the ranked vote.** Harry kept "Vote validé", "{{count}} sur {{of}} ont validé" and "Vote final", marked proposed in the copy glossary until the first playtest ([decisions.md](../../decisions.md)).

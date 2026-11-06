# The Final Cut

Screen 15 Final cut (`99:4187`) on the Figma's First release page. Route `/room/[id]/final-cut`, under the room layout (`/room/[id]/_layout.tsx`), shown while the room is `finale`. Built in M6.15; the reveal is M6.31. Written on 4 November 2026 from [the Final Cut](../moments.md#the-final-cut) (the beat, which wins over this spec where they differ), [the vote](../../product/game-modes.md#the-vote-pick-one-veto-one), [what players see](../../product/game-modes.md#what-players-see-party-and-blind), M6.5's contract and slices 12 and 13's plan. Harry took Q15.1 to Q15.5 and Q5.1 to Q5.5 on 4 November 2026 ([decisions.md](../../decisions.md)), and the beat's questions 9 (a veto can be taken back until lock-in) and 10 (poster, title and year, no details sheet) the same day. Updated on 5 November 2026 (M6.33, built in M6.38) for the shortlist: the vote between 2 matches with no veto, and the fixed line on where the films came from ([the finalists](../../product/game-modes.md#the-finalists)).

## Purpose

Swiping is over without a pick, so the room votes in 60 seconds: on its 3 matches (the third match ended swiping), on its 2 matches (swiping ended with 2), or on 3 or 4 finalists from the swipes (it ended with none). In Final Cut mode, 1 or 2 matches are seeded first and the vote is filled. The couch talks; each phone keeps its own secret ballot. A player ranks by tapping posters, may veto one (Final Cut only), and locks in. The only thing the room learns while it runs is who has locked in. It should feel short, a little tense and fair, and most rounds should end before zero because everyone locked in.

## Layout

`Screen` with `scroll` and `footer`, on `bg-bg-canvas`. The body scrolls only when it must (10 seats, the largest text); the footer is always pinned.

1. **The top bar:** `TopBar`, no back, `title` `finale:title.finalCut` (`finale:title.ranked` in a ranked vote, 2 films included: the title follows the round's kind), `action` `{ icon: 'x', accessibilityLabel: lobby:a11y.leave }`. It opens the same leave alert as the lobby and the swipe screen (`lobby:leave.*`); the room layout's `RoomLeaveGuard` already covers the edge swipe and Android's back. A ballot already locked in still counts after leaving.
2. **`RoomBanner`**, in the flow, as on every room screen (reconnecting, offline).
3. **The body**, `px-5 pt-2 pb-3 gap-4`:
   1. **The heading row**, `flex-row items-start gap-3`: the heading in `display-m`, tone `primary`, `flex-1`, at most 2 lines (`finale:heading.finalCut`, `finale:heading.ranked`, or `finale:heading.pickOne` with 2 films); then `Countdown` (see [The countdown](#the-countdown)). French wraps to two lines at 375 points.
   2. **The intro**, `gap-1`, two lines of text:
      - the instructions, `body-m`, tone `secondary`: `finale:intro.veto` in a Final Cut with a veto left, `finale:intro.noVeto` with `vetoes_left` 0, `finale:intro.rank` in a ranked vote of 3 or 4, `finale:intro.pickOne` with 2 films;
      - **where the films came from**, `body-s`, tone `muted`: `finale:intro.source`, "From your likes, with one for each of you when we can." The same line on every round, in every room: from the swipes, between matches, 2 films or 4, Party or Blind. A line that changed with the room ("everyone has a film here") would tell the room when someone was left out, so it never changes (decided on 5 November 2026, question 8).
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

**Components:** `Screen`, `TopBar`, `RoomBanner`, `Text`, `Countdown`, `Poster`, `Icon`, `Pressable`, `Avatar`, `Button`, `Skeleton`. Screen pieces in `components/screens/final-cut/`: `FinalCutScreen` (`final-cut-screen.tsx`), `Finalist` (`finalist.tsx`), `LockInRow` (`lock-in-row.tsx`), `LockInFooter` (`lock-in-footer.tsx`), and `Reveal` (`reveal.tsx`, the slot M6.31 fills: [The reveal](#the-reveal)). No new `ui/` or `shared/` component; the reveal adds duration tokens. One small change to `Countdown` ([Design-system changes](#design-system-changes)).

**Where the data comes from.** `api.rounds` (the open round: `id`, `kind`, `stage_closes_at`), `api.round_candidates` (`title_id`, `seed`), the cards through `api.title_cards` (one call for every finalist, the stack's held cards first, as `useMatchCard` does), `api.room_seats` (the seats for the row, `vetoes_left` on the phone's own seat) and `api.roundProgress` (`locked`, `of`, `me_locked`) on open. Then `round_progress` events. `finale_started` may prefetch the cards and posters while the swipe screen is still up; only `state_changed` moves the phone here.

## Ranking

- **A tap on an untapped poster** gives it the next number: its faint badge turns solid with a pop (`spring.snappy`) and the ring turns accent. The other faint numbers change in place. `haptics.press()`.
- **A tap on a ranked poster** takes its number off: its badge goes back to faint, the ring back to `border-strong`, and the ranked numbers after it close the gap in place. `haptics.press()`.
- **The posters never move.** Only badges, rings and the stamp change, so nothing slides out from under a finger.
- **None tapped:** every poster shows a faint number, 1 to n in seed order. Locking in sends that order.
- **Some tapped:** solid numbers 1 to k on the tapped ones, faint numbers k+1 onward on the rest, in seed order.
- **All tapped:** every badge solid.
- **A tap on the vetoed poster** does nothing to the order and has no haptic. The status line says `finale:hint.liftVeto` until the next action.

**With 2 films** ("Pick one", kind `ranked_vote`; Quick Match with 2 matches at any room size, and Date Night). Ranking two films is choosing one, so a tap picks:

- **None picked:** faint 1 and faint 2 in seed order, as in any round, so the player sees what Lock in sends untouched.
- **A tap on a film** picks it: its badge turns solid 1 with the pop (`spring.snappy`), its ring turns accent with `glow-accent`, and the other film shows a faint 2. `haptics.press()`.
- **A tap on the other film** moves the pick there: the first goes back to faint 2, the second turns solid 1. One `haptics.press()`. It never ranks a solid 2: there is nothing left to choose.
- **A tap on the picked film** lifts the pick: both go back to faint numbers in seed order. `haptics.press()`.
- The ballot is the same ranking as ever (the pick first), so `api.cast_ballot` and the counting don't change. `tapPick` in `features/finale/ballot.ts` adds the move for 2 films.

## The veto

Only in a Final Cut (`kind` `final_cut`) with `vetoes_left` 1 or more on the phone's seat.

- **The press:** while a finger is held, the poster frame sinks 4 points (the arcade lip's travel, `timing.press`). Released before the system's long-press time: it springs back (`timing.release`) and counts as a tap.
- **Vetoing:** at the long-press time the stamp pops on (`layout.popIn`, the arcade overshoot), the poster dims to `opacity-disabled`, the ring turns nope, and `haptics.veto()` fires with the stamp. If the film was ranked, it leaves the ranking and the numbers after it close the gap. Its badge goes; the faint numbers on the others update.
- **Lifting it:** a long press on the vetoed poster lifts the veto. The stamp fades out (`layout.fadeOut`), the poster comes back to full opacity with a faint number. It doesn't get its old rank back. No haptic.
- **Moving it:** a long press on another poster moves the veto there: the old stamp fades out and the new one pops on, the new film leaves the ranking if it was in it. No haptic (moving is silent; `haptics.veto()` is for a veto landing on a poster that had none anywhere).
- **One veto at most** on the screen at any time. It is spent only at lock-in.
- **No veto control** in a ranked vote (2 films included) or with `vetoes_left` 0: no sink, no stamp, no hint, and a long press does nothing (it doesn't count as a tap either).

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
| **Arriving** (`state_changed {state: 'finale'}` on the swipe screen; after the third match, once the shortlisted beat ends, [swipe.md](swipe.md#the-shortlisted-beat)) | The screen fades in (`layout.fadeIn`, `duration.base`): heading, countdown at the time left, the row with every avatar dim. The posters pop in one by one in seed order (`layout.popIn`, one every `duration.instant`), each with its faint number. No haptic, no sound |
| **Loading** (a cold open, or the cards not here yet) | The heading and intro; one `Skeleton` per finalist in the poster's shape (`rounded-sm`) and one title line, once the candidate count is known (3 until then); the row from the seats; `Lock in` disabled. The countdown shows as soon as the round is read. Cards arriving fade in (`layout.fadeIn`); no frame moves |
| **Ranking, none tapped** | Faint numbers 1 to n |
| **Ranking, some tapped** | Solid numbers on the tapped, faint numbers after them |
| **Ranking, all tapped** | Every badge solid |
| **Vetoed** | The stamp on one poster, no badge on it, faint numbers on the rest skip it |
| **No veto left** (`vetoes_left` 0) | `finale:intro.noVeto`; long presses do nothing |
| **Ranked vote** (`kind` `ranked_vote`, 3 or 4 films) | `finale:title.ranked`, `finale:heading.ranked`, `finale:intro.rank`; no veto anywhere |
| **Two films** (`kind` `ranked_vote`, 2 candidates) | `finale:title.ranked`, `finale:heading.pickOne`, `finale:intro.pickOne`; two 144-wide posters, centred; faint 1 and 2 until a pick, then solid 1 on the pick and faint 2 on the other ([Ranking](#ranking)); no veto anywhere. The lock-in row, the countdown and Lock in as in any round |
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
| **Done** (the finale `match` event, then `state_changed {state: 'done'}`) | [The reveal](#the-reveal) plays here, then the layout moves to the winner screen. Until M6.31 the `Reveal` slot renders nothing and the winner screen fades in at once (Q15.4) |
| **Abandoned** | The layout moves to the closed screen |
| **Joining during the round** | A new player is refused on the join sheet (`join:errors.inFinale`) and never sees this screen. An existing seat that rejoins gets here and can vote while the round is open |

**Sizes.**

- **2 finalists:** two 144-wide posters, centred. **3:** 105 wide. **4:** 76 wide.
- **A long title** wraps to 2 lines, then an ellipsis.
- **375 by 667** (the smallest iPhone): 3 finalists and up to 9 seats fit without scrolling; 4 finalists fit too (shorter posters); a second row of avatars scrolls a little. Lock in is always pinned.
- **The line on where the films came from** takes 2 lines of `body-s` at 375 points in French, 1 or 2 in English (about 36 points). M6.38 checks the 375 by 667 claims above with it on the simulator; if 4 finalists and 9 seats no longer fit, the body scrolls and Lock in stays pinned.
- **The largest text size:** the heading keeps 2 lines at `display-m`'s capped scale; the intro, the source line and the titles grow and the body scrolls; badge numbers keep their size; the Lock in label stays on one line ("VALIDER MON VOTE" fits at 375 points).

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
| `heading.pickOne` | Choisis-en un. | Pick one. |
| `intro.veto` | Touche les affiches dans ton ordre, ta préférée d'abord. Appui long sur une affiche pour l'éliminer : c'est secret jusqu'à la fin. | Tap the posters in your order, favourite first. Long-press one to veto it: it stays secret until the end. |
| `intro.noVeto` | Tu as déjà utilisé ton élimination. Touche les affiches dans ton ordre, ta préférée d'abord. | You've used your veto this game. Tap the posters in your order, favourite first. |
| `intro.rank` | Touche les affiches dans ton ordre, ta préférée d'abord. Les autres suivent dans l'ordre affiché. | Tap the posters in your order, favourite first. The rest follow in the order shown. |
| `intro.pickOne` | Touche celui que tu préfères. Sans choix, ton vote va au numéro 1. | Tap the one you'd rather watch. If you tap nothing, your vote goes to number 1. |
| `intro.source` | Tirés de vos j'aime, avec un film pour chacun quand c'est possible. | From your likes, with one for each of you when we can. |
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
| `a11y.heading.pickOne` | Le vote final. Choisis-en un. | The final vote. Pick one. |
| `a11y.film` | {{title}}, {{year}} | {{title}}, {{year}} |
| `a11y.state.ranked` | Position {{rank}} | Ranked {{rank}} |
| `a11y.state.unranked` | Pas classé, compte en position {{rank}} | Not ranked, counts as {{rank}} |
| `a11y.state.vetoed` | Éliminé | Vetoed |
| `a11y.state.picked` | Ton choix | Your pick |
| `a11y.state.notPicked` | Pas choisi, compte en position {{rank}} | Not picked, counts as {{rank}} |
| `a11y.actions.rankNext` | Classer ensuite | Rank next |
| `a11y.actions.removeRank` | Retirer du classement | Remove from ranking |
| `a11y.actions.veto` | Éliminer | Veto |
| `a11y.actions.liftVeto` | Annuler l'élimination | Lift veto |
| `a11y.actions.pick` | Choisir | Pick |
| `a11y.actions.unpick` | Annuler mon choix | Remove my pick |
| `a11y.vetoLifted` | Élimination annulée | Veto lifted |
| `a11y.timeLeft_one` | Encore {{count}} seconde | {{count}} second left |
| `a11y.timeLeft_other` | Encore {{count}} secondes | {{count}} seconds left |
| `a11y.lockedRow` | Ont validé : {{names}}. {{count}} | Locked in: {{names}}. {{count}} |
| `a11y.lockedRowNone` | Personne n'a encore validé. {{count}} | Nobody has locked in yet. {{count}} |
| `a11y.lockInHint` | Envoie ton classement. Impossible de le changer ensuite. | Sends your order. You can't change it afterwards. |

M6.38 adds `heading.pickOne`, `intro.pickOne`, `intro.source`, `a11y.heading.pickOne`, `a11y.state.picked`, `a11y.state.notPicked`, `a11y.actions.pick` and `a11y.actions.unpick` to both files. `intro.source` is the decided line (5 November 2026, question 8), word for word in both languages.

`{{count}}` in the row keys is `locked.count`. Names are joined with `Intl.ListFormat` (`formatList`). `a11y.film` drops the year when it's unknown. "VALIDER MON VOTE", "VOTE VALIDÉ" and "ON COMPTE LES VOTES" fit their space at 375 points.

In `common` (for `Countdown`, a `ui/` component): `countdown.a11y_one` "Encore {{count}} seconde" / "{{count}} second left", `countdown.a11y_other` "Encore {{count}} secondes" / "{{count}} seconds left". `finale:a11y.timeLeft_*` reuses the same text for the announcements.

## Motion, haptics, sound

From the beat; every duration is a token from `@/theme/motion`.

| Moment | Motion | Haptic |
| --- | --- | --- |
| Arrival | Screen `layout.fadeIn`; posters `layout.popIn`, staggered by `duration.instant` | None |
| Rank or unrank | Badge pop `spring.snappy`; ring colour `duration.fast`; numbers change in place | `haptics.press()` |
| Holding a poster (veto allowed) | Sinks 4 points, `timing.press`; back with `timing.release` | None |
| Veto lands | Stamp `layout.popIn`; poster to `opacity-disabled`, `duration.fast` | `haptics.veto()`, once, with the stamp's sound |
| Veto lifted or moved | Old stamp `layout.fadeOut`; a moved one pops on the new poster | None |
| Lock in | Button press; Sending; Locked in look crossfades (`duration.fast`), check `spring.snappy` | The button's `press` and the latch on press-in, no `commit` |
| Someone locks in | Avatar opacity `duration.fast`, check `spring.snappy` | None |
| Last 10 seconds | `Countdown` turns red | None |
| Last 5 seconds | None | `haptics.countdown()` each second, only before lock-in |
| Zero, or everyone locked in | Countdown `layout.fadeOut`; Counting `layout.fadeIn`; posters to `opacity-stack-near`, `timing.base` | None |
| Done | [The reveal](#the-reveal) | [The reveal](#the-reveal) |

**Sound during the round:** the veto's stamp when it lands (this phone only, [sounds.md](../sounds.md#the-veto)), the countdown's tick on each of the last 5 seconds, with `haptics.countdown()` and only before lock-in ([sounds.md](../sounds.md#the-final-cuts-last-5-seconds)), and Lock in's latch on press-in ([sounds.md](../sounds.md#locking-in)). Moving or lifting a veto is silent. The reveal plays `playSound('reveal')` once ([The sequence](#the-sequence)).

**The veto's buzz** fires as the stamp starts popping, not 250 ms later when the pop ends: the arcade curve reaches full size early, and a late buzz feels disconnected. A starting point for the feel check.

## Accessibility

- **On arrival, focus goes to the heading** (role `header`), read as `finale:a11y.heading.finalCut`, `.ranked` or `.pickOne`, then the countdown.
- **Focus order:** the leave button, the heading, the countdown, the intro, the line on where the films came from (`intro.source`, read as it is), the finalists in seed order, the lock-in row, the button, the status line.
- **Each finalist is one element** (role `button`): `a11y.film`, then its state (`a11y.state.ranked`, `.unranked` with the faint number, or `.vetoed`). A double tap does what a tap does. **Custom actions**, only the ones that apply: `rankNext` (untapped), `removeRank` (ranked), `veto` (veto allowed, not vetoed; on another poster it moves the veto), `liftVeto` (vetoed). After an action the new state is announced politely (`a11y.state.*`, `a11y.vetoLifted`) and focus stays on the poster. **With 2 films** the state is `a11y.state.picked` or `a11y.state.notPicked` (with the faint number), and the actions are `pick` (not picked) and `unpick` (picked). Ranking and the veto need no gesture. Once locked or counting, no actions; the state is still read.
- **The countdown** (`accessibilityRole="timer"`) reads `common:countdown.a11y_*`. It is not announced every second: the screen announces `finale:a11y.timeLeft_*` at 30 and 10 seconds, and `finale:counting.title` at zero or when everyone has locked in.
- **The lock-in row is one element:** `a11y.lockedRow` with the locked seats' names in seat order, or `a11y.lockedRowNone`. A change is announced politely with the count only (`locked.count`), never a name.
- **Lock in** has the hint `a11y.lockInHint`. Sending is `busy`. Once locked, the panel reads `locked.title`.
- **Reduce Motion:** the posters fade in together (`layout.fadeIn`), no stagger. Badges and checks fade in and out; numbers change in place. The poster doesn't sink. The stamp fades in at full size (`duration.fast`). The countdown still turns red. Haptics are unchanged.
- Android's back and the edge swipe open the leave alert, as on the swipe screen.

## Never shown

- Who vetoed, how many vetoes there are, or which film anyone vetoed. The stamp is on this phone only.
- How anyone ranked, which film is ahead, or any points while the round runs (the reveal shows the room's points, [The points](#the-points)).
- The order in which people locked in, beyond the live lights.
- "Waiting for Sam", "deciding", or any line naming who hasn't locked in. No nudge, no buzz on another player's phone, no extra time.
- "Your vote didn't count" for a player who didn't lock in. Everyone sees Counting the votes.
- Another seat's `vetoes_left` (null for seats the phone doesn't control).
- A details sheet or a card back for a finalist.
- Whose film a finalist is: no mark, star or avatar on a film this player (or anyone) liked, super liked or matched, and no line that changes with the room. On a couch a neighbour sees your screen, and the films you didn't mark would be the ones you noped (decided on 5 November 2026, question 8). The shortlist's matches are no different from the other finalists here.

## The reveal

Built in M6.31, from [the reveal](../moments.md#the-reveal) (the beat, which wins where this differs). Harry decided its questions 11 to 13 on 4 November 2026: knock-outs show in every room, points only from 3 ballots and never on a knocked-out film, and every time below is a starting value for his feel check ([decisions.md](../../decisions.md)).

The round has closed. On every phone, the same screen shows the room's result in under 5 seconds: the knocked-out films, the points, the winner. Then the winner screen. It shows the room's result, never a ballot, including this phone's own.

### How it starts

- **The signal:** the `match` event with `kind: 'finale'` and `finalists` (`title_id`, `seed`, `points`, `vetoed`), heard through the room's realtime `listen`. Time 0 is this phone's arrival of the event, so phones on a couch land within network latency of each other.
- **The screen:** the Final Cut screen the phone already shows, in whatever look it has (Counting the votes, Locked in, Sending, or still voting if everyone else locked in first). `useRevealHold` returns true from time 0 (or from the waiting look of a missed reveal) to the hand-over, so `state_changed {state: 'done'}` doesn't swap the route. The match overlay never plays for a finale pick (Q15.1).
- **Not on this screen yet** (the phone missed `finale_started` and is still on the swipe screen): the layout replaces the route with `/room/[id]/final-cut` without an animation, in the waiting look of [A phone that missed it](#a-phone-that-missed-it), and the reveal plays from the event as soon as the cards are read.
- **No reveal:** a `only_film` pick (no round, Q4.4), an `only_match` pick (no round: the match overlay plays, [match.md](match.md#when-it-shows)), and a room already in `matchShownStore`. The hold stays false and the layout moves on as before.

### Pieces

No new `ui/` or `shared/` component. The reveal reuses the round's pieces, each with a reveal look:

- **`FinalCutScreen`**: the heading and the reason line; the body scrolls to the top at 0.
- **`Finalist`** gains a `reveal` prop (`out`, `in` or `winner`, and the points when they show). While it's set, the finalist ignores `place`: no badge, no faint number, no stamp of this phone's own, no taps.
- **`LockInFooter`** gains a fifth look, **Where to watch**: `Button` marquee L, `block`, icon `tv`, `match:cta`.
- **`Reveal`** (`reveal.tsx`, the slot M6.15 left): the tap-anywhere layer, Android's back, the announcement and the hand-over timer. It renders nothing before time 0.
- **`Spotlight`** `tone="marquee"`, in the finalists row (see [The winner](#the-winner)).
- **The logic** without JSX in `features/finale/reveal.ts` (the steps and their times, the ballot count, the line, the announcement's parts, the reason on a re-read) and the hold in `use-reveal-hold.ts`.

### The sequence

Every step's time comes from the reveal's duration tokens ([Design-system changes](#design-system-changes)). A step with nothing to show is skipped and the next one moves up.

| Step | Starts at | What every phone shows | Haptic, sound |
| --- | --- | --- | --- |
| **Clear** | 0 | The countdown (if still on), the lock-in row and the footer's look fade out (`layout.fadeOut`); the row leaves the layout. The `TopBar` drops its leave action. Every badge, ring and this phone's own stamp go (`layout.fadeOut`); rings go back to `border border-border-strong`. The posters come back to full opacity where they were (`timing.base`). The intro fades out (`layout.fadeOut`) and its slot shrinks to the reason line's height (Reanimated's `LinearTransition`, `timing.base`), so the posters rise once, here, and nothing moves later. The body scrolls to the top (`duration.base`). Taps and long presses stop; a ballot in flight is dropped quietly | None. `playSound('reveal')` starts at the winner's time minus 894 ms (or here, when that's earlier), so its ta-dum lands with the lift ([sounds.md](../sounds.md#the-reveal)) |
| **Knock-outs** | `duration.reveal-lead` (300 ms) | Every film with `vetoed` true at once: the `ban` stamp (`Icon` 44, `nope-default`) pops on (`layout.popIn`, the arcade overshoot, as in the round), the ring turns `border-2 border-nope-default`. With the stamp the poster falls away: it sinks 4 points (the lip's travel) and fades to `opacity-disabled` (`timing.exit`), keeping its place in the row. No order, no stagger | `haptics.veto()` once, as the stamps start popping |
| **Points** | + `duration.reveal-vetoes` (500 ms) | Only when [the points show](#the-points). On each film still in, the points band fades in (`layout.fadeIn`) and counts up from 0 to its total, all together, over `duration.celebrate` with `easing.standard` (never the arcade curve: a number must not overshoot). The number steps at most every `duration.instant` and lands on the total | None |
| **The winner** | + `duration.reveal-points` (1 s) | The other films still in dim to `opacity-stack-near` (`timing.base`). The winner rises 8 points (`space.8`) with `timing.celebrate` (the arcade overshoot); its ring turns `border-2 border-marquee-default glow-marquee`; the spotlight fades in behind it (`duration.celebrate`, `easing.standard`). The heading swaps to `winner:eyebrow` in tone `marquee` (old text `layout.fadeOut`, new `layout.fadeIn`), and the reason line pops in under it (`layout.popIn`). Where to watch fades in (`layout.fadeIn`). The tap-anywhere layer mounts. The room is marked shown | `haptics.match()` once, with the lift, as the reveal sound's ta-dum lands |
| **Hand-over** | + `duration.reveal-hold` (2.5 s), or the first tap | The layout replaces the screen with `/room/[id]/winner` without a navigation animation; the winner screen fades in with the same poster, still ([winner.md](winner.md#how-it-arrives)) | None |

**The times by case.** "Knock-outs" means at least one finalist has `vetoed` true.

| Case | Knock-outs | Points | Winner | Hand-over |
| --- | --- | --- | --- | --- |
| Knock-outs and points | 300 ms | 800 ms | 1.8 s | 4.3 s |
| Points, no knock-outs (a ranked vote, or nobody vetoed) | | 300 ms | 1.3 s | 3.8 s |
| Knock-outs, no points (`only_unvetoed`, or fewer than 3 ballots) | 300 ms | | 800 ms | 3.3 s |
| Neither (`no_ballots`, or fewer than 3 ballots and no veto) | | | 300 ms | 2.8 s |

**Going on early.** From the winner step, a tap anywhere on the screen, Where to watch, or Android's back goes to the hand-over at once. The tap layer is a `Pressable` (`haptic={false}`, the winner's buzz just fired) under the content, mounted at the winner step, so a touch that started earlier never counts. Before the winner step, Android's back does nothing (it is consumed) and taps do nothing. Where to watch keeps the button's `press` haptic.

### The winner

- **The ring and lift** as in the sequence. The winner keeps its column: rising 8 points never touches a neighbour.
- **The spotlight** is the finalists row's first layer, behind every poster, centred on the winner's poster frame and reaching 24 points (`space.24`) past it on every side (measured with `onLayout`). The row doesn't clip; the radial fade makes the screen edge harmless when the winner is the first or last of 4.
- **The winner is `title_id`** from the event, or `winner_title_id` from `api.rounds` on a re-read.

### The points

- **They show only when** the reason is `points`, at least 2 films are still in, and at least 3 ballots were counted. Never on a knocked-out film.
- **The ballot count, without a read** (`features/finale/reveal.ts`): with n films still in, every ballot gives them n, n minus 1, down to 1 points (a film it vetoed that is still in comes last), so ballots = the films still in's points added up, divided by n × (n + 1) / 2.
- **The band:** on the bottom of each poster still in, `absolute inset-x-0 bottom-0 items-center pt-4 pb-1.5` over `GradientFill gradient="card-scrim"`, the label `finale:reveal.points` in `mono-data`, tone `primary` (`marquee` on the winner from the winner step), one line. It sits on the poster, so nothing reflows when it appears. "40 pts" (10 ballots, 4 films) fits a 76-point poster at `mono-data`'s largest scale.
- **No points:** no band, and the step is skipped. A 2-player room always lands here (decided, question 11).

### Each reason

| `reason` | Steps | The line (`finale:reveal.reason.*`) |
| --- | --- | --- |
| `points` | Knock-outs if any, the points if they show, the winner | `points`. When the points show and the top two films have the same points: `tie` |
| `only_unvetoed` | Knock-outs, then the winner (one film in: no points) | `onlyUnvetoed` |
| `no_ballots` | The winner only | `noBallots`. Never "nobody voted" |
| `only_film` | No reveal (Q4.4): the winner screen as today | |
| `only_match` | No reveal: the match overlay, then the winner screen | |
| Missing or unknown | The steps the data calls for | `points` if points show, otherwise no line |

**On a re-read** the views carry no `reason`, so `reveal.ts` works it out: exactly one film still in with at least one knocked out is `only_unvetoed`; every point 0 and nothing knocked out is `no_ballots`; anything else is `points`. `vetoed` null reads as false.

### A phone that missed it

- **When:** a return to the foreground, a reconnect, a cold start, or `state_changed {state: 'done'}` without the event. The room re-read says `done` with a kind `finale` pick and a closed row in `api.rounds`, and the room isn't in `matchShownStore` (Q31.1).
- **The waiting look** (the layout puts the phone on `/room/[id]/final-cut` without an animation, the hold already true): the heading for the round's kind, no intro, one `Skeleton` per finalist in the poster's shape (3 until the candidates are read), no countdown, no lock-in row, no top bar action, and Counting the votes in the footer. Nothing plays yet.
- **The reads:** `api.rounds` (`kind`, `winner_title_id`), `api.round_candidates` (`seed`, `points`, `vetoed`) and the finalists' cards (`api.title_cards`, one call), together, with a 3-second limit (`REVEAL_READ_LIMIT_MS` in `reveal.ts`: a network limit, not a motion token).
- **In time** (the round and its candidates; the cards may still be on their way): the Skeletons give way to the posters (`layout.fadeIn`) and the reveal plays once, in full, from the Clear step, with the sound and haptics. A card that hasn't come shows its placeholder, which takes the stamp, the band and the spotlight; the poster fades in over it if it arrives.
- **Not in time, or a read fails:** the hand-over at once (the winner screen fades in) and the room counts as shown. The film matters more than the show.
- **Shown** is marked at the winner step, or when the reveal leaves the screen if that comes first (a leave, the timeout). A phone sent to the background before the winner step plays the reveal again from the re-read on its return; after it, the phone goes straight to the winner screen.
- **Once:** a second `match` event, or the event after a re-read started the reveal (or the other way round), plays nothing more.

### The reveal's states

| State | What shows |
| --- | --- |
| **Knock-outs, points, winner** (a Final Cut, 3 or more ballots, a veto landed) | The full sequence, 4.3 s |
| **Two ballots** (a 2-player room, or 2 seats of a bigger room locked in) | Knock-outs, then the winner, no band; the line is `points`, never `tie` |
| **One ballot** | The same: no band. Its knock-out, if any, shows (Decided 3) |
| **A ranked vote** | No knock-outs; the points if 3 or more ballots, then the winner |
| **Two films** | No knock-outs (no veto). With 3 or more ballots, each film's points (each ballot gives 2 and 1, so the ballot count is the total divided by 3), then the winner: 3.8 s. With 2 ballots (a 2-player room, or 2 seats locked in), the winner alone with `points`, never `tie`: 2.8 s. A tie with the points shown says `tie`. The two posters keep their 144-point width; the band and the spotlight fit them as they fit 4 |
| **`only_unvetoed`** | Knock-outs, then the winner with `onlyUnvetoed` |
| **`no_ballots`** | The winner alone, 300 ms after the event, with `noBallots` |
| **Every finalist got a veto** (2 stay in) | Only the films with `vetoed` true take the stamp; the 2 still in show as in, with points if they show |
| **Everyone locked in before zero** | The countdown, still on, fades out at 0 with the rest |
| **This phone was Sending** | The button's spinner fades out with the footer; the ballot is dropped |
| **This phone never locked in** | The same reveal as everyone |
| **A poster not loaded** | The placeholder (thumbhash or `Icon` `film`) takes the stamp, band and spotlight; the poster fades in over it if it comes |
| **A card not read at all** (no title) | The frame with `Icon` `film`; the film is left out of the announcement's names |
| **The leave alert open at 0** | It stays open over the reveal; leaving now goes Home (the room is `done`) |
| **Offline during the reveal** | `RoomBanner` as usual; the reveal plays from the event it already has |
| **The missed reveal, waiting** | As in [A phone that missed it](#a-phone-that-missed-it) |
| **The missed reveal, reads too slow** | The winner screen, at most 3 seconds after the re-read |
| **Background during the reveal** | Before the winner step: the reveal again on return. After it: the winner screen |
| **Screen reader on** | As in [The reveal's accessibility](#the-reveals-accessibility): no automatic hand-over |

**Sizes.** The reveal only takes things away (the row, the intro, the countdown) and changes things in place, so wherever the round fit, the reveal fits.

- **375 by 667, default text:** every state fits without scrolling, with 2, 3 or 4 finalists and any number of seats (the row is gone). Where to watch is pinned in the footer.
- **The largest text size:** the heading keeps 2 lines at `display-m`'s capped scale ("LE FILM DU SOIR" is one line at 375 points). The reason line is `title-m` and wraps to 2 lines at most; its slot is sized to it at 0, so the posters never move after that. The band stays one line ("40 pts" fits 76 points); stamps and the spotlight keep their size. Where to watch ("OÙ REGARDER") stays on one line. If the heading, the line and the posters don't all fit, the body scrolls at 0 to show the finalists row rather than the top: the posters are the reveal.
- **The waiting look** has the loading state's sizes.

### The reveal's copy

Reused, unchanged: `winner:eyebrow` (the heading, "Le film du soir" / "Tonight's pick", Harry kept it), `match:cta` and `match:a11y.cta` (Where to watch), `finale:a11y.film`, `finale:a11y.filmNoYear` and `finale:a11y.state.vetoed`. M6.31 adds these to `finale.json`, both languages (Decided 1). Calm, no exclamation marks, counts only. The French lines are the beat's.

| Key | French | English |
| --- | --- | --- |
| `reveal.reason.points` | En tête des votes | Top of the votes |
| `reveal.reason.tie` | Égalité, départagée par vos swipes | A tie, broken by your swipes |
| `reveal.reason.onlyUnvetoed` | Le seul film que personne n'a éliminé | The only film nobody vetoed |
| `reveal.reason.noBallots` | Le préféré de vos swipes | Top of your swipes |
| `reveal.points_one` | {{count}} pt | {{count}} pt |
| `reveal.points_other` | {{count}} pts | {{count}} pts |
| `reveal.a11y.vetoed_one` | Éliminé : {{titles}}. | Vetoed: {{titles}}. |
| `reveal.a11y.vetoed_other` | Éliminés : {{titles}}. | Vetoed: {{titles}}. |
| `reveal.a11y.pick` | Le film du soir : {{title}}. {{reason}} | Tonight's pick: {{title}}. {{reason}} |
| `reveal.a11y.pickNoTitle` | Le film du soir. {{reason}} | Tonight's pick. {{reason}} |
| `reveal.a11y.points_one` | {{count}} point | {{count}} point |
| `reveal.a11y.points_other` | {{count}} points | {{count}} points |
| `reveal.a11y.winner` | Le film du soir | Tonight's pick |
| `reveal.a11y.winnerPoints_one` | Le film du soir, {{count}} point | Tonight's pick, {{count}} point |
| `reveal.a11y.winnerPoints_other` | Le film du soir, {{count}} points | Tonight's pick, {{count}} points |

`{{titles}}` is joined with `Intl.ListFormat` (`formatList`), in seed order. `{{reason}}` is the line's text, or empty. The points are at least 3 when they show, so `_one` is there for i18next, not the screen. "pts" reads in both languages and fits a 76-point poster.

### The reveal's accessibility

- **At 0**, focus goes to the heading and the result is announced once, assertively: `reveal.a11y.vetoed` with the knocked-out films' titles (only when there are some), then `reveal.a11y.pick` (`pickNoTitle` without the winner's card). The points aren't read here. Example: "Vetoed: Dune, Barbie. Tonight's pick: Heat. The only film nobody vetoed."
- **Each poster is one element** with no actions: `a11y.film`, then `a11y.state.vetoed` (out), `reveal.a11y.points` (in, with points), nothing more (in, no points), or `reveal.a11y.winner` / `winnerPoints` (the winner). The labels change with the steps.
- **Focus order:** the heading, the reason line, the finalists in seed order, Where to watch (`match:a11y.cta` with the winner's title).
- **No automatic hand-over while VoiceOver or TalkBack is on** (`AccessibilityInfo.isScreenReaderEnabled`, as the match overlay): Where to watch goes on. The tap layer is hidden from screen readers. The winner screen then takes focus on its title.
- **Reduce Motion:** the same times, so phones keep in step; every fade uses `ReduceMotion.Never` so it fades rather than jumps. The stamps fade in at full size (`duration.fast`); knocked-out posters fade to `opacity-disabled` without sinking; the bands fade in at their totals without counting; the winner doesn't rise (the others dim, the ring turns, the spotlight fades in); the reason line fades in instead of popping; the intro's slot and the scroll change at once. Haptics and the sound are unchanged.

### What never shows

- Who vetoed (`vetoed_by` never reaches a phone): no avatar, seat name or initial near any film. The lock-in row leaves at 0.
- How many vetoes a film got, or that a film still in was vetoed.
- Any ballot, including this phone's own: its badges and stamp clear at 0.
- Vetoes one after another: they land at once.
- Points from fewer than 3 ballots, points on a knocked-out film, or the tie line without the points.
- "Your vote didn't count", "Nobody voted", or anything about who didn't lock in.
- The match overlay, `MarqueeBulbs` or the match sound.
- A replay button, or a countdown to the winner screen.

### Feel check (for M6.31's pull request)

- [ ] Dev menu, Final Cut fixture, "Play the reveal" with 3 ballots and one veto → the stamps land together at about 300 ms with one veto buzz, the points count up and settle, the winner rises with the match buzz at about 1.8 s.
- [ ] Tap during the knock-outs → nothing. Tap after the winner → the winner screen at once, no slide.
- [ ] Do nothing → the winner screen about 2.5 s after the winner, the poster still.
- [ ] 2 ballots → stamps, no points, the line "Top of the votes". `no_ballots` → the winner alone, quickly.
- [ ] Reduce Motion on → fades only, same rhythm, nothing jumps.
- [ ] VoiceOver on → one announcement, no hand-over until Where to watch.
- [ ] Kill the app right after the close, reopen → the reveal plays once; reopen again → the winner screen.

Both phones: [ ] iPhone [ ] low-end Android

## Design-system changes

- **`Countdown`** (`ui/countdown`): its `accessibilityLabel` becomes `common:countdown.a11y_*` with the seconds left (a screen reader reads "0:42" badly), through `t()`. Its gallery entry is unchanged. No new prop: the 60-second cap is the screen's (`features/finale/countdown.ts`), and `tick` already exists.
- **Tokens (M6.31)**, in `mobile/src/theme/tokens.json` under `duration`, then `mise run tokens`. Each `$description` ends "(a starting value)", since Harry tunes them in his feel check (decided, question 13). The beat named only the last; the three step lengths become tokens too, so the whole rhythm is tuned in one file:
  - `duration.reveal-lead`, 300ms, "The reveal: from the close to the knock-outs (a starting value)";
  - `duration.reveal-vetoes`, 500ms, "The reveal: the knock-outs before the points (a starting value)";
  - `duration.reveal-points`, 1000ms, "The reveal: the points before the winner (a starting value)";
  - `duration.reveal-hold`, 2500ms, "The reveal before the winner screen (a starting value)", as `duration.match-hold` for the overlay.
- No new `ui/` or `shared/` component. `Finalist` and `LockInFooter` gain the reveal looks and stay screen pieces (one screen); `Spotlight`, `GradientFill` and `Button` are used as they are.

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

On 5 November 2026:

3. **Knock-outs with a single ballot.** They show, the same rule in every room size, even though the lock-in row showed who locked in. Harry took the default ([decisions.md](../../decisions.md)); the alternative was the winner alone, with no stamps.

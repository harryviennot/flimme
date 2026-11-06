# Signature moments

The beats of the game's signature moments: when each one happens, what it tells the players, how long it lasts, what every phone in the room sees and when, and what must never be revealed. Written on 3 November 2026 by the game designer agent, before slices 10 (Swiping) and 11 (The match) are planned. This first version covers the swipe, the flip, the near miss and the match. The winner was added on 4 November 2026, before M6.16, and the Final Cut the same day, before M6.15 (with Harry's answers Q5.1, Q5.2, Q5.5 and Q15.1 to Q15.5). The reveal was added the same day, before M6.31 (with Q15.1, Q15.4 and Q31.1). The shortlisted beat was added on 5 November 2026, before M6.37, from the rules Harry decided that day ([up to 3 matches](../product/three-matches-and-fair-finalists.md#decided)): a match joins the room's shortlist and swiping goes on, the third match starts the finale, and the match overlay now plays only for the night's pick. The checkpoint and the solo pick were added the same day (M6.39), from the drafts in [solo mode and My films](../product/solo-and-my-films.md#3-what-solo-ends-with), which Harry decided that day: a player alone swipes with no end, and picks tonight's film from their own likes when they want one.

It builds on [the answers](../product/game-modes.md#the-answers), [when it's a match](../product/game-modes.md#when-its-a-match) and [what players see](../product/game-modes.md#what-players-see-party-and-blind) in the game modes, [the card stack](../architecture/app-structure.md#the-card-stack), [the vote queue](../architecture/app-structure.md#the-vote-queue) and [realtime](../architecture/app-structure.md#realtime) in the app structure, [the first game](../product/onboarding.md#the-first-game) in onboarding, [the signature moments](../agent-workflow.md#the-signature-moments) in the agent workflow, and the `motion` skill (tokens, the haptic vocabulary, the two sounds). The backend facts come from the merged migrations of 3 November 2026: a deal is 25 cards per seat with a shared opening of 10, a vote counts on any active card in the room's pool, "Seen it" saves to the profile, and `api.cast_vote` checks matches (M1.13) while the match rules and their values are M6.1, not yet built.

The game designer writes the beat; the designer turns it into the feel (curves, sizes, layout) in the swipe and match screen specs. Every number below that isn't a motion token is a starting value (see [Starting values](#starting-values)), and every product choice a beat raised is in [Questions for Harry](#questions-for-harry) with a recommended default. Where a beat depends on one of those answers, it says so.

## Contents

1. [What every moment keeps](#what-every-moment-keeps)
2. [The swipe](#the-swipe)
3. [The flip](#the-flip)
4. [The near miss](#the-near-miss)
5. [The match](#the-match)
6. [The winner](#the-winner)
7. [The Final Cut](#the-final-cut)
8. [The reveal](#the-reveal)
9. [The shortlisted beat](#the-shortlisted-beat) (it plays before the match in a game; it comes last here so the links into the other moments keep working)
10. [The checkpoint](#the-checkpoint) (solo)
11. [The solo pick](#the-solo-pick)
12. [Starting values](#starting-values)
13. [Changes this asks elsewhere](#changes-this-asks-elsewhere)
14. [Questions for Harry](#questions-for-harry)

## What every moment keeps

**What reaches the other phones.** Swipes never reach another phone while a game runs (CLAUDE.md rule 6). Only these do, and only as counts:

| Moment | What the other phones get | When |
| --- | --- | --- |
| A swipe | Nothing about the answer. The player's swipe count, in presence, every 5 swipes (the player pills) | Every 5 swipes |
| A flip | Nothing. Whether the card was flipped goes to the server's `swipe_log` with the vote, never to a phone | Never |
| A near miss | A count of likes on one film, `near_miss` with `likes` and `of` | After the like that makes it a near miss |
| A match that joins the shortlist | The film, the kind, the count (`3 of 3`, `7 of 9`), the shortlist's count (`shortlisted` of `shortlist_size`) and `decided: false`, `match` | At once, on every phone |
| A match that is the pick | The film, the kind, the count and `decided: true`, `match` (with `reason: 'only_match'` when the finale found a single match) | At once, on every phone |
| The Final Cut | Which seats have locked in, `round_progress` with `locked` (seat ids) and `of`. Never a ballot, a veto or points | After each lock-in |
| The reveal | The winner, the reason, and each finalist's seed, points and whether it was knocked out, `match` of kind `finale`. Never who vetoed or how anyone ranked | At the close, on every phone |

**Never shown, in any moment:** who noped, who said "Seen it" and didn't want to rewatch, what anyone answered, the order in which people answered, and which player's like completed a match. Avatars always appear in seat order (the order of the player row), never in the order of votes. A count is the most any phone learns during a game.

**Couch rule.** Most groups sit together and can see each other's faces and sometimes screens. A beat must not let a player work out someone's nope from timing: nothing appears on everyone's phone at the moment one person swipes, except the match itself (which only ever says yes). This is why [the near miss](#the-near-miss) shows on the cards still waiting for an answer, not on every phone.

**Haptics** use the vocabulary in `@/lib/haptics`, one meaning each: `commit`, `throw` and `match` here, `shortlist` for the shortlisted beat, `veto` and `countdown` in the Final Cut, `veto` and `match` again in the reveal; `press` comes with every `Pressable`. The shortlisted beat is the only moment that adds a haptic (`haptics.shortlist()`, M6.37): a shortlisted match needs a buzz that says "yes, together", and `match` must keep meaning "this is the night's film". The haptics setting turns all of them off.

**Sound:** the match (`playSound('match')`) and the Final Cut's reveal (`playSound('reveal')`) are the night's two big sounds. Since 6 November 2026 a few small moments have quiet ones too (the game start, arrivals in the lobby, the Final Cut's last 5 seconds, refusals, three buttons). Every sound, its file and its moment: [sounds.md](sounds.md). The beats below say which play; the rest are silent.

**Reduce Motion.** Reanimated skips animations by default when the system setting is on, which would make things jump. Each beat says what replaces its movement: flights become short slides or fades, scales become fades, chases and pulses become still. Fades use opacity only. Haptics and sound don't change with Reduce Motion; they follow their own settings.

**The next card never waits.** No moment blocks the stack except the match, which ends the game, and the shortlisted beat, which holds it for under 2 seconds so the whole couch looks up at the same film. A new touch cancels any animation still running on the top card (the `motion` skill's rule 1); a card already thrown finishes its flight on its own.

## The swipe

### The beat

**An answer in under a second, and it feels like a decision.** The card is a physical thing: it follows the finger exactly, tilts like paper held at one corner, and shows what it's about to say (the stamp) before the finger lets go. Crossing the commit line clicks, so the player knows the answer will count before releasing. Letting go throws the card at the finger's speed, and the next one is already sitting there. The player should never wonder whether a swipe registered, and never wait for anything.

Like, Nope, Seen it and Super like are the four answers; Undo is the safety net that makes swiping fast without fear. The swipe is private: nothing about it reaches the others except, every 5 swipes, how far the player has got.

### The sequence

**Dragging (right is Like, left is Nope, up is Seen it).**

| When | What the player sees |
| --- | --- |
| Finger down | Nothing moves yet (a tap is a flip, below) |
| The finger moves past the touch slop | The card follows the finger 1:1, on the UI thread. It rotates around a point below the card, more the further it goes sideways (up to the tilt at the commit line) |
| Toward an answer | The stamp for that direction (LIKE, NOPE, SEEN IT) fades and grows in with the distance, from nothing at rest to full at the commit line. The card's border takes the answer's color. The matching swipe button goes Lit (`shared/swipe-action`). The card behind grows from its resting scale toward full size, so the next card is visibly ready |
| Crossing the commit line | `haptics.commit()`, once per crossing. Crossing back and forth ticks again each time it goes out, never on the way back |
| Downward or diagonal | No answer for down. Up only counts when the drag is mostly vertical (within the up angle); otherwise the larger sideways direction wins |

**Letting go.**

| Release | What happens |
| --- | --- |
| Past the commit line, or a flick faster than the throw speed in an answer's direction | The card is thrown: it carries the finger's speed off screen (about `duration.slow`, `easing.exit`), keeping its tilt. `haptics.throw()` at release. The vote is appended to the queue at release, not when the flight ends. The next card settles to full size (`spring.snappy`) and is touchable at once |
| Before the line, slowly | The card springs back to the middle (`spring.card`), the stamp and border fade with the distance, no haptic, no vote |

**The buttons** (every answer has one, with a screen-reader label; screen 11 in the Figma). A press gives `haptics.press()` from `Pressable`, then the card plays the same throw in the answer's direction with the stamp at full from the start (`duration.instant`), so the answer is readable even though no finger dragged it, and `haptics.throw()` as it leaves. Buttons can be pressed while the last card is still flying.

**Super like** (the star button, 2 per game). The card takes the `marquee` border and a SUPER LIKE stamp, then flies right like a like. The badge on the star counts down with `layout.popIn`. At 0 the button is disabled (no error haptic: running out isn't a mistake). A super like is spent on the phone at once (the vote queue's rule) and comes back with Undo. Whether the others see a star on a super-liked card is [question 6](#questions-for-harry).

**Seen it.** In the first release every room uses `allow_rewatch`, so "Seen it" is followed by a chip that offers a rewatch (M6.12, M6.49, M6.2):

1. The swipe up (or the eye button) throws the card up as a nope with the SEEN IT stamp and `haptics.throw()`. The film is saved as seen (the M5.4 migration).
2. A chip takes the hint line: "Seen it. Watch it again tonight?" and Yes. Yes turns the answer into a like and shows "Up for a rewatch" for 1.5 s. The chip leaves at the next answer or after 5 seconds (no timer under a screen reader).
3. Undoing brings the card back to its front, without the chip.

Under `hide_seen` (Date Night, after the first release) the card flies straight up and the film leaves the room.

**Undo** (the rewind button). The last card comes back from the side it left, as the reverse of its throw (`timing.base`), lands on top of the stack front side up, and the card that was on top slides back behind it. A super like comes back to the badge. Undo is allowed once in a row: after an undo the button is disabled until the next answer (M6.3, a default to confirm in [the answers](../product/game-modes.md#the-answers)). If the last vote hasn't been sent, it's simply removed from the queue; otherwise the app calls `api.undo_last_vote` once the queue is empty, but the card is already back on screen (the phone never waits). The only refusals in the first release come with the room moving on (the card matched, the finale started), and then the match or the Final Cut takes over the screen anyway.

### Haptics and sound

- `haptics.commit()` at the commit line, `haptics.throw()` on every throw (drag or button), `haptics.press()` from the buttons. Nothing else.
- No sound, ever, for a swipe.

### What the other phones see

Nothing, while the game runs. Presence carries the swipe count every 5 swipes, so the player pills move in steps of 5 (decided for M4.21, Q21.2). The first like on a film moves it into the others' next few cards, which shows them nothing more than a new card.

### Reduce Motion

- The drag still follows the finger (the player drives it), but without the tilt.
- A throw becomes a short slide toward the answer's side with a fade (`timing.base`), not a flight across the screen.
- The stamp appears at full opacity once the commit line is crossed, without growing.
- The card behind is already full size: no scale.
- Undo fades the card back in place.

### Edge cases

- **Fast swipers.** A thrown card finishes its flight on its own while the next one is already draggable. Up to 3 cards can be in flight; nothing waits for a flight to end.
- **Past the mounted cards.** If the player swipes faster than the refill, the stack shows a short loading card rather than an old card the server may have replaced ([the card stack](../architecture/app-structure.md#the-card-stack)). No haptic, no message beyond the card itself.
- **Offline.** Swiping carries on through the cards already on the phone, with "Offline: 6 swipes waiting" ([the vote queue](../architecture/app-structure.md#the-vote-queue)). The feel is identical: the haptics and the throw don't depend on the network. When the buffer runs out, the stack waits for the connection instead of inventing cards.
- **The room moves on mid-drag** (a match, the finale, the room closing). The card springs back to the middle (`spring.card`) and the next screen takes over. Votes still in the queue come back `closed` and are dropped quietly, without "your swipes were lost".
- **A card the deck replaced.** Votes count on any active card in the pool (M5.7), so a card the player answered after a re-rank still counts. Nothing to show.
- **Two seats on one phone** (a controlled seat) are out of scope for these beats.

### First game hints (M6.18)

From [the first game](../product/onboarding.md#the-first-game). The beats that touch motion:

- **Card 1:** after the card has been still for `hintDelay` (below), it leans right to about a third of the commit line, showing the LIKE stamp at the same share, comes back (`spring.card`), then leans left the same way with NOPE, once. "Swipe right to like, left to nope" sits under the card. Any touch cancels the lean at once and gives the card to the finger. No haptic during the lean: the commit line isn't crossed.
- **Card 2:** "Seen it? Swipe up. We'll ask if you'd watch it again." (Q18.1) between the card and the buttons ([swipe](screens/swipe.md#first-game-hints)), with `layout.fadeIn`.
- **Card 3:** "Tap the card for the story", with `layout.fadeIn`.
- **The star, or card 5:** the super likes hint.
- Hints never cover the card or the buttons, and they leave with `layout.fadeOut`. With Reduce Motion the card 1 lean is replaced by the two stamps shown still for a moment, at the same small share.

## The flip

### The beat

**Curiosity without leaving the stack.** "What's this one?" costs a tap and a quarter of a second, never a new screen. The card turns over in place, the story is on the back, and the player answers from either side. It works on any card at any point in the game, the first or the fortieth. Flipping is private and quiet: reading is not an event.

### The sequence

| When | What the player sees |
| --- | --- |
| A tap on the card (not a drag, not a button) | The card turns around its vertical axis in place, `timing.flip` (250 ms). The faces swap at the halfway point. The card behind doesn't move |
| The back (screen 13, `shared/movie-card` Side=Back) | The poster header, the TMDB score, the synopsis, runtime, director and cast, the room's services for the film, the reason label and the Trailer button. Letterboxd ratings wait for M20 |
| A second tap | It turns back the same way |
| Swiping the back | Allowed: the card answers exactly as from the front, with the stamp over the back. The player doesn't have to flip back to answer |
| The buttons | Work from either side |
| The card leaves | Whether it was flipped goes with the vote (see [Changes this asks elsewhere](#changes-this-asks-elsewhere)). The next card always arrives front side up |

Everything on the back is already in the card's payload from `api.my_next_cards` (overview, runtime, directors, cast, providers, trailer key), so a flip never waits on the network, offline included.

**The back doesn't scroll** (default, [question 7](#questions-for-harry)): a scroll inside the card would fight the swipe up for "Seen it". The synopsis is cut to fit the back, with an ellipsis. Since 6 November 2026 (M6.59), a cut synopsis ends with "Read more", which opens the whole text in a sheet over the stack; the back still never scrolls ([swipe](screens/swipe.md#the-card-back-reworked)).

**The trailer** opens outside the game (and is hidden in rooms capped under 13, M7.3). The game doesn't wait: a player away for more than 90 seconds stops counting as present, as for any other app.

### Haptics and sound

None. A flip is reading, not answering, and the vocabulary has no word for it. (A tick on every flip would also tell a neighbour on the couch how often someone hesitates.)

### What the other phones see

Nothing, ever.

### Reduce Motion

The faces crossfade in place (`timing.flip`) instead of turning.

### Edge cases

- **Tap or drag.** A touch that moves past the slop is a drag and never flips. A tap during a throw lands on the next card and flips it.
- **Mid-flip.** A drag that starts during the turn takes the card from where it is; the turn completes (or snaps to the nearer face) while the card moves. A second tap mid-turn reverses it.
- **A match while a card is mid-flip, or on its back.** The match overlay takes over; the card's side no longer matters. If the matched film is the one being read, the overlay's poster is the same film, which is a nice surprise and needs nothing special.
- **Undo** brings the last card back front side up, even if it left flipped.
- **The first game:** the card 3 hint leaves at the first flip. A tap during the card 1 lean cancels the lean and flips.

## The near miss

### The beat

**"So close." A teaser that tells you a film is one yes away, without ever telling anyone who is holding it up.** In Party mode (the only mode in the first release), when a film is one like short of a match, the players who haven't answered it yet see "2 of 3 of you liked this" as the card comes up, and the card glows with the like color. It's the most social moment of the swiping phase: it makes the room feel present on your own phone, and it gives a little lift to films the group nearly agrees on.

It's an invitation, never pressure: a count, no names, no "it's up to you", no buzz, no timer. A player who noped it is never found out, because the others never knew it was close.

### When it shows (depends on questions 1 and 2)

The recommended rule, which changes today's behaviour:

1. **A near miss is a film one like short of the match rule**: 2 of 3, 3 of 4, 4 of 6 (needs 5), 6 of 10 (needs 7). This is the deck engine's own definition for the close phase ("one like short of a match"). It needs at least 2 likes, so a 2-player room never has one: there, "1 of 2" would say exactly what the other person answered.
2. **It shows only on the phones of players who haven't answered that film,** on the card itself, when that card is on top of their stack. Players who already answered see nothing. A player still seeing it is, by definition, a voter who could complete the match, so the film is always still possible.

Today `api.cast_vote` sends `near_miss` to the whole room after every like that leaves a film at 2 likes or more without a match, including films a nope has already made impossible. In bot games under the decided values ([simulations](../product/simulations.md#near-misses)), that's 4 to 51 messages a game for 3 to 10 players, a third to two thirds of them on films that can no longer match. As a toast on every phone, that's one every few seconds in a big group, and mostly false hope. The recommended rule gives about 1 to 2 near misses a game at medium agreement (1.0 to 2.4; 0.3 to 2.2 at low agreement), with at least one in 76 to 98% of games, and the first after 0:28 to 1:00 (medians). Bot tastes are made up; the counts are only as good as the like rate.

### The sequence

| When | What the player sees |
| --- | --- |
| A `near_miss` arrives for a film this player hasn't answered | Nothing yet if it isn't the top card. The phone keeps the latest count for that film for the rest of the game |
| That card reaches the top (or is already there) | A `Toast` in the like tone slides in above the card (`layout.toastIn`): "2 of 3 of you liked this". The card takes the like glow (`Glow/Like`, `glow-like`) around its border. Both arrive together, after the card has settled |
| The card stays on top | The toast and the glow stay. If a new count arrives (someone else liked it, or presence changed), the number changes in place, without a new slide |
| The player drags the card | The glow stays under the drag's border color. A like completes the match (then [the match](#the-match) takes over on every phone); a nope or a "Seen it" No just throws the card as usual |
| The card leaves (any answer) | The toast leaves with it (`layout.toastOut`) |

The toast sits above the card and the first-game hints sit under it, so they never stack. If the player flips the card, the toast and the glow stay.

### Haptics and sound

None. A buzz would be pressure, and on a couch it would tell everyone which phone just got a near-miss card.

### What the other phones see

Nothing. Players who already answered the film see nothing about it until it matches (then everyone sees the match). Today the event itself still reaches every phone in the room as a count, which the phone ignores for a film it already answered.

### Copy

From the copy skill's glossary (both proposed): English "2 of 3 of you liked this", French "2 sur 3 ont aimé". With i18next plurals on the like count (`_one` never happens: the minimum is 2). The count is always "likes of voters", never "one more needed": the count stays true even if things change before the player answers.

### Reduce Motion

The toast fades in and out (`layout.fadeIn`, `layout.fadeOut`) instead of sliding; the glow appears without pulsing.

### Edge cases

- **A missed event** (the channel dropped, the phone was in the background). The card shows no near miss. That's acceptable for a teaser; the phone never invents one. Reading counts back on a refetch would need a backend change (question 2).
- **Offline.** No events, so no near misses. Nothing is queued to show later.
- **Undo of a like** that made a near miss: the count on the waiting cards is now one too high. Recommended: the server sends the corrected count after an undo, and the phone hides the toast when it drops below the near-miss line (see [Changes this asks elsewhere](#changes-this-asks-elsewhere)). Undo is once in a row, so this can't be used to spam near misses ([security](../architecture/security.md#room-codes-joining-and-the-host)).
- **Presence changes** (someone leaves or goes silent): the match rule follows who is present, so a near miss can become a match without anyone swiping (the re-check on leaving). Then the match takes over.
- **A late joiner** who gets the film sees the near miss like anyone who hasn't answered it.
- **Blind mode** (M18.7, after the first release) shows nothing.

## The match

### The beat

**"It's a match": every phone at once, the same celebration everywhere, and the night has its film.** It plays only when a match is the night's pick; a match that joins the shortlist gets [the shortlisted beat](#the-shortlisted-beat) instead. This is the payoff of the whole game and the one moment that's allowed to be loud: the marquee bulbs chase, the poster takes the whole screen, everyone's avatars pop in, every phone in the room buzzes together and plays the match sound. On a couch, the room should react out loud at the same second.

It celebrates the group, not a person: no phone shows who liked it last, or who didn't.

### When it happens

Only for the night's pick, which the `match` event marks `decided: true` (decided on 5 November 2026, [when it's a match](../product/game-modes.md#when-its-a-match)). That happens two ways:

- **A single match when the finale starts** (`only_match`), in Quick Match and Date Night: the card count, the time limit or everyone running out of cards ends swiping with exactly one film on the shortlist, so that film is the pick with no vote. The event carries `reason: 'only_match'` and the match's own kind and counts. Nobody just swiped: the room was already looking at that film in its shortlist.
- **Any match in a mode with `matches_to_end` 1** (a later fast mode; none at launch). `api.cast_vote` makes it after a like, or the re-check after a leave, a removal or a silence does, and the room goes to `done`.

Every other match joins the shortlist and plays [the shortlisted beat](#the-shortlisted-beat). When a vote picks between matches, the reveal is the celebration, not this overlay (Q15.1). There is no Keep swiping button: swiping already goes on after a shortlisted match (Keep swiping, M18.4, was dropped on 5 November 2026).

Each phone starts the overlay at the first of two signals: the `ok` answer to its own vote with `match: true` and `decided: true` (only in a mode with 1), or the `match` event. The phone that completed the match usually knows a few hundred milliseconds early from its own answer; starting on the first signal keeps that phone in step with the others rather than ahead of them. The overlay is identical on that phone, so it doesn't single out the last like.

### The sequence

Times from the first signal. Durations are motion tokens where they exist; the hold is [question 3](#questions-for-harry).

| Time | What every phone shows |
| --- | --- |
| 0 | The stack stops taking input. A card mid-drag springs back (`spring.card`); a card already thrown finishes its flight. A scrim fades in over the game (`duration.fast`). `haptics.match()` and `playSound('match')` fire together |
| 0 to 800 ms | The matched film's poster scales in from the card's size to full screen (`timing.celebrate`, the arcade overshoot). `MarqueeBulbs` start chasing around the edge |
| About 400 ms | "It's a match" lands over the poster (`layout.popIn`) |
| From 800 ms | The avatars pop in one by one (`spring.bouncy`), one every `duration.instant` (80 ms), in seat order: about 800 ms for 10 players. The count ("3 of 3", "7 of 9") appears with the last one |
| From about 1.6 s | Everything has landed; the bulbs keep chasing. A tap anywhere goes on |
| 4 s | The overlay hands over to the winner screen (M6.16: where to watch) |

Which avatars, and whether a majority match marks who said yes, is [question 4](#questions-for-harry). The recommended default: every seated player who hasn't left, in seat order, with no marks, and the count beside them. In a unanimous match that's the same as "who said yes"; in a majority match it celebrates the room without pointing at the two who didn't.

### Haptics and sound

- `haptics.match()` once at 0, the success pattern: the "burst". The avatars pop silently; the vocabulary has no haptic per avatar, and a second burst would blur the one meaning.
- `playSound('match')` once at 0. It mixes with the TV or music, stays quiet when the phone is on silent, and has its own setting. It's a no-op until the sound files arrive (M6.24).
- The winner screen that follows adds no haptic or sound (the reveal sound belongs to the Final Cut's reveal).

### What every other phone sees, and when

Every phone in the room shows the same overlay on the `match` event, within network latency of the others (usually well under a second), which reads as "at once" on a couch. The event carries the film, the kind, the count and `decided`; the avatars come from the seats the phone already has. Nothing in it says who liked it. Phones that left the room don't get the overlay.

### Reduce Motion

- The poster fades in at full size (`timing.base`) instead of scaling.
- The bulbs are lit and still, not chasing.
- The avatars and the count fade in together, without a stagger or a bounce.
- The haptic and the sound are unchanged (their own settings apply).

### Edge cases

- **Two matches at once.** In the launch modes they both join the shortlist, one [shortlisted beat](#edge-cases-7) after the other, and the overlay doesn't play for either; the shortlist stops at `matches_to_end`, most liked first. In a mode with 1, votes in a room run one after another under the room's lock, the first match ends the room, and any later vote gets `closed`; the re-check after someone leaves stops at the first film that decides the night ([question 5](#questions-for-harry)). Either way the phone shows one overlay per room and ignores a second decided `match` for a room it already showed.
- **A shortlisted beat is playing** when the pick arrives (a match on the vote that also reached the card count, then `only_match`). The overlay takes over at once.
- **A card mid-flip or on its back.** The overlay covers it; the card's side doesn't matter. If it's the matched film, the poster is the same film.
- **The rewatch chip is showing.** It leaves; the overlay takes over.
- **`only_match`.** The overlay plays over the swipe screen or the done card, from the event (no phone's own answer carries it). The count is the match's own ("3 of 3"), from when it matched. The film is already in the top bar's shortlist; the poster still scales from a card-size frame centred on the stack.
- **A near-miss toast is showing.** It leaves with `layout.fadeOut` as the scrim comes in.
- **The phone was offline or in the background.** It didn't get the event. When the connection comes back or the app returns to the foreground, it re-reads the room ([missed messages are normal](../architecture/app-structure.md#realtime)); its queued votes come back `closed` and are dropped quietly. It then plays the overlay once, in full, because a player who missed the moment still deserves it, and goes on to the winner screen. A phone that already showed the overlay for this room goes straight to the winner screen.
- **The match comes from someone leaving.** Nobody just swiped; the overlay is the same.
- **The finale started at the same moment.** The room's lock orders them: if the like came first, its match is counted when the finale starts (and may be the pick, `only_match`, or one of the films in the vote); if the finale started first, the like gets `closed` and the Final Cut screen takes over.
- **The phone is locked.** No notification in the first release; the overlay plays when the player comes back, as above.

## The winner

### The beat

**"Tonight's pick": the film, and where to watch it.** The celebration is over (the match overlay, or later the Final Cut's reveal). This screen is the calm after it: one poster, the title, the logos of the room's services that have it, and "More details". It answers the only question left on the couch, "where do we put it on?", and then lets everyone look up at the TV.

It's the same screen on every phone, and it belongs to the group: no names, no avatars, no counts, nothing about how anyone voted.

### How it arrives

Every phone gets there on its own, from the same room state (`done` with a `pick_order` 1 row), so all phones show it within network latency of each other.

| From | How the arrival feels |
| --- | --- |
| The match overlay ([the match](#the-match): a single match when the finale starts, or a mode with 1) | A settling, not a new moment. The winner screen is already under the overlay; the overlay fades out (`layout.fadeOut`) and the same film's poster is there, still. Nothing on the winner screen animates in |
| The Final Cut (until M6.31, Q15.4) | The news itself, told quietly. "Counting the votes" gives way to the winner screen with a fade (`layout.fadeIn`, `duration.base`). This is the one arrival where the players learn the winner here, so the title is what the screen reader reads first. When M6.31 ships, [the reveal](#the-reveal) plays the celebration first and the winner screen fades in after it, with nothing else animating in |
| A single-film pick (Q4.4) | No overlay (Q4.5) and no vote. The stack stops taking input as it does for a match (a card mid-drag springs back, `spring.card`), and the winner screen fades in (`layout.fadeIn`, `duration.base`). One line above the title says why: "The only film anyone liked". The reveal beat (M6.31) may give it more |
| A cold start or a return to a `done` room | Straight to the screen, no transition, once the overlay rule has played or skipped (match-shown) |

### What moves

Almost nothing. The poster's placeholder holds the poster's exact size, so the layout never jumps; the poster fades in over it (`layout.fadeIn`) when it loads. The logos sit still. There's no timer, no countdown and no automatic exit: the screen stays until the player leaves with Home (Q16.4) or the edge swipe. With Reduce Motion, the fades stay (they're opacity only).

### Haptics and sound

None. The match overlay fired `haptics.match()` and `playSound('match')` a few seconds earlier; the reveal (M6.31) will fire `haptics.match()` and `playSound('reveal')`. A second burst here would blur the one meaning. Until M6.31, the Final Cut and the single-film pick reach this screen in silence, on purpose: the reveal brings the feel, not a stand-in. Buttons keep their `press` haptic.

### Never shown

- Who liked the film, who super liked it, who noped it, or who vetoed anything. No avatar or seat name next to the film (game-modes.md#what-players-see-party-and-blind: "A match never shows who said yes").
- The count of likes or the Final Cut's points. The overlay and the reveal already said them; on a still screen, "7 of 9" invites the question "who were the two?".
- Any "Open in Netflix" link (decision row 35): the group watches on the TV.
- Anything that pushes: no "play again now" prompt (Play again is the host's plain button), no streak, no timer.

**After the beat** (M6.47, [winner.md](screens/winner.md#the-runners-up)): below the pick and Share recap, after a hairline and under their own heading, the runners-up (M6.32) name only who liked each one in Party mode and show a like count in Blind (Q48.1, Harry, 5 November 2026). Everything personal stays inside that section: the pick's block keeps no names and no counts. The recap card ([recap.md](screens/recap.md)) carries no name at all. Play again is a plain button for the host and the Join offer an inline card (M6.23): neither celebrates, buzzes or makes a sound.

### Edge cases

- **No service lists the film any more.** The screen says so and keeps "More details" (Q16.2). No watch link: "More details" is hidden (Q16.1).
- **A player leaves with Home.** Nothing reaches the other phones; their screen doesn't change.
- **A screen reader is on.** On arrival, focus goes to the title, read with "Tonight's pick".
- **The room is `done` with no pick.** Not this beat: the no-pick slot shows instead (M6.17).

## The Final Cut

### The beat

**"Pick one. Veto one.": 60 seconds to agree out loud.** The shortlist filled up (3 matches), or swiping ended with 2 matches or none, so the room votes: on its 3 matches, on its 2 matches, or on 3 or 4 finalists from the swipes ([the finalists](../product/game-modes.md#the-finalists)). This is the one moment where talking is the game: people lobby, laugh and bargain on the couch while each phone keeps its own secret ballot. It should feel short, a little tense and fair. Each player ranks by tapping posters in order, may veto one film (Final Cut only), and locks in. The only thing the room learns while it runs is who has locked in.

In a ranked vote (Quick Match with 5 to 10 players) it's the same screen without the veto, so one person can't block a film most of the group wants. With 2 films it's "Pick one" with no veto, at any room size: a veto between two films is a second vote for the other.

Every round says once, the same in every room, where the films came from: "From your likes, with one for each of you when we can." No phone marks a film as anyone's, its own player's included (decided on 5 November 2026): on a couch a neighbour sees your screen, and the films you didn't mark would be the ones you noped.

### How it arrives

The server sends `finale_started {round_id, title_ids, kind, closes_at}`, then `state_changed {state: 'finale'}` (Q0.5). Every phone moves on `state_changed`: the room re-read maps `finale` to the Final Cut screen. `finale_started` on its own may start loading the posters, but never moves the screen, so all phones move on the same signal. A phone that missed both gets there on its next re-read (back in the foreground, a reconnect, or a vote answered `closed`).

On the swipe screen, the stack stops taking input and a card mid-drag springs back (`spring.card`). A near-miss toast leaves, a showing rewatch chip leaves, and votes still queued come back `closed` and are dropped quietly ([the swipe](#edge-cases)). A player on the done card moves the same way. No overlay, no haptic, no sound: it isn't a match, and `haptics.match()` keeps its one meaning. When the third match starts the finale, [the shortlisted beat](#the-sequence-6) plays first and the layout holds the route until it ends (about 1.75 s); then the Final Cut arrives the same way.

### The sequence

Times on this phone's clock (Q15.2). The deadline is `closes_at` (`stage_closes_at` on a re-read), 60 seconds after the server opened the round.

| Time | What this phone shows |
| --- | --- |
| Arrival | The screen fades in (`layout.fadeIn`, `duration.base`): the heading, the countdown at the time left (never more than 60 s), the lock-in row with every avatar dim. The posters pop in one by one in seed order (`layout.popIn`, one every `duration.instant`), each with a faint number: the place it gets if the player taps nothing |
| The round | Tap to rank, long-press to veto, Lock in ([What moves](#what-moves-1)). Lock-ins light up in the row as they arrive |
| 10 s left | The countdown turns red (`Countdown` does it) |
| 5 s left | One `haptics.countdown()` per second, only on a phone that hasn't locked in |
| 0 | A phone that hasn't locked in stops taking taps and sends nothing (Q15.3). The countdown gives way to "Counting the votes" (`layout.fadeIn`). The posters dim |
| 0 plus 2 s | The phone calls `api.close_round_stage` (Q5.1); on `not_yet` it calls again each second; on `ok` or `closed` it waits for `state_changed {state: 'done'}` |
| Done | Until M6.31, the winner screen fades in ([the winner](#how-it-arrives), Q15.4); then the reveal plays first |

**Everyone locked in early.** When every present seat has locked in (Q5.5), the round closes at once. The phone shows "Counting the votes" as soon as it knows (its own `ok` with `locked` covering `of`, the `round_progress` event, or `state_changed`), and the countdown stops. Most rounds should end this way, well before zero.

**A late lock-in.** A tap on Lock in before this phone reaches zero is sent; the server takes ballots until 2 seconds past the deadline, which covers a send in flight and a clock a little off. An answer of `closed` means it was too late: the phone shows "Counting the votes" and nothing else.

### What moves

- **The finalists.** 2, 3 or 4 posters in seed order, each with its title and year under it. No details sheet during the round: the 60 seconds are for talking (decided on 4 November 2026, [question 10](#questions-for-harry)).
- **Ranking.** A tap on a poster gives it the next number: a badge pops onto its corner (`spring.snappy`). A tap on a ranked poster takes its number off, and the numbers after it close the gap. The posters never move: only the badges change, so nothing slides out from under a finger. The untapped posters keep their faint numbers, which always show the order that will be sent: the tapped films in tap order, then the rest in seed order (Q15.5).
- **The veto.** A long press (the system's long-press time) sinks the poster slightly while held (`timing.press`). At the threshold a "Veto" stamp slams onto it (`easing.arcade`, as the swipe's stamps) and the poster greys out: knocked out, on this phone only. If it was ranked, it leaves the ranking and the gap closes. A vetoed poster can't be tapped into the order. Until lock-in, a long press on the vetoed poster lifts the veto, and on another poster moves it; the veto is spent at lock-in (decided on 4 November 2026, [question 9](#questions-for-harry)). The stamp stays on the poster; nothing flashes across the screen, so a neighbour's glance learns little.
- **No veto** in a ranked vote or with `vetoes_left` at 0: no stamp, no hint, and a long press does nothing.
- **Two films.** A tap picks one: it gets the solid 1, the other keeps a faint 2. A tap on the other film moves the pick; a tap on the picked one lifts it, and both go back to faint numbers in seed order. The ballot is the same ranking as ever, so nothing changes on the server.
- **Lock in.** Always enabled: locking in untouched sends the seed order. On the tap, the ballot freezes at once (badges and stamp stay, taps stop) and the button reads "Sending". On `ok` (or `already_voted`) it reads "Locked in" with a check, and this player's avatar lights up in the row. One tap sends one ballot; a double tap sends one.
- **Who has locked in.** Every seat that hasn't left, in seat order, never in lock-in order. A lock-in turns its avatar from dim to lit, with a small check popping on (`spring.snappy`), on every phone at once. A count beside it: "2 of 4 locked in", the locked seats in the row over `of`, never more than `of`.
- **"Counting the votes"** fades in and stays still. It usually lasts 1 to 3 seconds.

### Haptics and sound

- `haptics.press()` on each tap that ranks or unranks, and on Lock in (`Pressable` does it).
- `haptics.veto()` once, when the stamp lands. Moving or lifting the veto is silent.
- `haptics.countdown()` on each of the last 5 seconds, only while this phone hasn't locked in (`Countdown`'s `tick` turns off at lock-in). A player who has locked in has nothing left to hurry for.
- No `commit` on lock-in: `commit` keeps its one meaning (a card crossing the line). The "Locked in" look carries the moment.
- No haptic on another player's lock-in, on arrival, at zero, or at the close.
- Sound: the countdown's tick with each `haptics.countdown()`, and Lock in's button tick ([sounds.md](sounds.md#the-final-cuts-last-5-seconds)). Nothing else; the reveal's sound is M6.31's.

### What the other phones see

Only lock-ins: the `round_progress` event `{round_id, locked, of}` lists seat ids, nothing else. No phone ever receives a ballot, a veto or a points total while the round runs. Vetoes stay secret until the close and are revealed together (the reveal, M6.31).

### Reduce Motion

- The posters fade in together (`layout.fadeIn`), no stagger.
- Badges and the lock-in checks fade in and out; numbers change in place.
- The veto stamp fades in at full size instead of slamming, and the poster doesn't sink. `haptics.veto()` is unchanged.
- The countdown still turns red (a colour, not a movement).

### The screen reader

- On arrival, focus goes to the heading: "The Final Cut. Pick one. Veto one.", then the time left. A ranked vote and a 2-film vote read their own heading. The line on where the films came from is read after the intro.
- Each poster is one element: its title and year, then "Ranked 2", "Not ranked, counts as 3" or "Vetoed". Its actions are the ones that apply: "Rank next", "Remove from ranking", "Veto", "Lift veto". A double tap does what a tap does. Ranking needs no gesture.
- The countdown isn't read every second. It's announced at 30 seconds, at 10 seconds, and at zero ("Counting the votes").
- The lock-in row is one element: "Locked in: Sam, Léa. 2 of 4." A change is announced politely with the count only.
- Lock in has the hint "Sends your order. You can't change it afterwards." Once locked: "Locked in".

### Never shown

- Who vetoed, how many vetoes there are so far, or which film anyone vetoed, until the close (and then never by whom).
- How anyone ranked, which film is ahead, or any points before the reveal.
- The order in which people locked in, beyond what the live lights show at the moment.
- "Waiting for Sam" or any line naming who hasn't locked in. No nudge button, no buzz on the others' phones, no extra time.
- "Your vote didn't count" for a player who didn't lock in. Everyone sees "Counting the votes".

### Edge cases

- **Coming back mid-round** (the app back from the background, a cold start, a reconnect with the same seat). The room re-read opens the Final Cut; the phone reads the open round (`api.rounds`), its finalists (`api.round_candidates`) and `api.round_progress` (`locked`, `of`, `me_locked`). The countdown starts at the time left, without animation and without catching up missed ticks. Not locked in: a fresh ballot (one kept in memory survives a trip to the background, not a cold start). Locked in: the locked look; the numbers and stamp if the phone still has them, otherwise none, since the server never sends a ballot back. Past zero: "Counting the votes", and the close call goes out at once.
- **Joining during the round.** A new player is refused on the join sheet ("They're voting on the final films") and never sees this screen. A seat that already exists gets back in and can vote while the round is open.
- **Offline at lock-in.** The ballot stays frozen with "Sending" and a short offline line, and is sent again each second until the room moves on. `already_voted` on a retry reads as "Locked in". If it never gets through before the close, the phone moves on like the others.
- **A player leaves mid-round.** Their avatar leaves the row; a ballot they locked in still counts. If everyone left has locked in, the round closes.
- **Nobody locks in.** The round closes at zero plus 2 seconds and the best seed wins (`no_ballots`). Nothing on screen says nobody voted.
- **A phone's clock is off.** The countdown never shows more than 60 seconds, so a slow clock can't promise extra time. A fast clock reaches zero early for that player; the 2-second grace covers small drifts, and the server decides anyway.
- **Status answers.** `invalid` and `no_veto` are client bugs: reported to Sentry, shown as a retry. `not_in_room` sends the phone Home as a left seat.
- **Two seats on one phone** are out of scope for this beat.

## The reveal

### The beat

**"Tonight's pick": the vetoes drop together, the points add up, one film is lit.** The round has closed after a minute of lobbying on the couch. The reveal answers it once and fast: every phone shows the same result at the same moment, then hands over to where to watch it. It should feel fair (you see why it won) and short (the group wants its film): under 5 seconds from the close to the winner screen.

It shows the room's result, never a ballot. At the start every phone clears its own badges and stamp, so your screen and your neighbour's look the same.

### How it arrives

The close sends `match {title_id, kind: 'finale', decided: true, likes, of, reason, finalists: [{title_id, seed, points, vetoed}]}`, then `state_changed {state: 'done'}` (M6.5). The reveal starts on the `match` event, on the Final Cut screen the phone already shows ("Counting the votes", or the round itself if everyone locked in early). From then until the hand-over the reveal holds the route (`use-reveal-hold`), so `state_changed` doesn't swap the screen. The match overlay never plays for a finale pick (Q15.1). Each phone times the sequence from its own arrival of the event, so on a couch they land within network latency of each other.

`vetoed` means knocked out, nothing more: when every finalist got a veto, the two still in show as still in. `points` only count for films still in.

### The sequence

Times from the event. A step with nothing to show is skipped, and the next one moves up.

| Time | What every phone shows |
| --- | --- |
| 0 | "Counting the votes", the countdown and the lock-in row fade out (`layout.fadeOut`). The posters come back to full brightness where they were, in seed order, with every badge and this phone's own stamp gone. The reveal sound starts later, timed to the winner ([sounds.md](sounds.md#the-reveal)) |
| 300 ms | **The vetoes, together.** Every knocked-out film gets the Veto stamp at the same instant (`easing.arcade`, as in the round), with one `haptics.veto()`. The poster then falls away: it sinks a little and greys out (`timing.exit`) but keeps its place, so the row never reflows. No order, no stagger |
| 800 ms | **The points.** Under each film still in, its points count up from 0, all together (`timing.celebrate`). Only from 3 ballots ([What never happens](#what-never-happens)) |
| 1.8 s | **The winner.** The other films still in dim. The winner lifts slightly (`timing.celebrate`, the arcade overshoot) and `Spotlight tone="marquee"` fades in behind it. The heading becomes "Tonight's pick" and the reason's line pops in under it (`layout.popIn`). `haptics.match()`. "Where to watch" fades in (`layout.fadeIn`) |
| From the winner | A tap anywhere, or the button, goes on. A touch that started earlier never counts |
| Winner plus 2.5 s | The hand-over: the layout replaces the screen with `/room/[id]/winner` without a navigation animation, and the winner screen fades in with the same poster, still ([the winner](#how-it-arrives)) |

The whole sequence takes about 4.3 s. Without knock-outs (a ranked vote, or nobody vetoed) it takes 3.8 s, without points 3.3 s, and with neither (`no_ballots`) 2.8 s.

### Each reason

| `reason` | Steps | The line under "Tonight's pick" |
| --- | --- | --- |
| `points` | Knock-outs if any, points from 3 ballots, the winner | "Top of the votes". On a tie at the top, with the points shown: "A tie, broken by your swipes" (ties go to super likes, then likes, then the group score) |
| `only_unvetoed` | Knock-outs, then the winner. No points: with one film in, they say nothing | "The only film nobody vetoed" ([counting](../product/game-modes.md#counting)) |
| `no_ballots` | The winner only: no vetoes, no points | "Top of your swipes". It never says nobody voted ([the Final Cut](#edge-cases-5)) |
| `only_film` | No round, so no reveal (Q4.4): the winner screen fades in with "The only film anyone liked" ([the winner](#how-it-arrives)) | |
| `only_match` | No round, so no reveal: [the match](#the-match) overlay plays, then the winner screen | |

A ranked vote has no vetoes, so it is always `points` without knock-outs. That includes every 2-film vote: in a room of 2 it never shows points (fewer than 3 ballots), only the winner and "Top of the votes". The French lines are for the screen spec (final-cut.md, the reveal section), proposed: « En tête des votes », « Égalité, départagée par vos swipes », « Le seul film que personne n'a éliminé », « Le préféré de vos swipes », and the heading « Le film du soir » (as the winner screen). No exclamation marks: the winner screen says it calmly too.

### Haptics and sound

- `playSound('reveal')` once, starting at the winner's time minus 894 ms (or at 0 when that's earlier), so its ta-dum lands with the winner's lift and `haptics.match()` (decided on 6 November 2026, [sounds.md](sounds.md#the-reveal); a no-op until M6.24). The match sound doesn't play: it belongs to the match.
- `haptics.veto()` once when the stamps land, however many films are knocked out; none when nothing is.
- `haptics.match()` once when the winner lifts ("the winner is revealed").
- Nothing on the points, and nothing on the winner screen after it.

### Reduce Motion

- The stamps fade in at full size, and the knocked-out posters fade to grey without sinking.
- The points appear at their totals with a fade, without counting.
- The winner doesn't lift: the other films dim and the Spotlight fades in.
- The times stay the same, so phones keep in step. Haptics and sound are unchanged.

### The screen reader

- At 0 the reveal takes focus and announces the result once, assertively: "Vetoed: Dune, Barbie. Tonight's pick: Heat. The only film nobody vetoed." The knock-outs come first only when there are some; the points aren't read here.
- Each poster is one element: its title and year, then "Vetoed", "7 points" or "Tonight's pick, 9 points".
- No automatic hand-over while VoiceOver or TalkBack is on: the button goes on, as in the match overlay.

### A phone that missed it

A phone that comes back (the foreground, a reconnect, a cold start), or gets `state_changed {state: 'done'}` without the event, re-reads the room (Q31.1). If the room is `done` with a kind `finale` pick and a closed round in `api.rounds`, and it isn't in `matchShownStore`, the phone reads `api.round_candidates` (`seed`, `points`, `vetoed`) and the finalists' cards. It plays the reveal once, in full, with the sound and haptics, then the winner screen. A player who missed the moment still deserves it. If the reads don't answer within 3 seconds, the winner screen shows and the room counts as shown: the film matters more than the show.

The room is marked shown when the winner lifts, or when the reveal leaves, whichever comes first (the overlay is marked when its avatars land). A phone sent to the background before the winner plays the reveal again on its return; after it, the phone goes straight to the winner screen. A second `match` event, or the event after a re-read, plays nothing more.

### What never happens

- Who vetoed: `vetoed_by` never reaches a phone. No avatar, seat name or initial next to any film, and the lock-in row leaves at 0.
- How many vetoes a film got, or that a film still in was vetoed.
- How anyone ranked, including this phone's own ballot: during the reveal every phone shows only the room's result.
- Vetoes one after another. They land at once, so timing can't tie a veto to a face on the couch.
- Points from fewer than 3 ballots. With 2, your own ballot taken from the totals gives the other one exactly. The phone counts ballots without a read: every ballot ranks every film it didn't veto, so the n films still in share n × (n + 1) / 2 points per ballot. When everyone agrees, the points show it, as "3 of 3" does; they never isolate one person.
- Points on a knocked-out film.
- "Your vote didn't count", "Nobody voted", or anything about who didn't lock in.
- The match overlay, the marquee bulbs or the match sound: they belong to the match.
- A replay button or a countdown to the winner screen.

**With 2 players**, the result itself gives the other's veto away: a knocked-out film you didn't veto is theirs, and "The only film nobody vetoed" says the same. The rules show knock-outs in every room ([what players see](../product/game-modes.md#what-players-see-party-and-blind)), and the round's intro tells each player their veto "stays secret until the end". So the beat shows them at every size and adds nothing on top (no points, no tie line). Decided on 4 November 2026 ([question 11](#questions-for-harry)).

### Edge cases

- **Everyone locked in early.** The event can arrive before this phone's zero: the countdown stops and the reveal starts from there.
- **A player who didn't lock in** sees the same reveal as everyone else.
- **A poster that hasn't loaded.** Its placeholder takes the stamp, the points and the spotlight; the poster fades in over it if it arrives.
- **The largest text.** The line wraps to two lines; each film's points stay on one line under its poster.

## The shortlisted beat

### The beat

**"It's a match: 1 of 3": you all said yes to this one, it's on the shortlist, keep going.** Every phone in the room stops for under 2 seconds, shows the same film with "It's a match: 1 of 3" and how many said yes, and sends its poster up into the shortlist in the top bar. Then everyone is back on their own next card. It's a small cheer, not the finale: the room learns it has a film everyone (or most) wants, and the game goes on.

The full celebration (the overlay, the bulbs, the match sound) stays for the night's pick ([the match](#the-match)). This beat is shorter, quieter and has no avatars, so a shortlisted film never feels like the end, and the pick still feels bigger when it comes.

It's the room's shortlist, not anyone's: Party and Blind show it the same way ([what players see](../product/game-modes.md#what-players-see-party-and-blind)).

### When it happens

A match that doesn't decide the night: the `match` event with `decided: false` ([when it's a match](../product/game-modes.md#when-its-a-match)). In every launch mode (Quick Match, Date Night, Final Cut) the first, second and third matches all play it. `api.cast_vote` makes most matches after a like; the re-check after a leave or a removal, and the sweeper after a silence, can make one too.

The event carries `{title_id, kind, likes, of, decided, shortlisted, shortlist_size}`. `likes` of `of` is the vote count ("3 of 3", "7 of 9"); `shortlisted` of `shortlist_size` is the shortlist's ("1 of 3"). `of` keeps meaning the voters.

Each phone starts the beat at the first of two signals, as for the match: the `ok` answer to its own vote with `match: true` and `decided: false`, or the event. The phone's own answer has no counts, so it starts with its own shortlist plus one and no vote count; the event corrects both in place when it lands (Q37.1, approved by Harry on 5 November 2026, [decisions.md](../decisions.md)). The phone that completed the match plays exactly the same beat as the others.

A mode with `matches_to_end` 1 (none at launch) never plays this beat: its first match is the pick and gets the overlay.

### The sequence

Times from the first signal. Every phone shows the same thing.

| Time | What every phone shows |
| --- | --- |
| 0 | The stack stops taking input (the buttons row too). A card mid-drag springs back (`spring.card`); a card already thrown finishes its flight. A scrim fades in over the stack only (`duration.fast`), so the top bar stays bright. The matched film's poster pops in over the middle of the stack (`layout.popIn`), half the card's width. `haptics.shortlist()` |
| 150 ms | "It's a match: 1 of 3" pops in above the poster (`layout.popIn`). The vote count ("Unanimous: 3 of 3", "7 of 9 said yes") fades in under it (`layout.fadeIn`) |
| Hold | The poster and the two lines stay still. Long enough to read the title and see the poster from across the couch |
| 1.2 s (`duration.shortlist-hold`) | The two lines fade out (`layout.fadeOut`). The poster flies into its slot in the top bar's shortlist, shrinking to the slot's size on the way (`duration.slow`, `easing.standard`) |
| 1.6 s | It lands: the slot shows the poster with a small pop (`spring.snappy`), and the shortlist's count changes in place ("1/3"). The scrim fades out (`duration.fast`) |
| 1.75 s | The stack takes input again. The next card was there all along |

**The film leaves the stack.** If the matched film is still waiting on this phone (under the 70% rule, 5 or more players, a player who hasn't reached it), it goes quietly: as the top card, the poster lifts off that card (the card fades out under it) and the next card is on top when the scrim leaves; as the second or third card, it fades out under the scrim and the cards behind move up; further back, it's dropped from the phone's held cards with nothing to see. A vote on it already in the queue still goes to the server, and counts.

**The third match** (`shortlisted` equals `shortlist_size`). The beat plays the same, the third slot fills, and then the Final Cut arrives as it always does ([the Final Cut](#how-it-arrives-1)), at 1.75 s instead of the stack waking up. The room layout holds the route while the beat plays: `finale_started` and `state_changed {state: 'finale'}` come right after the `match` event, and moving at once would cut the beat in half. The phone's own answer for that vote says `state: 'finale'`; it changes nothing here.

### Haptics and sound

- `haptics.shortlist()` once at 0: a light double tap, lighter than the match's success burst (M6.37 adds it to `lib/haptics`; the starting point is two `Light` impacts 100 ms apart, tuned in the feel check). It says "we agree on this one" without saying "this is the night's film", which stays `match`'s meaning.
- No sound. The big sounds belong to the pick (`match`) and the reveal; a sound here twice a game would wear them out ([silent on purpose](sounds.md#silent-on-purpose)).
- Nothing on the landing: the pop is enough.

### What every other phone sees, and when

The same beat, on the `match` event, within network latency of the others: on a couch, every phone stops at once and every poster flies up together. Nothing in the event says who liked the film, and no phone shows any avatar during the beat. Phones that left the room don't get it.

### Reduce Motion

- The poster fades in at its size (`layout.fadeIn`) instead of popping; the title fades in.
- The flight becomes a crossfade: the poster over the stack fades out while the slot's poster fades in. Nothing travels.
- The slot doesn't pop; the count changes in place.
- The times stay the same, so phones keep in step. The haptic follows its own setting.

### The screen reader

- At 0 the beat is announced once, assertively: "It's a match: Heat. 1 of 3 on the shortlist. Unanimous: 3 of 3." The vote count is left out if the event hasn't arrived yet.
- Focus doesn't move: the player is mid-game, and the beat is over before a reading would end. The top bar's shortlist reads the new film from then on.
- On the third match, the Final Cut takes focus on its heading when it arrives, as usual.

### Edge cases

- **The phone's own answer comes first** (it completed the match). The title says its own shortlist plus one; when the event lands, the number changes in place if it differs (a match from a leave landed first, say), without a second pop. The vote count fades in when the event lands; if it hasn't by 1.2 s, it isn't shown this time.
- **Mid-drag.** The card springs back (`spring.card`). A touch during the beat does nothing and isn't kept for later; a drag that started before the beat doesn't continue after it.
- **A flipped card.** It stays flipped under the scrim and is still flipped after.
- **The near-miss toast.** It fades out at 0 (`layout.fadeOut`) and the glow goes with it. If its card is still on top after the beat, the toast fades back in (`layout.fadeIn`), with the new count if one came. If the near miss was on the matched film itself, it doesn't come back: that card left.
- **An undo's return.** The card coming back finishes its flight under the scrim; nothing is cut.
- **Undo right after the match.** The Undo button is disabled while the last card this phone answered is on the shortlist ("A card that matched or became a finalist can't be undone", [the answers](../product/game-modes.md#the-answers)). If the player tapped Undo before the phone knew (the card already came back, the vote was in flight), the beat takes that card with it as above, and the phone doesn't call the server. If the server answers `locked` anyway, the card that came back leaves again (`layout.fadeOut`), with no message.
- **The rewatch chip is showing.** It leaves when the beat starts; Yes does nothing once the room has moved on.
- **The seat sheet, the report sheet or the leave alert is open.** It stays open and the beat plays under it, haptic included; the shortlist shows the film when the sheet closes. A host halfway through removing someone shouldn't lose that to a cheer. On the third match the sheet closes as the room leaves `swiping` (the layout's `SHEETS` rule), after the beat.
- **The done card** (this player is out of cards). The beat plays over it the same way.
- **Two matches at once** (a leave, a removal or the sweeper can make several films match together; the server sends them most liked first). One beat per match, back to back: the second starts as the first poster lands (at 1.6 s), the scrim stays, and the shortlist's count steps up ("1/3", then "2/3"). The stack wakes up after the last. If the second is the third match, the Final Cut follows it.
- **A beat, then the pick at once.** The vote that makes a match can also reach the card count; if the finale then finds that single match, the pick follows right away (`match` with `decided: true` and `reason: 'only_match'`). The match overlay takes over at once and the beat stops where it is: a phone that missed the first event starts the overlay straight away, and the others should be in step with it.
- **A phone that missed it** (the channel dropped, the background, a cold start). No replay (Q37.2, approved the same day): a beat is a moment, the top bar is the state. On its next re-read the phone reads the shortlist back from `api.room_matches` and the slots fill without animation. A phone that missed the third match goes straight to the Final Cut on `state_changed`, a little ahead of the others.
- **Offline.** No events, so no beat; the phone's own like can't come back with `match: true`. The shortlist catches up on the re-read after the connection returns.
- **The match comes from someone leaving or going silent.** Nobody just swiped; the beat is the same.
- **The phone is locked.** No notification; the shortlist is there when the player comes back.

### Never shown

- Who liked the film, who super liked it, or whose like completed the match. The phone that completed it gets the same beat, at the same moment.
- Any avatar. The match overlay shows every seat with no marks; this beat shows none, so there is nothing to mark.
- "2 to go", "One more match and you vote", a progress bar toward the vote, or a countdown. The shortlist's count says how many films the room has, not how many it still needs, and nothing hurries anyone.
- Which slot came from which player, or the order in which people answered. Slots fill in the order the matches happened.

## The checkpoint

### The beat

**"Here's what you've got. Pick one for tonight, or keep going."** A player alone swipes with no end. Every 20 cards a card in the stack takes stock: up to five of the films they liked, fanned, how many there are, and two ways on. It's a pause the player can take or skip, never a finish line. Nothing on it counts what's left, what they noped or how fast they went.

Only one phone plays solo, so nothing here reaches anyone else.

### When it happens

- After the 20th card the player answered in this solo session, then after the 40th, the 60th, and so on. The count is the session's answered cards after undos; each multiple of 20 shows once per session (Q44.1).
- It comes from the phone's own stack (rule 5): the card is placed behind the 20th card as soon as that card is on top, so it is already there when the 20th card leaves.
- At the cap or when the films run out on the same card, the [cap card](screens/swipe.md#the-cap-card) or the [out of films card](screens/swipe.md#out-of-films) shows instead: each already says how many films were liked.

### The sequence

| Time | What the phone shows |
| --- | --- |
| The 20th card leaves | The checkpoint rises from behind like any next card (scale from 95% to full). Its posters are stacked in the middle |
| It is on top | The posters fan out (`spring.snappy`, each `duration.instant` after the one before) and `haptics.checkpoint()` plays once |
| Then | It stays until the player answers. It never moves on by itself |
| Keep going, or a swipe in any direction | The card is thrown like an answered card, with no stamp, and the next film is there |
| Pick one | [The pick sheet](screens/swipe.md#the-pick-sheet) opens over the stack; the checkpoint stays under it |

### Haptics and sound

- `haptics.checkpoint()` once, when the card is on top: one `Light` impact (new in `lib/haptics`, M6.44). It means "a checkpoint", softer than `throw`, which the 20th card fired just before.
- No sound: the big sounds belong to a group's match and the reveal.

### Reduce Motion

The posters are fanned from the start, with no spread. The card still rises as any card does (Reanimated keeps opacity and scale changes short). The haptic follows its own setting.

### The screen reader

When the checkpoint is on top, focus moves to its line ("You liked 5 films. They're in My films."), then Pick one, then Keep going. The posters are hidden from the screen reader. A swipe is not needed: Keep going does the same.

### Edge cases

- **No like yet.** "Nothing yet. Keep going?" with Keep going only, and no posters.
- **One like.** One poster, straight, and the singular line.
- **Undo while it's on top.** The checkpoint leaves (as Keep going) and the 20th card comes back. It doesn't come back for 20 again.
- **Likes still in the queue.** They count: the number is the phone's own answers, not the server's.
- **Offline.** The same card. Pick one still opens the sheet; the sheet says a pick needs a connection.

### Never shown

Nopes or their count, a streak, "you're on a roll", a timer, a target ("5 more to go"), how many cards are left today, or any nudge to keep swiping. Keep going is a secondary button, not the bright one.

## The solo pick

### The beat

**"This one, tonight."** The player taps a film in the pick sheet. Its poster lifts out of the sheet and settles where the winner screen shows it, the bulbs come on, and one success buzz says it's done. Calmer than a group's reveal: there's no suspense when you chose it yourself, so there's no overlay, no chase and no sound.

### How it arrives

| Time | What the phone shows |
| --- | --- |
| Tap | The tile lifts at once (scale 1.05, `spring.snappy`) and `api.solo_pick` is sent, after any votes still in the queue |
| `ok` | The sheet slides down (`duration.slow`). The lifted poster flies from the tile to the winner screen's poster frame, growing to 144 by 216 (`duration.slow`, `easing.standard`). The winner screen is mounted under it with the poster frame empty |
| It lands | It settles with a small overshoot (`spring.snappy`); `haptics.match()`. The bulbs and the spotlight fade in (`layout.fadeIn`, `duration.base`), then the title, the meta and where to watch (`layout.fadeIn`) |

If `ok` takes more than a second, the tile stays lifted and nothing else moves. If the call fails, the tile settles back (`spring.snappy`) and the sheet says why ([the pick sheet](screens/swipe.md#the-pick-sheet)).

### Haptics and sound

`haptics.match()` once, on landing: "the winner is revealed", here by the player. No sound: `playSound('reveal')` and `playSound('match')` stay a group's.

### Reduce Motion

No flight: the sheet closes and the winner screen fades in whole (`layout.fadeIn`), bulbs lit. The haptic stays.

### The screen reader

On arrival, focus goes to the title, read as "Tonight's pick: Heat", as on the group winner screen.

### Edge cases

- **A cold start or a return to the room** after the pick: the winner screen straight away, no flight.
- **`not_liked`** (the like was undone in a race): the tile leaves the sheet and a toast says so.
- **`closed`** (the sweeper ended the session): Play, with the session-ended toast ([solo swipe](screens/swipe.md#solo)).

### Never shown

No count of likes, no "out of 23", no runners-up, no recap and no Play again (out of scope at launch).

## Starting values

Placeholders for the feel check (the `feel-check` skill) and the first playtests. The ones marked "token?" are new numbers the designer should either map to an existing token or add to `tokens.json` first.

| Value | Start | Moment |
| --- | --- | --- |
| Commit line, sideways | 30% of the screen's width from the middle | The swipe |
| Commit line, up | 18% of the screen's height | The swipe |
| Up angle | Within 30 degrees of straight up | The swipe |
| Throw speed (a flick throws before the line) | 800 points per second in an answer's direction | The swipe |
| Tilt at the commit line | 10 degrees, at most 15 | The swipe |
| The card behind, at rest | 95% of full size, full size at the commit line | The swipe |
| `hintDelay` before the card 1 lean | 600 ms of no touch (token?) | First game hints |
| Lean in the card 1 hint | A third of the commit line, `duration.slow` each way | First game hints |
| Near miss | One like short of the match rule, at least 2 likes (question 1) | The near miss |
| Avatar stagger | `duration.instant` (80 ms) | The match |
| Overlay before the winner screen | 4 s, a tap goes on earlier (question 3) | The match |
| The poster over the stack | Half the card's width, shrunk to fit the stack's height with the two lines | The shortlisted beat |
| Hold before the flight | 1.2 s (token: `duration.shortlist-hold`) | The shortlisted beat |
| The whole beat | About 1.75 s: the hold, the flight (`duration.slow`), the scrim (`duration.fast`) | The shortlisted beat |
| `haptics.shortlist()` | Two `Light` impacts 100 ms apart | The shortlisted beat |
| Poster stagger on arrival | `duration.instant` (80 ms) | The Final Cut |
| Long press for a veto | The system's long-press time | The Final Cut |
| Countdown red | The last 10 s (`Countdown`) | The Final Cut |
| Countdown ticks | The last 5 s, only before lock-in | The Final Cut |
| Screen reader time announcements | At 30 s, 10 s and zero | The Final Cut |
| First step after the event | 300 ms | The reveal |
| Step lengths | Knock-outs 500 ms, points 1 s (`timing.celebrate` plus 200 ms) | The reveal |
| Winner before the hand-over | 2.5 s, a tap goes on earlier (token? `duration.reveal-hold`) | The reveal |
| Points shown | From 3 ballots (decided, question 12) | The reveal |
| A missed reveal's reads | 3 s, then the winner screen | The reveal |
| Checkpoint interval | Every 20 answered cards in a solo session | The checkpoint |
| Posters on the checkpoint | Up to 5, super likes first, then newest | The checkpoint |
| `haptics.checkpoint()` | One `Light` impact | The checkpoint |
| The tile's lift on a tap | Scale 1.05, `spring.snappy` | The solo pick |

## Changes this asks elsewhere

None of these is decided; each follows from a question below or is a gap found while writing the beats.

| Where | Change | Why |
| --- | --- | --- |
| `api.cast_vote`, M6.1 or M6.13 | Send `near_miss` only when the film is one like short of the match rule (question 1), and add `needed` to the payload so the phone doesn't recompute the rule | Fewer messages (up to about 50 per game per phone today at 10 players) and no events on films that can't match |
| `api.undo_last_vote`, M6.3 | After undoing a like on a film with a near miss, send the corrected `near_miss` count | So waiting cards don't keep a count that's no longer true |
| `api.my_next_cards`, M6.13 (only if question 2 says so) | In Party mode, the near-miss count on each upcoming card | So a missed event or a refetch doesn't lose a near miss |
| `api.cast_vote` | The optional `flipped` argument for `swipe_log` ([deck engine](../architecture/deck-engine.md#changes-to-the-data-model), [app structure](../architecture/app-structure.md#changes-this-asks-of-the-backend)). No roadmap task carries it yet; M6.10 needs it | The flip beat sends it with the vote |
| `internal.recheck_room_matches`, M6.1 | Walk films in a fixed order (question 5) | Today ties in like counts come out in no defined order |
| [game-modes.md](../product/game-modes.md#what-players-see-party-and-blind) | If question 4's default is accepted: a Party match shows every player's avatar and the count, not "who said yes" | A majority match would otherwise show who didn't |
| `mobile/src/theme/tokens.json`, M6.31 | `duration.reveal-hold`, 2500ms, "The reveal before the winner screen (a starting value)" | The reveal's hand-over, as `duration.match-hold` for the overlay |
| [final-cut.md](screens/final-cut.md#the-reveal), M6.31 | The reveal section: the lines above in both languages, the points label (`_one`, `_other`), the announcement and the button | The section waits for this beat |
| [game-modes.md](../product/game-modes.md#what-players-see-party-and-blind), the finale row | Done in this pull request (question 12): the points after the close, only from 3 ballots and never on a knocked-out film | The points are new on phones, and the row only listed the knock-outs |
| `mobile/src/theme/tokens.json`, M6.37 | `duration.shortlist-hold`, 1200ms, "The shortlisted beat: the poster over the stack before it flies to the shortlist (a starting value)" | The beat's one new number |
| `lib/haptics.ts` and the `motion` skill's haptics table, M6.37 | `haptics.shortlist()`: "A match joins the shortlist" | The beat needs a buzz lighter than `match`, which keeps meaning "the night's film" |
| The `copy` skill's glossary | Done in this pull request: "the shortlist", « la sélection » (proposed) | A new word players see |
| The winner screen spec (screens/winner.md, to be written), M6.16 | The single-film pick's line, "The only film anyone liked" (Q4.4), above the title. The phone knows it from the `match` event's `reason: 'only_film'`, or on a cold start from a `finale` pick with no row in `api.rounds` | Q4.4's default puts this line on the winner screen, and M6.16's brief doesn't list it yet |
| `lib/haptics.ts` and the `motion` skill's haptics table, M6.44 | `haptics.checkpoint()`: "A solo checkpoint card is on top", one `Light` impact | The checkpoint needs its own meaning, softer than `throw`, and `press` means a button |

## Questions for Harry

Each needs a yes before slice 10 or 11 starts; the beats above follow the defaults.

1. **When is it a near miss?** Today: after every like that leaves a film at 2 likes or more without a match, even when a nope has made the match impossible (4 to 51 a game for 3 to 10 players in bot games, a third to two thirds on dead films). Default: only when the film is one like short of the match rule and has at least 2 likes, which gives about 1 to 2 a game at medium agreement ([simulations](../product/simulations.md#near-misses); bot tastes are made up). The starting value in [game-modes.md](../product/game-modes.md#starting-values) ("From 2 likes, Party mode only") would change.
2. **Who sees the near miss, and how?** Options: a toast on every phone when the like lands (what the agent workflow pictured), or a toast and glow only on the card of each player who hasn't answered it, when that card is on top. Default: the second. On a couch, the first lets everyone see who still holds the film, and then who noped it when no match follows; it also makes every near miss a room-wide interruption. Sub-question: should the count also come with the cards (`api.my_next_cards`), so a missed event doesn't lose it? Default: no for the first release; a missed teaser costs little.
3. **How long does the match overlay hold?** Default: 4 seconds from the first signal, then the winner screen; a tap goes on earlier. Long enough for the room to react together, short enough that "where to watch" isn't hidden. Alternative: hold until tapped.
4. **Which avatars on a majority match, and does Party mode say who said yes?** [What players see](../product/game-modes.md#what-players-see-party-and-blind) says a Party match shows "who said yes". On a majority match ("7 of 9"), that shows who didn't, which the same doc rules out. Default: every seated player's avatar in seat order, no marks, with the count, in both kinds of match. "Who liked the runners-up" stays on the winner screen as already decided.
5. **Two films matching at once** after someone leaves: which one is the pick? Default: the most likes, then the most super likes, then the deck's group score, then the lowest film id, so the order is fixed and favours the strongest film.
6. **The super-like star for the others** (a default to confirm in [the answers](../product/game-modes.md#the-answers)). In a 2-player room a star on your card says exactly what the other person did, and in 3 it narrows it to one of two. It also needs a new payload (super-like counts never reach phones today). Default: leave it out of the first release; if it comes later, only from 4 players.
7. **The card back doesn't scroll.** Default: the synopsis is cut to fit, so every swipe works from the back and the back never fights the swipe up. Alternative: the back scrolls, and "Seen it" is button-only while a card is flipped.
8. **The swipe's starting values** (the commit lines, throw speed, tilt, the card 1 lean) in [Starting values](#starting-values). Default: accept them as placeholders and tune them in the first feel check.

Questions 9 and 10 come from the Final Cut beat. Harry took both defaults on 4 November 2026 ([decisions.md](../decisions.md)); they stay here as the record.

9. **Can a veto be taken back before lock-in?** Decided on 4 November 2026: yes (the default). Until lock-in, a long press on the vetoed poster lifts the veto and a long press on another poster moves it; the one veto is spent only when the ballot is locked in. A slip of the thumb shouldn't cost the player the one veto of the game, and nothing reaches the other phones until the close anyway. The rule is in [the vote](../product/game-modes.md#the-vote-pick-one-veto-one).
10. **What does a finalist show during the round?** Decided on 4 November 2026: the poster, the title and the year, with no details sheet (the default). Most finalists are films the players liked as cards, and the 60 seconds are for talking, not reading. A fill film ([the finalists](../product/game-modes.md#the-finalists), rule 3) may be one some players never saw; if playtests show people asking "what's that one?", a details button comes later.

Questions 11 to 13 come from the reveal beat. Harry took all three defaults on 4 November 2026 ([decisions.md](../decisions.md)); they stay here as the record.

11. **Knock-outs in a 2-player room.** Decided on 4 November 2026: show them (the default), with no points. With 2 players, a knocked-out film you didn't veto is the other player's veto, and "The only film nobody vetoed" says the same. Default: show the knock-outs at every size, as [what players see](../product/game-modes.md#what-players-see-party-and-blind) says, with no points on top. The round already tells players their veto "stays secret until the end", and couples are a main Final Cut group: the vetoes landing is their moment. Alternative: at 2 players, show only the winner, without the line or the stamps. That hides less than it seems, since the winner alone still says a lot.
12. **Points only from 3 ballots.** Decided on 4 November 2026: yes (the default). With 2 ballots, your own taken from the totals gives the other person's ranking exactly. Default: points show only when 3 or more ballots were counted (the phone works it out from the points, no extra read), and never on a knocked-out film. Alternative: never show numbers, only the winner.
13. **The reveal's timings** (the steps, 2.5 s on the winner, 3 s for a missed reveal's reads) in [Starting values](#starting-values). Decided on 4 November 2026: they are placeholders (the default), tuned in Harry's feel check and the first playtest.

The shortlisted beat (5 November 2026) raises no new question: it follows Harry's rules of that day and his answers Q37.1 (the beat starts from the phone's own answer) and Q37.2 (a missed beat isn't replayed), in [decisions.md](../decisions.md). Its numbers are starting values for the feel check.

# Signature moments

The beats of the game's signature moments: when each one happens, what it tells the players, how long it lasts, what every phone in the room sees and when, and what must never be revealed. Written on 3 November 2026 by the game designer agent, before slices 10 (Swiping) and 11 (The match) are planned. This first version covers the swipe, the flip, the near miss and the match. The winner was added on 4 November 2026, before M6.16; the Final Cut and the reveal come before M6.15 and M6.31.

It builds on [the answers](../product/game-modes.md#the-answers), [when it's a match](../product/game-modes.md#when-its-a-match) and [what players see](../product/game-modes.md#what-players-see-party-and-blind) in the game modes, [the card stack](../architecture/app-structure.md#the-card-stack), [the vote queue](../architecture/app-structure.md#the-vote-queue) and [realtime](../architecture/app-structure.md#realtime) in the app structure, [the first game](../product/onboarding.md#the-first-game) in onboarding, [the signature moments](../agent-workflow.md#the-signature-moments) in the agent workflow, and the `motion` skill (tokens, the haptic vocabulary, the two sounds). The backend facts come from the merged migrations of 3 November 2026: a deal is 25 cards per seat with a shared opening of 10, a vote counts on any active card in the room's pool, "Seen it" saves to the profile, and `api.cast_vote` checks matches (M1.13) while the match rules and their values are M6.1, not yet built.

The game designer writes the beat; the designer turns it into the feel (curves, sizes, layout) in the swipe and match screen specs. Every number below that isn't a motion token is a starting value (see [Starting values](#starting-values)), and every product choice a beat raised is in [Questions for Harry](#questions-for-harry) with a recommended default. Where a beat depends on one of those answers, it says so.

## Contents

1. [What every moment keeps](#what-every-moment-keeps)
2. [The swipe](#the-swipe)
3. [The flip](#the-flip)
4. [The near miss](#the-near-miss)
5. [The match](#the-match)
6. [The winner](#the-winner)
7. [Starting values](#starting-values)
8. [Changes this asks elsewhere](#changes-this-asks-elsewhere)
9. [Questions for Harry](#questions-for-harry)

## What every moment keeps

**What reaches the other phones.** Swipes never reach another phone while a game runs (CLAUDE.md rule 6). Only these do, and only as counts:

| Moment | What the other phones get | When |
| --- | --- | --- |
| A swipe | Nothing about the answer. The player's swipe count, in presence, every 5 swipes (the player pills) | Every 5 swipes |
| A flip | Nothing. Whether the card was flipped goes to the server's `swipe_log` with the vote, never to a phone | Never |
| A near miss | A count of likes on one film, `near_miss` with `likes` and `of` | After the like that makes it a near miss |
| A match | The film, the kind, the count (`3 of 3`, `7 of 9`) and whether it decides the night, `match` | At once, on every phone |

**Never shown, in any moment:** who noped, who said "Seen it" and didn't want to rewatch, what anyone answered, the order in which people answered, and which player's like completed a match. Avatars always appear in seat order (the order of the player row), never in the order of votes. A count is the most any phone learns during a game.

**Couch rule.** Most groups sit together and can see each other's faces and sometimes screens. A beat must not let a player work out someone's nope from timing: nothing appears on everyone's phone at the moment one person swipes, except the match itself (which only ever says yes). This is why [the near miss](#the-near-miss) shows on the cards still waiting for an answer, not on every phone.

**Haptics** use the vocabulary in `@/lib/haptics`, one meaning each: `commit`, `throw` and `match` here; `press` comes with every `Pressable`. No moment adds a new haptic. The haptics setting turns all of them off.

**Sound** is only for the match here (`playSound('match')`), decided on 29 October 2026. The swipe, the flip and the near miss are silent.

**Reduce Motion.** Reanimated skips animations by default when the system setting is on, which would make things jump. Each beat says what replaces its movement: flights become short slides or fades, scales become fades, chases and pulses become still. Fades use opacity only. Haptics and sound don't change with Reduce Motion; they follow their own settings.

**The next card never waits.** No moment blocks the stack except the match, which ends the game. A new touch cancels any animation still running on the top card (the `motion` skill's rule 1); a card already thrown finishes its flight on its own.

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

**Seen it.** In the first release every room uses `allow_rewatch`, so "Seen it" asks one more question before the card leaves (M6.12, M6.2):

1. The swipe up (or the eye button) lifts the card a little and stops: the SEEN IT stamp stays, and the question "Watch it again tonight?" appears with Yes and No. The card doesn't fly yet.
2. Yes throws the card right as a like, No throws it left as a nope, each with `haptics.throw()`. Either way the film is saved as seen (the M5.4 migration).
3. Any other touch on the card (a drag back down, a tap outside the two answers) puts the card back at rest with no vote. Undoing later brings the card back to its front, without the question.

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

**The back doesn't scroll** (default, [question 7](#questions-for-harry)): a scroll inside the card would fight the swipe up for "Seen it". The synopsis is cut to fit the back, with an ellipsis.

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

**"It's a match": every phone at once, the same celebration everywhere, and the night has its film.** This is the payoff of the whole game and the one moment that's allowed to be loud: the marquee bulbs chase, the poster takes the whole screen, everyone's avatars pop in, every phone in the room buzzes together and plays the match sound. On a couch, the room should react out loud at the same second.

It celebrates the group, not a person: no phone shows who liked it last, or who didn't.

### When it happens

`api.cast_vote` makes the match after a like (M1.13, with the rules of M6.1), and the leave and remove re-check can make one too (M4.2); the sweeper will after a long silence (M6.6). In Quick Match, the only mode in the first release, the first match is the night's pick: the room goes to `done` and the `match` event says `decided`. (Keep swiping is M18.4, after the first release, so the overlay has no Keep swiping button yet.)

Each phone starts the overlay at the first of two signals: the `ok` answer to its own vote with `match: true`, or the `match` event. The phone that completed the match usually knows a few hundred milliseconds early from its own answer; starting on the first signal keeps that phone in step with the others rather than ahead of them. The overlay is identical on that phone, so it doesn't single out the last like.

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

- **Two matches at once.** In Quick Match it can't happen: votes in a room run one after another under the room's lock, the first match ends the room, and any later vote gets `closed`. The re-check after someone leaves walks the liked films and stops at the first that decides the night; which film goes first when two would match at once is [question 5](#questions-for-harry). The phone shows one overlay per room and ignores a second `match` event for a room that's already decided. (Final Cut mode, after the first release, shortlists several matches in a row; each gets a short "Shortlisted" notice, not this overlay.)
- **A card mid-flip or on its back.** The overlay covers it; the card's side doesn't matter. If it's the matched film, the poster is the same film.
- **The "Watch it again tonight?" question is open.** It closes without a vote; the overlay takes over.
- **A near-miss toast is showing.** It leaves with `layout.fadeOut` as the scrim comes in.
- **The phone was offline or in the background.** It didn't get the event. When the connection comes back or the app returns to the foreground, it re-reads the room ([missed messages are normal](../architecture/app-structure.md#realtime)); its queued votes come back `closed` and are dropped quietly. It then plays the overlay once, in full, because a player who missed the moment still deserves it, and goes on to the winner screen. A phone that already showed the overlay for this room goes straight to the winner screen.
- **The match comes from someone leaving.** Nobody just swiped; the overlay is the same.
- **The finale started at the same moment.** The room's lock orders them: if the like came first, the match wins and no finale starts; if the finale started first, the like gets `closed` and the Final Cut screen takes over.
- **The phone is locked.** No notification in the first release; the overlay plays when the player comes back, as above.

## The winner

### The beat

**"Tonight's pick": the film, and where to watch it.** The celebration is over (the match overlay, or later the Final Cut's reveal). This screen is the calm after it: one poster, the title, the logos of the room's services that have it, and "More details". It answers the only question left on the couch, "where do we put it on?", and then lets everyone look up at the TV.

It's the same screen on every phone, and it belongs to the group: no names, no avatars, no counts, nothing about how anyone voted.

### How it arrives

Every phone gets there on its own, from the same room state (`done` with a `pick_order` 1 row), so all phones show it within network latency of each other.

| From | How the arrival feels |
| --- | --- |
| The match overlay ([the match](#the-match)) | A settling, not a new moment. The winner screen is already under the overlay; the overlay fades out (`layout.fadeOut`) and the same film's poster is there, still. Nothing on the winner screen animates in |
| The Final Cut (until M6.31, Q15.4) | The news itself, told quietly. "Counting the votes" gives way to the winner screen with a fade (`layout.fadeIn`, `duration.base`). This is the one arrival where the players learn the winner here, so the title is what the screen reader reads first. When M6.31 ships, the reveal plays the celebration and hands over as the match overlay does |
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
- Anything that pushes: no "play again now", no streak, no timer.

Runners-up, with who liked them in Party mode, are M6.32, after this beat.

### Edge cases

- **No service lists the film any more.** The screen says so and keeps "More details" (Q16.2). No watch link: "More details" is hidden (Q16.1).
- **A player leaves with Home.** Nothing reaches the other phones; their screen doesn't change.
- **A screen reader is on.** On arrival, focus goes to the title, read with "Tonight's pick".
- **The room is `done` with no pick.** Not this beat: the no-pick slot shows instead (M6.17).

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
| The winner screen spec (screens/winner.md, to be written), M6.16 | The single-film pick's line, "The only film anyone liked" (Q4.4), above the title. The phone knows it from the `match` event's `reason: 'only_film'`, or on a cold start from a `finale` pick with no row in `api.rounds` | Q4.4's default puts this line on the winner screen, and M6.16's brief doesn't list it yet |

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

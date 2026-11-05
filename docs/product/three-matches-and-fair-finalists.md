# Proposal: up to 3 matches, and finalists for everyone

Harry's feedback from a game on staging on 5 November 2026 (his phone and three bots that each like about half the cards at random), turned into rule changes he can answer in one go. Written by the game designer agent on 5 November 2026. It builds on [the modes](game-modes.md#the-modes), [when it's a match](game-modes.md#when-its-a-match), [the finale](game-modes.md#the-finale), [time to a pick](game-modes.md#time-to-a-pick), [the reveal](../design/moments.md#the-reveal) and the [M18 lines of the roadmap](roadmap.md#m18-more-modes-and-host-controls). Nothing here is decided: the answers go in [decisions.md](../decisions.md), then into game-modes.md, and become tasks.

Every number below comes from bots with made-up tastes ([tools/sim/shortlist.mjs](../../tools/sim/shortlist.mjs), on the model in [simulations.md](simulations.md#the-model)). They test mechanics, not fun.

## Contents

- [The questions](#the-questions)
- [1. The first match ends the game](#1-the-first-match-ends-the-game)
- [2. My likes weren't in the Final Cut](#2-my-likes-werent-in-the-final-cut)
- [The simulation](#the-simulation)

## The questions

Each has a recommended default. Answering "defaults" accepts all of them.

1. **Should Quick Match and Date Night keep swiping after a match, and end at the third match (option 1A)?** Default: yes. A match goes on a shortlist, every phone gets a short "It's a match: 1 of 3" beat, and swiping goes on. The other options are a 90-second last call after the first match (1B) or a "Find more" button for the host on the match screen (1C).
2. **How many matches end the game: 3, or 2?** Default: 3, as a starting value ("Matches that end the game") to tune in playtests.
3. **When the card count, the time limit or "everyone done" arrives with only 1 match, is that match the pick, with no vote?** Default: yes. The full "It's a match" overlay plays for it then.
4. **With 2 or 3 matches, is the finale a vote between the matches only, with no other films added, and with 2 films "Pick one" without a veto?** Default: yes. With 0 matches the finale stays as today (with question 7).
5. **Does it apply to every group size in Quick Match and to Date Night, in Party and Blind alike?** Default: yes. From 5 players the finale stays a ranked vote without vetoes.
6. **Does it go into the first release as new M6 tasks, before the M6.20 playtest, with the roadmap changed as below?** Default: yes. M18.2 shrinks to what's left of Final Cut mode (a shortlist of 4 with films added), M18.4 Keep swiping is dropped, and Vote now (M18.5, M18.9) also works after the first match.
7. **Should every present player with a like get a finalist they liked, when there are enough seats (option 2A)?** Default: yes. After the matches, the finale takes the liked film that gives a seat to the most players who have none yet, until everyone with a like has one; today's rank fills the rest.
8. **Should the Final Cut say once how its films were chosen ("From your likes, with one for each of you when we can"), and never mark which film is whose, not even on your own phone?** Default: yes.

## 1. The first match ends the game

### What Harry saw

In Quick Match the first match is the night's pick ([when it's a match](game-modes.md#when-its-a-match)). With the staging bots, it comes very early: a film needs every voter's like, and bots like half of everything. In the simulation, three or four players with those bots matched at a median of 0:27 and 0:54. Players with human-like tastes (medium agreement, a 15% like rate) match later, at 1:17 and 2:38, and a quarter to a half of 3- and 4-player games never match at all. So part of the feeling comes from the bots. The wish behind it stands, though: a group likes to see a few films everyone wants before choosing, and a single match leaves nothing to choose.

### Option 1A: a shortlist of up to 3 matches (recommended)

The rule:

| Matches when the game ends | What ends it | The pick |
| --- | --- | --- |
| 3 | The third match, at once | A Final Cut between the 3 matches: "Pick one. Veto one." (a ranked vote from 5 players) |
| 2 | The card count, the time limit or everyone done | A vote between the 2: "Pick one", no veto (a veto between two films is a second vote for the other) |
| 1 | The same triggers | The match is the pick, with no vote. The "It's a match" overlay plays then |
| 0 | The same triggers | Today's finale: the finalists from swipes ([question 7](#2-my-likes-werent-in-the-final-cut)), "Pick one. Veto one." |

- **Match 1 and match 2.** Every phone gets a short "shortlisted" beat (below), not the full overlay, then everyone goes back to their deck where they left off. The film leaves every deck.
- **The swipe screen** shows the shortlist in the top bar: up to 3 small posters and "1 of 3". Matches are already public (the overlay shows them to the whole room), so this shows nothing new about anyone.
- **The full celebration** stays for the night's pick: the match overlay when one match is the pick, the reveal when a vote picks.
- **Party and Blind** behave the same. Blind keeps hiding the near miss; the shortlist is the room's, not anyone's.
- **Date Night** (2 players) works the same way. Couples match often, so they reach 3 matches most of the time (69% with medium agreement) and choose between 3 films they both want.

**The shortlisted beat** (a draft for [moments.md](../design/moments.md); the designer turns it into motion once Harry agrees):

| | |
| --- | --- |
| When | A match that doesn't end the game (`match` with `decided: false`) |
| What it tells the players | "You all said yes to this one. It's on the shortlist. Keep going." |
| How long | About 2 seconds; the stack takes no input for that time |
| What everyone sees at once | The card stops (a drag springs back). The poster lifts off the card and flies into its slot in the top bar's shortlist. "It's a match: 1 of 3" pops over the stack with the count ("3 of 3", "4 of 5"). One success haptic, lighter than the match's. Then the next card |
| The third match | The beat plays as the last slot fills, then the Final Cut's intro starts |
| Never shown | Who liked it, whose like completed it, avatars with marks. No "2 to go" pressure, no countdown |

Copy, proposed: "It's a match: 1 of 3" and « C'est un match : 1 sur 3 »; the top bar's label "Shortlist" and « Sélection ».

**What it costs in time.** With medium agreement, the median time to a pick goes from 0:28 to 2:38 today to 1:58 to 3:28 (2 to 6 players), and games picked within 5 minutes go from 97 to 100% to 95 to 100%. The worst case doesn't move, since the card count and the 6-minute limit still end every game. The cost is the swiping after the first match when no third one comes: a median of 1:26 to 1:49 for 3 to 6 players. Bots like the pick as much as today (the pick is still a film everyone liked).

**What changes in code**

| Where | Change |
| --- | --- |
| The room's rule | A new value, `shortlist_size` (3), in the match rules for `quick_match` and `date_night`, read through `internal.pick_rule`. `game_modes.ends_on_first_match` becomes false for both (an update to seed data, nothing dropped) |
| `internal.check_card_match` | On a match: mark the card `matched`, insert the `matches` row, then count the room's matches. Below `shortlist_size`: broadcast `match` with `decided: false` and `shortlisted: n, of: 3`. At `shortlist_size`: call `internal.start_finale` with reason `shortlist_full` (the enum value exists). When a leave, a removal or the sweeper makes several films match at once, take them most liked first and stop at the size |
| `internal.start_finale` | With 2 or more matches: the candidates are the matches only, seeded most liked first, then group score, then the lowest id; with exactly 2 the round's kind is `ranked_vote` (no veto). With 1 match: it is the pick, as `only_film` today, with `reason: 'only_match'`, and phones play the match overlay. With 0: today's path |
| `internal.maybe_start_finale` | No change: the card count, the time limit and everyone done stay the triggers |
| `api.cast_vote` | No change to its answers (`match: true, decided: false` already exists for Final Cut mode). The near miss and propagation skip `matched` cards, as they do today |
| `api.close_round_stage` | No change: counting already handles 2 or 3 films |
| `rooms.stats` | Add the number of matches, for playtests and analytics |
| Swipe screen | The shortlist in the top bar; the shortlisted beat on `decided: false` |
| Match overlay | Plays only for `decided: true`, and for `only_match` |
| Final Cut | The 2-film layout without the veto; the 3-film layout already exists |
| Docs | game-modes.md (the modes, when it's a match, the finale, time to a pick, starting values), moments.md (the shortlisted beat), the swipe, match and Final Cut screen specs, decisions.md |

### Option 1B: 1A with a last call

As 1A, but the shortlist also closes 90 seconds after the first match. The top bar shows a quiet progress line, no ticking numbers. With medium agreement it saves 6 to 26 seconds at the median (1:52 to 3:08 instead of 1:58 to 3:28) and keeps 97 to 100% of games within 5 minutes, but fewer games reach 3 matches (3 to 59% instead of 6 to 69%), and a visible clock during swiping adds pressure the rest of the game doesn't have. Better kept in reserve: if playtests show groups waiting after the first match, the last call is a value to add.

What changes in code: 1A, plus a trigger in `internal.maybe_start_finale` (the first match's time plus 90 seconds, checked after each vote and by the sweeper) and a new `finale_reason` value `last_call` (an enum value added, nothing removed). The swipe screen shows the progress line.

### Option 1C: the group chooses

The first match keeps today's overlay, with a host button "Find more" next to where to watch. Tapping it within 60 seconds reopens the night towards a shortlist of 3 (M18.4 and M18.9's Keep swiping, moved earlier and extended). It costs nothing to groups happy with the first match. But it asks a question in the middle of the celebration, only the host can answer, and Harry's point is that ending at one match isn't fun by default.

What changes in code: `api.keep_swiping` (M18.9) built now, with the shortlist counting from 1A in `check_card_match` once the room was reopened; the match overlay gets the host's button.

### How it fits the roadmap

- **M18.2** (Final Cut mode: matches join a shortlist, the finale starts when it's full). 1A builds its core in Quick Match: the shortlist, the `shortlist_full` trigger, a vote between matches. What's left of Final Cut mode is a shortlist of 4 (3 for 2 players) filled with liked films. Recommended: M18.2 shrinks to that, or is dropped at M18 if playtests say 3 is enough.
- **M18.4 and M18.9, Keep swiping.** With 1A swiping already goes on after a match, so Keep swiping has nothing left to do. Recommended: drop it.
- **M18.5 and M18.9, Vote now.** The way out for a group that's happy with what it has: after the first match, the host can start the vote now (with 1 match, it's the pick). Recommended: keep it, and add "at least 1 match" as a second way to qualify next to "10 cards each and 2 liked films".
- **Q4.6** kept the full-shortlist trigger for M18.2. 1A brings it forward; the decision would be replaced, not edited.
- **New tasks, before M6.20:** one backend task (`check_card_match`, `start_finale`, the rule value, pgTAP), one app task (the shortlisted beat, the top bar, the 2-film Final Cut), and the moments and screen specs first.

## 2. My likes weren't in the Final Cut

### Is it a bug?

No. `internal.start_finale` ([20261104174722_finale_start.sql](../../supabase/migrations/20261104174722_finale_start.sql), still the current version) does what [the finalists](game-modes.md#the-finalists) and decisions Q4.1 and Q4.2 say: matches first, then films with at least one like by likes + 2 × super likes - nopes, then group score, then the lowest id, then films nobody noped until the list is full. No step looks at who liked what, so nothing makes sure each player is in it.

Why Harry's likes lost, in that design:

- **The rank counts answers, and fast players answer more.** The bots swipe faster than a person reading cards, so they answered far more films. A film 3 bots liked and Harry never reached scores 3; a film Harry liked scores 1 plus the bots' likes minus their nopes, about 1 with random bots.
- **A film you noped can beat a film you liked.** A film 3 bots liked and Harry noped scores 2. A film Harry liked with 1 bot like and 1 bot nope scores 1.
- In the simulation of his game (4 players, random 50% likes, bots twice as fast), the human seat had no liked finalist in **24% of finales**. With medium or low agreement and today's rule, 3 to 16% of players with a like have none, and 9 to 45% of finales leave someone out (2 to 6 players).

Not checked: the room's own data on staging (its `finale_reason`, votes and finalists). The rule alone explains what he saw.

### Option 2A: one seat each, when there are enough (recommended)

The finalists, in order:

1. Matches, most liked first (as today).
2. **New:** the liked film that gives a seat to the most present players who don't have one yet. Ties go to today's rank (likes + 2 × super likes - nopes), then group score, then the lowest id. Repeat until every present player with a like has a finalist they liked, or the seats run out.
3. Films with a like by today's rank.
4. Films nobody noped, by group score, until the list is full.

- **The cap** stays the finalist count: 3 for 2 players, 4 otherwise. A seat usually covers several players at once (the first pick is nearly always the most liked film), so in the simulation 4 seats were enough for every player with a like at every size from 2 to 6.
- **A player who liked nothing** gets no seat. Their voice is their ballot and their veto.
- **Players who left** don't count; a late joiner with a like does.
- **What it costs:** nothing measurable. Bots liked the pick as often as today (within 1 point at every size), and each player still liked about the same number of finalists on average.
- **It also fixes the speed bias.** A slow reader's likes no longer lose to films only the fast players reached.

**Privacy.** The rule runs inside Postgres on `votes`, which never leave it. Phones get the finalists, as today, and no step names anyone. What a player can work out doesn't change: a finalist you didn't like was liked by someone else (true today, since rule 2 needs a like), and with 2 players that someone is the other player (also true today). Nothing about nopes is added. Two cautions:

- No phone may mark a finalist as "yours", "Sam's" or "picked for you", and the reveal stays as it is ([what never happens](../design/moments.md#what-never-happens)).
- With 2A, more finalists have a single like. In Party mode, M6.32 plans the winner screen's runners-up "with who liked them" after the pick, which will then more often show one face alone (and so who didn't like it). That is M6.32's open question, not a new leak, but it gets sharper with 2A.

**What changes in code**

| Where | Change |
| --- | --- |
| `internal.start_finale` | Step 2 above, between the matches and today's rank: read the present seats' likes, super likes and "Watch it again tonight? Yes" from `votes`, then pick greedily until everyone with a like is covered or the seats run out. The seeds follow the order of the list |
| `internal.check_card_match`, `internal.maybe_start_finale`, `api.cast_vote` | No change |
| pgTAP | A player whose likes all rank low gets a seat; a player who liked nothing gets none; more uncovered players than seats (5 or more players); the ties; a player who left doesn't count |
| Final Cut | The intro line from question 8 |

### Option 2B: a bigger Final Cut when someone is left out

Today's rank, then up to one more finalist (5) when a present player with a like has none. It keeps the rank untouched, but a fifth poster crowds the screen at 375 points, makes ranking slower inside the 60 seconds, and still leaves out a second player who's missing. What changes in code: `internal.start_finale` and the Final Cut layout for 5.

### Option 2C: keep the rule, explain it

Only the line from question 8, and maybe a "How we chose these" sheet. It answers "is it a bug?" but not "I'm not in it". What changes in code: copy on the Final Cut screen only.

### Transparency: what the screen can say

Harry wondered whether it was a bug because nothing said where the finalists came from. Without breaking privacy, the Final Cut's intro can say one fixed line, the same in every room:

- "From your likes, with one for each of you when we can." « Tirés de vos j'aime, avec un film pour chacun quand c'est possible. »

A fixed line tells nobody anything about this room. A line that changes with the room ("Everyone has a film here", shown only when true) would tell the room when someone is left out, so it's not proposed. Marking your own liked finalists on your own phone is not proposed either: on a couch a neighbour sees your screen, and the finalists you saw but didn't mark are the ones you noped.

## The simulation

`node tools/sim/shortlist.mjs` (about 2 minutes; `--games 300` for a quick run, `--only matches` or `--only finalists` for one table). 1,000 games per cell, seed 1. The staging bots' world ("random 50%"): every bot likes any card half the time, no shared taste, no super likes. Medium and low agreement are the worlds of [simulations.md](simulations.md#what-is-made-up). Paces and voting times are made up; the shortlisted beat is taken as a 3-second pause for everyone.

### How games end, and when

Medium agreement (0.25):

| Players | Rule | 3 matches | Ended with 2 | With 1 | With 0 | Median | 90th pct | Within 5 min | Swiping after the first match |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | Today |  |  | 96% | 5% | 0:28 | 1:37 | 100% |  |
| 2 | 1A, up to 3 | 69% | 17% | 10% | 5% | 1:58 | 3:05 | 100% | 0:59 |
| 2 | 1B, last call 90 s | 59% | 23% | 14% | 5% | 1:52 | 2:43 | 100% | 0:59 |
| 3 | Today |  |  | 76% | 24% | 1:17 | 3:40 | 99% |  |
| 3 | 1A, up to 3 | 24% | 23% | 30% | 24% | 3:06 | 4:17 | 97% | 1:37 |
| 3 | 1B, last call 90 s | 16% | 24% | 36% | 24% | 2:40 | 3:50 | 99% | 1:30 |
| 4 | Today |  |  | 52% | 48% | 2:38 | 4:23 | 97% |  |
| 4 | 1A, up to 3 | 6% | 13% | 34% | 48% | 3:28 | 4:40 | 95% | 1:49 |
| 4 | 1B, last call 90 s | 3% | 11% | 38% | 48% | 3:08 | 4:27 | 97% | 1:30 |
| 5 | Today |  |  | 84% | 16% | 1:09 | 3:10 | 100% |  |
| 5 | 1A, up to 3 | 35% | 22% | 27% | 16% | 2:56 | 3:59 | 99% | 1:26 |
| 5 | 1B, last call 90 s | 24% | 28% | 33% | 16% | 2:37 | 3:33 | 99% | 1:26 |
| 6 | Today |  |  | 65% | 35% | 1:55 | 3:55 | 99% |  |
| 6 | 1A, up to 3 | 10% | 21% | 35% | 35% | 3:17 | 4:19 | 98% | 1:38 |
| 6 | 1B, last call 90 s | 6% | 20% | 40% | 35% | 2:57 | 4:01 | 99% | 1:30 |

Low agreement (0.1), 1A against today: medians 2:20 to 3:37 instead of 0:43 to 3:30, within 5 minutes 93 to 100% instead of 94 to 100%, and 3 matches in 0 to 45% of games (45% for 2 players, 7% for 3, 0 to 5% from 4). Most groups who disagree end at the card count with 0 or 1 match, as today.

The staging bots (random 50%), 1A: 3 matches in 71 to 100% of games, medians 1:06 to 2:50, every game within 5 minutes at 2, 3, 5 and 6 players and 98% at 4.

A shortlist of 2 instead of 3 (question 2), medium agreement: medians 1:23 to 3:18, within 5 minutes 96 to 100%, and 2 matches in 19 to 86% of games.

In every world and every rule, the share of players who would like the pick stays within a point of today's.

### Who's represented

Only the games that reach a finale with no match, under today's rule. "Has a liked finalist" counts players with at least one like.

| World | Players | Finales | Today: players with a liked finalist | Today: finales where everyone has one | 2A: both | Bots who like the pick, today and 2A |
| --- | --- | --- | --- | --- | --- | --- |
| Staging bots, twice as fast as the human | 4 | 388 of 20,000 | 93% (the human: 76%) | 73% | 100% | 89%, 89% |
| Staging bots, twice as fast as the human | 6 | 169 of 20,000 | 94% (the human: 82%) | 66% | 100% | 79%, 78% |
| Medium agreement | 2 | 45 of 1,000 | 84% | 69% | 100% | 57%, 57% |
| Medium agreement | 3 | 237 of 1,000 | 97% | 91% | 100% | 65%, 65% |
| Medium agreement | 4 | 476 of 1,000 | 97% | 88% | 100% | 71%, 71% |
| Medium agreement | 5 | 156 of 1,000 | 92% | 62% | 100% | 60%, 61% |
| Medium agreement | 6 | 346 of 1,000 | 94% | 67% | 100% | 63%, 63% |
| Low agreement | 2 | 109 of 1,000 | 84% | 69% | 100% | 52%, 53% |
| Low agreement | 4 | 795 of 1,000 | 96% | 83% | 100% | 67%, 67% |
| Low agreement | 6 | 777 of 1,000 | 91% | 55% | 100% | 59%, 60% |

With the staging bots, finales are rare (a match comes first), so those rows play 20 times more games. With today's rule, the first seat was left out while a film it noped was in the vote in 3 to 15% of finales; with 2A, never in these runs.

What the simulation leaves out: whether a shortlist of 3 is more fun, whether waiting after the first match feels long, and whether players notice a seat was kept for them. The first playtest (M6.20) should time the swiping after the first match and ask "was there a film for you in the vote?".

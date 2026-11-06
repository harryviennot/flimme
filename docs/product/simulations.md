# Rules simulations

Bot games played under the match rules, to give Harry evidence for roadmap task M0.7: confirm the finale (one 45-second round) and the time limits (6 minutes, 7 for 5 to 10 players, 40 cards). It covers how to run the simulation, the model and every made-up number in it, the results by group size, and what they suggest. Written on 30 October 2026 by the game designer agent. [Per-player genres](#per-player-genres) was added on 6 November 2026 for roadmap task M6.52: it checks whether each player picking genres in the lobby keeps the time to a pick under 5 minutes.

It builds on [Time to a pick](game-modes.md#time-to-a-pick), [When it's a match](game-modes.md#when-its-a-match), [The finale](game-modes.md#the-finale) and [How a game ends](game-modes.md#how-a-game-ends) in the game modes, the deck engine's [How a game unfolds](../architecture/deck-engine.md#how-a-game-unfolds) and [Weighted shuffle](../architecture/deck-engine.md#weighted-shuffle), and [Like propagation and refills](../architecture/data-model.md#like-propagation-and-refills) in the data model. The values under test are defaults waiting for a yes in [decisions.md](../decisions.md#defaults-not-yet-confirmed). Nothing here is decided: every change below is a proposal for Harry.

> **The bots' tastes are made up.** So are their swipe speeds and how long they take to vote. These games test the mechanics (how often each group size matches before the card count, how often the finale decides, how long a pick takes), never the fun. Read every number below as "under these assumptions", and replace the assumptions with playtest data as soon as there is some.

## Contents

1. [How to run it](#how-to-run-it)
2. [The model](#the-model)
3. [Results](#results)
4. [What it means for M0.7](#what-it-means-for-m07)
5. [Gaps the model had to fill](#gaps-the-model-had-to-fill)
6. [What playtests should measure](#what-playtests-should-measure)
7. [Per-player genres](#per-player-genres) (M6.52)

## How to run it

```sh
node tools/sim/run.mjs
```

It prints every table in [Results](#results) as Markdown, in about 5 minutes (2,000 games per group size and rule set). No dependencies. Everything is seeded, so the same command prints the same tables.

| Option | What it does |
| --- | --- |
| `--games 300` | Fewer games per cell: faster, noisier |
| `--seed 7` | Another seed (default 1). Numbers should move by a point or two, no more |
| `--only finale` | One section: `headline`, `cards`, `limits`, `finale`, `majority`, `suggested`, `sensitivity`, `nearmiss` |

A second script, [tools/sim/shortlist.mjs](../../tools/sim/shortlist.mjs), plays a shortlist of up to 3 matches and fairer finalists for [a proposal](three-matches-and-fair-finalists.md#the-simulation). A third, [tools/sim/genres.mjs](../../tools/sim/genres.mjs), plays [per-player genres](#per-player-genres) against today's deck through the second one's game. The rules and the bots are in [tools/sim/game.mjs](../../tools/sim/game.mjs); the rule sets and tables in [tools/sim/run.mjs](../../tools/sim/run.mjs). To try another value, add a rule set to `RULES` in `run.mjs`, or change a made-up number in `WORLD` in `game.mjs`. Every rule set plays the same groups and decks, so differences between rows come from the rules, not from luck.

## The model

Only Quick Match is simulated: it's the mode the first release ships ([decisions.md](../decisions.md#decided)). Date Night plays like Quick Match for 2. Final Cut mode isn't simulated.

### What follows the docs

| Rule | In the simulation | Source |
| --- | --- | --- |
| Match rule | Everyone up to 4 players; at least 70% of present players from 5 (4 of 5, 5 of 6, 5 of 7, 6 of 8, 7 of 9, 7 of 10), checked after every like, whether or not the others have reached the card | [When it's a match](game-modes.md#when-its-a-match) |
| Card count | The finale starts when every player has answered the rule's number of cards, so the slowest player decides | [When it starts](game-modes.md#when-it-starts) |
| Time limit | The finale starts at the limit, if nothing happened first | [When it starts](game-modes.md#when-it-starts) |
| Shared warm-up | The same 10 cards for everyone, in the same order | [How a game unfolds](../architecture/deck-engine.md#how-a-game-unfolds) |
| Personal decks | A weighted shuffle of the remaining films, odds ∝ e^(score / 0.3), the same group score for every player (the first release's SQL deck has no taste profiles). The SQL deal built since (M5) goes further: every seat walks the same order, which [Per-player genres](#the-genre-model) models | [Weighted shuffle](../architecture/deck-engine.md#weighted-shuffle), [Building a deal](../architecture/deck-engine.md#building-a-deal) |
| Like propagation | The first like on a film moves it into every other player's upcoming cards, just behind the 3 mounted ones, unless it was already closer | [Like propagation and refills](../architecture/data-model.md#like-propagation-and-refills) |
| Close phase | From 60% of the card count, a film one like short of a match moves up the same way for the players who haven't answered it | [How a game unfolds](../architecture/deck-engine.md#how-a-game-unfolds) |
| Super likes | 2 per player, on films a bot loves; they count as likes, and double for seeding and ties | [The answers](game-modes.md#the-answers) |
| Finalists | 3 for 2 players, 4 otherwise: liked films by likes + 2 × super likes - nopes, then group score; films nobody noped if fewer than 2 | [The finalists](game-modes.md#the-finalists) |
| The vote | Proposed: one round, rank and veto at once (no veto in the ranked vote for 5 to 10), secret vetoes, the only film nobody vetoed wins, then points, then ties. Today: a veto stage of 45 s (a veto can't remove the last two films), then a ranking stage of 60 s | [The vote](game-modes.md#the-vote-pick-one-veto-one), [Counting](game-modes.md#counting), [Finale](../architecture/data-model.md#finale) |
| A ballot not locked in when the round closes | Doesn't count; the round closes early once everyone has locked in | [The vote](game-modes.md#the-vote-pick-one-veto-one) |

### What is made up

| Number | Value | Where it comes from |
| --- | --- | --- |
| Group agreement | Correlation between two players' tastes for a film: **low 0.1, medium 0.25, high 0.4** | Made up. Each player's taste for a film is a part the group shares plus a part of their own; the knob sets the shared part. Medium is set so a 3-player game picks in about 1:20 at the median, close to the "about 2:00" in [A game at a glance](game-modes.md#a-game-at-a-glance) |
| Like rate | A bot likes a random eligible film 15% of the time, with pickier and easier players (spread 0.25 on the bar). On the cards actually dealt, that comes to 19 to 28% | Made up: "would you watch it tonight?" is a higher bar than "is it a good film". "Watch it again tonight?" answers are folded in. The first playtest's like rate is the number to plug in |
| Deck skill | The deck's score correlates 0.5 with what the group shares | Made up. Popularity and quality (the first release's SQL deck) know general taste, not this group's |
| Score spread | Group scores spread by 0.5 points on the engine's 0 to 5 scale | Made up. With the shuffle's temperature of 0.3, the best films still come up early most of the time, as the deck engine intends |
| Pool | 200 eligible films | Made up; the shuffle rarely draws deep, so a bigger pool changes little |
| Swipe pace | An average of 3 s per swipe for 2 players, 3.5 s for 3 or 4, 4 s for 5 to 10 | The placeholders in [Time to a pick](game-modes.md#time-to-a-pick) |
| Spread of the pace | Per game (chattier groups) 0.15, per player 0.3, per swipe 0.45, all on a log scale; plus a pause of 5 to 20 s on 4% of swipes (a synopsis, a remark) and, for 15% of players, one pause of 30 to 80 s per game (a text, a snack) | Made up. Long pauses stay under 90 s, so nobody stops counting as present |
| Players past the card count | Keep swiping until the finale starts | The docs don't say: see [Gaps](#gaps-the-model-had-to-fill). The sensitivity table shows "wait" |
| Voting time | Ordering n posters takes (4 + 3 × n) s at the median, spread 0.4 per player and 0.3 per game, 4% longer per player beyond 2 (more talk), plus 2 s for a veto. A veto stage alone takes 6 s at the median | Made up. 4 posters: about 16 s at the median, 30 s for a slow voter |
| How bots vote | Order by their own taste with a little noise; veto their last film only if they wouldn't like it | Made up |

### What it leaves out

- Fun, and how a pick feels. A Final Cut may be the best moment of the night; bots can't say.
- The deck learning during the game (live taste, dropped genres, leanings): the first release's SQL deck doesn't, so the bots' decks don't either. When the server deals, matches should come sooner.
- Presence, late joiners, leaving, undo, "Seen it" under `hide_seen`, Keep swiping, Vote now and changing filters. Bots never tap Vote now, so these times are an upper bound for groups that would.
- The reveal after the vote: time to a pick stops when the vote closes.
- "No pick": under these rules it needs a game where no film has a like and nobody can be seeded, which a 200-film pool never produces. The column is there to show it stays at 0%.

## Results

Each table is one rule set or one comparison, by number of players. "Match" is an instant match in the main round; "Final Cut decides" is the finale (the ranked vote for 5 to 10); "Within 5 min" counts games with a pick by 5:00; "Players who like the pick" is the share of the group whose bot taste clears its like bar for the pick. All from 2,000 bot games per cell, with made-up tastes.

### Proposed values

40 cards, a time limit of 6 minutes (7 for 5 to 10 players), and one finale round of 45 seconds.

**Proposed values, low agreement (0.1)**

| Players | Match | Final Cut decides | No pick | Median | 90th pct | Within 5 min | Time limit hit | Players who like the pick | Like rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 88% | 12% | 0% | 0:53 | 2:34 | 100% | 0% | 94% | 19% |
| 3 | 51% | 49% | 0% | 2:39 | 4:18 | 97% | 0% | 83% | 19% |
| 4 | 20% | 80% | 0% | 3:35 | 4:53 | 92% | 0% | 73% | 19% |
| 5 | 57% | 43% | 0% | 2:58 | 5:14 | 87% | 0% | 71% | 20% |
| 6 | 26% | 74% | 0% | 4:13 | 5:45 | 76% | 1% | 66% | 19% |
| 7 | 52% | 48% | 0% | 3:29 | 5:26 | 83% | 1% | 64% | 19% |
| 8 | 27% | 73% | 0% | 4:24 | 5:56 | 70% | 1% | 61% | 19% |
| 9 | 13% | 87% | 0% | 4:45 | 6:07 | 61% | 1% | 59% | 20% |
| 10 | 28% | 72% | 0% | 4:34 | 6:09 | 65% | 1% | 59% | 20% |

**Proposed values, medium agreement (0.25)**

| Players | Match | Final Cut decides | No pick | Median | 90th pct | Within 5 min | Time limit hit | Players who like the pick | Like rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 95% | 5% | 0% | 0:34 | 1:53 | 100% | 0% | 98% | 22% |
| 3 | 77% | 23% | 0% | 1:22 | 3:46 | 99% | 0% | 92% | 22% |
| 4 | 54% | 46% | 0% | 2:40 | 4:26 | 96% | 0% | 87% | 23% |
| 5 | 89% | 11% | 0% | 1:11 | 3:53 | 97% | 0% | 82% | 23% |
| 6 | 70% | 30% | 0% | 2:02 | 5:01 | 90% | 1% | 80% | 23% |
| 7 | 92% | 8% | 0% | 1:06 | 3:33 | 97% | 0% | 76% | 24% |
| 8 | 77% | 23% | 0% | 1:39 | 4:58 | 90% | 0% | 75% | 23% |
| 9 | 62% | 38% | 0% | 2:33 | 5:32 | 82% | 0% | 74% | 23% |
| 10 | 83% | 17% | 0% | 1:28 | 4:48 | 92% | 0% | 73% | 24% |

**Proposed values, high agreement (0.4)**

| Players | Match | Final Cut decides | No pick | Median | 90th pct | Within 5 min | Time limit hit | Players who like the pick | Like rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 99% | 1% | 0% | 0:23 | 1:22 | 100% | 0% | 99% | 26% |
| 3 | 92% | 8% | 0% | 0:50 | 2:49 | 100% | 0% | 98% | 26% |
| 4 | 82% | 18% | 0% | 1:16 | 3:45 | 98% | 0% | 95% | 26% |
| 5 | 98% | 2% | 0% | 0:41 | 1:57 | 99% | 0% | 86% | 27% |
| 6 | 94% | 6% | 0% | 0:59 | 3:00 | 98% | 0% | 87% | 27% |
| 7 | 99% | 1% | 0% | 0:35 | 1:43 | 100% | 0% | 81% | 28% |
| 8 | 97% | 3% | 0% | 0:50 | 2:18 | 99% | 0% | 82% | 27% |
| 9 | 93% | 7% | 0% | 1:02 | 3:18 | 96% | 0% | 84% | 27% |
| 10 | 98% | 2% | 0% | 0:43 | 1:56 | 99% | 0% | 80% | 28% |

What stands out:

- **Every size meets the target [analytics.md](analytics.md#game) sets for 2 to 4 players** (median under 5 minutes, 90th percentile under 7), at every agreement level. The slowest cell is 4 players with low agreement: 3:35 at the median, 4:53 at the 90th percentile.
- **4 players is the hardest small group.** Everyone must like the same film, and there are more people to disagree: the Final Cut decides 46% of 4-player games at medium agreement, against 23% for 3 and 5% for 2.
- **The 70% rule zigzags.** 6 players need 5 likes (83%) and 9 need 7 (78%), so they reach the Final Cut far more often than 7 players (5 of 7) or 10 (7 of 10). See [The 70% rule](#the-70-rule-not-part-of-m07).
- **The time limit almost never fires**: at most 1% of games. The card count comes first.
- **Big groups with low agreement miss "about 5 minutes".** 8 to 10 players pick within 5 minutes in only 61 to 70% of games, because the card count waits for the slowest of up to 10 players. When the slowest reaches card 40, the average player has answered 53 cards in a 3-player game, 56 with 4, 60 with 6 and 64 with 10.
- **"No pick" stays at 0%**, as the model can't produce it (see [What it leaves out](#what-it-leaves-out)).

### Card count: 30, 40 or 50

**Time to a pick (median / 90th percentile), low agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 0:53 / 2:36 | 2:56 / 5:04 | 4:13 / 5:48 | 3:04 / 6:15 | 4:59 / 6:55 | 3:44 / 6:31 | 5:15 / 7:10 | 5:42 / 7:27 | 5:27 / 7:24 |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 0:53 / 2:34 | 2:39 / 4:18 | 3:35 / 4:53 | 2:58 / 5:14 | 4:13 / 5:45 | 3:29 / 5:26 | 4:24 / 5:56 | 4:45 / 6:07 | 4:34 / 6:09 |
| 30 cards | 0:53 / 2:16 | 2:15 / 3:30 | 2:52 / 3:53 | 2:38 / 4:10 | 3:23 / 4:37 | 3:00 / 4:22 | 3:34 / 4:42 | 3:47 / 4:52 | 3:40 / 4:51 |
| 50 cards | 0:53 / 2:46 | 2:56 / 5:03 | 4:14 / 5:50 | 3:04 / 6:14 | 4:58 / 6:54 | 3:44 / 6:29 | 5:13 / 7:08 | 5:39 / 7:21 | 5:25 / 7:19 |

**Pick within 5 minutes, low agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 100% | 89% | 74% | 75% | 51% | 66% | 43% | 29% | 39% |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 100% | 97% | 92% | 87% | 76% | 83% | 70% | 61% | 65% |
| 30 cards | 100% | 100% | 99% | 98% | 95% | 96% | 94% | 92% | 93% |
| 50 cards | 100% | 89% | 74% | 75% | 51% | 67% | 44% | 30% | 41% |

**Final Cut decides, low agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 12% | 44% | 78% | 39% | 70% | 43% | 71% | 86% | 70% |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 12% | 49% | 80% | 43% | 74% | 48% | 73% | 87% | 72% |
| 30 cards | 18% | 56% | 83% | 50% | 78% | 54% | 77% | 89% | 75% |
| 50 cards | 9% | 44% | 78% | 39% | 70% | 43% | 71% | 86% | 70% |

**Players who like the pick, low agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 94% | 85% | 74% | 73% | 67% | 65% | 62% | 60% | 59% |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 94% | 83% | 73% | 71% | 66% | 64% | 61% | 59% | 59% |
| 30 cards | 92% | 80% | 71% | 69% | 64% | 63% | 60% | 58% | 58% |
| 50 cards | 96% | 85% | 75% | 73% | 67% | 65% | 62% | 59% | 59% |

**Time to a pick (median / 90th percentile), medium agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 0:34 / 1:53 | 1:22 / 4:19 | 2:44 / 5:13 | 1:11 / 4:10 | 2:02 / 5:55 | 1:06 / 3:36 | 1:39 / 5:55 | 2:33 / 6:36 | 1:28 / 5:35 |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 0:34 / 1:53 | 1:22 / 3:46 | 2:40 / 4:26 | 1:11 / 3:53 | 2:02 / 5:01 | 1:06 / 3:33 | 1:39 / 4:58 | 2:33 / 5:32 | 1:28 / 4:48 |
| 30 cards | 0:34 / 1:47 | 1:22 / 3:04 | 2:21 / 3:37 | 1:11 / 3:18 | 2:02 / 4:05 | 1:06 / 3:12 | 1:38 / 4:03 | 2:29 / 4:30 | 1:28 / 4:03 |
| 50 cards | 0:34 / 1:53 | 1:22 / 4:21 | 2:45 / 5:13 | 1:11 / 4:10 | 2:02 / 5:54 | 1:06 / 3:36 | 1:39 / 5:53 | 2:33 / 6:31 | 1:28 / 5:31 |

**Pick within 5 minutes, medium agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 100% | 95% | 87% | 94% | 80% | 95% | 82% | 70% | 86% |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 100% | 99% | 96% | 97% | 90% | 97% | 90% | 82% | 92% |
| 30 cards | 100% | 100% | 100% | 99% | 98% | 99% | 98% | 97% | 98% |
| 50 cards | 100% | 95% | 87% | 94% | 80% | 95% | 82% | 70% | 86% |

**Final Cut decides, medium agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 5% | 19% | 42% | 9% | 28% | 7% | 20% | 36% | 14% |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 5% | 23% | 46% | 11% | 30% | 8% | 23% | 38% | 17% |
| 30 cards | 8% | 29% | 51% | 15% | 36% | 11% | 28% | 43% | 22% |
| 50 cards | 3% | 19% | 42% | 9% | 28% | 7% | 21% | 36% | 15% |

**Players who like the pick, medium agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 98% | 94% | 88% | 82% | 80% | 76% | 76% | 75% | 74% |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 98% | 92% | 87% | 82% | 80% | 76% | 75% | 74% | 73% |
| 30 cards | 97% | 90% | 85% | 81% | 78% | 75% | 74% | 74% | 73% |
| 50 cards | 98% | 94% | 88% | 82% | 80% | 76% | 76% | 75% | 74% |

The card count is the lever that matters. Going from 50 to 40 (today to proposed) brings the 90th percentile down by up to 80 seconds, more for bigger groups, and from 40 to 30 by up to 75 seconds more. Each step down costs 1 to 7 points more Final Cuts and 0 to 3 points fewer players who like the pick, because a finale pick is liked by fewer players than an instant match (50 to 72% against 70 to 100%). The high-agreement tables are left out: there, every option picks within 5 minutes in at least 94% of games.

### Time limit: 5, 6 or 7 minutes

Each cell: games where the time limit started the finale, then the 90th percentile time to a pick.

**Time limit hit / 90th percentile, low agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 0% / 2:36 | 0% / 5:04 | 0% / 5:48 | 0% / 6:15 | 0% / 6:55 | 0% / 6:31 | 0% / 7:10 | 0% / 7:27 | 0% / 7:24 |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 0% / 2:34 | 0% / 4:18 | 0% / 4:53 | 0% / 5:14 | 1% / 5:45 | 1% / 5:26 | 1% / 5:56 | 1% / 6:07 | 1% / 6:09 |
| 5 min for every size | 0% / 2:34 | 2% / 4:18 | 3% / 4:53 | 7% / 5:13 | 14% / 5:29 | 9% / 5:22 | 16% / 5:33 | 21% / 5:40 | 19% / 5:38 |
| 6 min for every size | 0% / 2:34 | 0% / 4:18 | 0% / 4:53 | 2% / 5:14 | 4% / 5:45 | 3% / 5:26 | 4% / 5:56 | 5% / 6:07 | 5% / 6:09 |
| 7 min for every size | 0% / 2:34 | 0% / 4:18 | 0% / 4:53 | 0% / 5:14 | 1% / 5:45 | 1% / 5:26 | 1% / 5:56 | 1% / 6:07 | 1% / 6:09 |

**Time limit hit / 90th percentile, medium agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 0% / 1:53 | 0% / 4:19 | 0% / 5:13 | 0% / 4:10 | 0% / 5:55 | 0% / 3:36 | 0% / 5:55 | 0% / 6:36 | 0% / 5:35 |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 0% / 1:53 | 0% / 3:46 | 0% / 4:26 | 0% / 3:53 | 1% / 5:01 | 0% / 3:33 | 0% / 4:58 | 0% / 5:32 | 0% / 4:48 |
| 5 min for every size | 0% / 1:53 | 1% / 3:46 | 2% / 4:26 | 2% / 3:53 | 6% / 5:01 | 2% / 3:33 | 6% / 4:58 | 10% / 5:26 | 4% / 4:48 |
| 6 min for every size | 0% / 1:53 | 0% / 3:46 | 0% / 4:26 | 0% / 3:53 | 2% / 5:01 | 1% / 3:33 | 1% / 4:58 | 2% / 5:32 | 1% / 4:48 |
| 7 min for every size | 0% / 1:53 | 0% / 3:46 | 0% / 4:26 | 0% / 3:53 | 1% / 5:01 | 0% / 3:33 | 0% / 4:58 | 0% / 5:32 | 0% / 4:48 |

With 40 cards, the time limit is a safety net, not a pace-setter. A 6- or 7-minute limit fires in at most 5% of games and doesn't move the 90th percentile at all; 7 minutes for 5 to 10 players changes nothing against 6. A 5-minute limit fires in up to 21% of big low-agreement games and trims up to 30 seconds from their 90th percentile, but those games then pick at about 5:30, still over 5 minutes, and the slowest players lose their last cards. What the limit really guards against is a player who stops swiping for good, which bots don't do (presence handles silences over 90 seconds).

### The finale: 30, 45 or 60 seconds, against today's two stages

**Ballots not locked in when the vote closes, low agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 0% | 0% | 0% | 1% | 1% | 1% | 1% | 1% | 2% |
| Finale of 30 s | 6% | 14% | 17% | 15% | 16% | 20% | 20% | 22% | 24% |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 0% | 3% | 3% | 3% | 3% | 5% | 5% | 6% | 6% |
| Finale of 60 s | 0% | 1% | 1% | 1% | 1% | 1% | 1% | 2% | 2% |

**Ballots not locked in when the vote closes, medium agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 0% | 0% | 0% | 0% | 1% | 1% | 1% | 1% | 2% |
| Finale of 30 s | 7% | 14% | 17% | 17% | 17% | 20% | 19% | 21% | 25% |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 0% | 3% | 3% | 4% | 4% | 6% | 5% | 6% | 7% |
| Finale of 60 s | 0% | 1% | 1% | 1% | 1% | 1% | 1% | 1% | 2% |

**Time to a pick (median / 90th percentile), low agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 0:53 / 2:36 | 2:56 / 5:04 | 4:13 / 5:48 | 3:04 / 6:15 | 4:59 / 6:55 | 3:44 / 6:31 | 5:15 / 7:10 | 5:42 / 7:27 | 5:27 / 7:24 |
| Finale of 30 s | 0:53 / 2:34 | 2:38 / 4:14 | 3:32 / 4:49 | 2:58 / 5:09 | 4:10 / 5:41 | 3:26 / 5:19 | 4:18 / 5:52 | 4:36 / 6:00 | 4:27 / 5:58 |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 0:53 / 2:34 | 2:39 / 4:18 | 3:35 / 4:53 | 2:58 / 5:14 | 4:13 / 5:45 | 3:29 / 5:26 | 4:24 / 5:56 | 4:45 / 6:07 | 4:34 / 6:09 |
| Finale of 60 s | 0:53 / 2:34 | 2:39 / 4:21 | 3:35 / 4:54 | 2:58 / 5:15 | 4:14 / 5:47 | 3:29 / 5:30 | 4:26 / 6:00 | 4:47 / 6:10 | 4:38 / 6:13 |

**Time to a pick (median / 90th percentile), medium agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 0:34 / 1:53 | 1:22 / 4:19 | 2:44 / 5:13 | 1:11 / 4:10 | 2:02 / 5:55 | 1:06 / 3:36 | 1:39 / 5:55 | 2:33 / 6:36 | 1:28 / 5:35 |
| Finale of 30 s | 0:34 / 1:53 | 1:22 / 3:44 | 2:39 / 4:21 | 1:11 / 3:50 | 2:02 / 4:56 | 1:06 / 3:32 | 1:39 / 4:52 | 2:33 / 5:24 | 1:28 / 4:41 |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 0:34 / 1:53 | 1:22 / 3:46 | 2:40 / 4:26 | 1:11 / 3:53 | 2:02 / 5:01 | 1:06 / 3:33 | 1:39 / 4:58 | 2:33 / 5:32 | 1:28 / 4:48 |
| Finale of 60 s | 0:34 / 1:53 | 1:22 / 3:47 | 2:40 / 4:27 | 1:11 / 3:53 | 2:02 / 5:02 | 1:06 / 3:33 | 1:39 / 5:02 | 2:33 / 5:36 | 1:28 / 4:53 |

**Players who like the pick, games the finale decided, medium agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (schema.sql) | 51% | 66% | 72% | 59% | 64% | 57% | 60% | 63% | 58% |
| Finale of 30 s | 53% | 66% | 71% | 59% | 63% | 57% | 59% | 62% | 57% |
| **Proposed**: 40 cards, 6 or 7 min, 45 s | 53% | 66% | 72% | 59% | 64% | 57% | 60% | 62% | 58% |
| Finale of 60 s | 53% | 66% | 72% | 59% | 64% | 57% | 60% | 63% | 58% |

- **One round picks the same films as two stages**: the share of players who like a finale pick is within 2 points across every option.
- **The cap matters only for the slowest voter**, since the round closes as soon as everyone has locked in. At 45 seconds, up to 7% of ballots miss the close (none with 2 players); at 60 seconds, up to 2%; at 30 seconds, 6 to 25%. A 60-second cap costs 0 to 5 seconds at the 90th percentile against 45.
- These numbers rest entirely on the made-up voting time. A family with a young child, or a couch that argues, votes slower than the bots.

### The 70% rule (not part of M0.7)

Two thirds instead of 70% only changes 6 players (4 likes instead of 5) and 9 (6 instead of 7).

**70% against two thirds, low agreement**

|  | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- |
| Final Cut decides, 70% | 43% | 74% | 48% | 73% | 87% | 72% |
| Final Cut decides, two thirds | 43% | 18% | 48% | 73% | 51% | 72% |
| Median / 90th pct, 70% | 2:58 / 5:14 | 4:13 / 5:45 | 3:29 / 5:26 | 4:24 / 5:56 | 4:45 / 6:07 | 4:34 / 6:09 |
| Median / 90th pct, two thirds | 2:58 / 5:14 | 1:30 / 4:30 | 3:29 / 5:26 | 4:24 / 5:56 | 3:51 / 5:47 | 4:34 / 6:09 |
| Players who like the pick, 70% | 71% | 66% | 64% | 61% | 59% | 59% |
| Players who like the pick, two thirds | 71% | 67% | 64% | 61% | 61% | 59% |

**70% against two thirds, medium agreement**

|  | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- |
| Final Cut decides, 70% | 11% | 30% | 8% | 23% | 38% | 17% |
| Final Cut decides, two thirds | 11% | 2% | 8% | 23% | 7% | 17% |
| Median / 90th pct, 70% | 1:11 / 3:53 | 2:02 / 5:01 | 1:06 / 3:33 | 1:39 / 4:58 | 2:33 / 5:32 | 1:28 / 4:48 |
| Median / 90th pct, two thirds | 1:11 / 3:53 | 0:40 / 2:04 | 1:06 / 3:33 | 1:39 / 4:58 | 1:03 / 3:29 | 1:28 / 4:48 |
| Players who like the pick, 70% | 82% | 80% | 76% | 75% | 74% | 73% |
| Players who like the pick, two thirds | 82% | 73% | 76% | 75% | 72% | 73% |

Two thirds would smooth out the zigzag: the Final Cut would decide 2% of 6-player games instead of 30% at medium agreement, and 7% of 9-player games instead of 38%. The cost: at medium agreement, 7 points fewer players like the pick with 6 players and 2 points fewer with 9. At low agreement there's no cost, because Final Cut picks are liked even less. [decisions.md](../decisions.md#dropped) says that if majority matches upset someone, the fix is a tighter rule; this goes the other way, so it's only a note for later.

### A suggested set

40 cards for 2 to 4 players and 30 for 5 to 10, one time limit of 6 minutes for every size, and a finale round of 60 seconds. See [What it means for M0.7](#what-it-means-for-m07).

**Proposed against suggested, low agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Median / 90th pct, proposed | 0:53 / 2:34 | 2:39 / 4:18 | 3:35 / 4:53 | 2:58 / 5:14 | 4:13 / 5:45 | 3:29 / 5:26 | 4:24 / 5:56 | 4:45 / 6:07 | 4:34 / 6:09 |
| Median / 90th pct, suggested | 0:53 / 2:34 | 2:39 / 4:21 | 3:35 / 4:54 | 2:38 / 4:12 | 3:23 / 4:39 | 3:00 / 4:25 | 3:35 / 4:45 | 3:51 / 4:56 | 3:43 / 4:55 |
| Within 5 min, proposed | 100% | 97% | 92% | 87% | 76% | 83% | 70% | 61% | 65% |
| Within 5 min, suggested | 100% | 97% | 91% | 98% | 95% | 96% | 93% | 91% | 91% |
| Final Cut decides, proposed | 12% | 49% | 80% | 43% | 74% | 48% | 73% | 87% | 72% |
| Final Cut decides, suggested | 12% | 49% | 80% | 50% | 78% | 54% | 77% | 89% | 75% |
| Players who like the pick, proposed | 94% | 83% | 73% | 71% | 66% | 64% | 61% | 59% | 59% |
| Players who like the pick, suggested | 94% | 83% | 73% | 70% | 64% | 63% | 60% | 58% | 58% |

**Proposed against suggested, medium agreement**

|  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Median / 90th pct, proposed | 0:34 / 1:53 | 1:22 / 3:46 | 2:40 / 4:26 | 1:11 / 3:53 | 2:02 / 5:01 | 1:06 / 3:33 | 1:39 / 4:58 | 2:33 / 5:32 | 1:28 / 4:48 |
| Median / 90th pct, suggested | 0:34 / 1:53 | 1:22 / 3:47 | 2:40 / 4:27 | 1:11 / 3:19 | 2:02 / 4:06 | 1:06 / 3:12 | 1:38 / 4:07 | 2:29 / 4:34 | 1:28 / 4:06 |
| Within 5 min, proposed | 100% | 99% | 96% | 97% | 90% | 97% | 90% | 82% | 92% |
| Within 5 min, suggested | 100% | 98% | 95% | 99% | 98% | 99% | 98% | 96% | 98% |
| Final Cut decides, proposed | 5% | 23% | 46% | 11% | 30% | 8% | 23% | 38% | 17% |
| Final Cut decides, suggested | 5% | 23% | 46% | 15% | 36% | 11% | 28% | 43% | 22% |
| Players who like the pick, proposed | 98% | 92% | 87% | 82% | 80% | 76% | 75% | 74% | 73% |
| Players who like the pick, suggested | 98% | 92% | 87% | 81% | 78% | 75% | 74% | 74% | 73% |

For 2 to 4 players the two sets are the same game (the longer finale adds up to 3 seconds at the 90th percentile). For 5 to 10, 30 cards brings the 90th percentile under 5 minutes at both agreement levels and raises picks within 5 minutes from 61 to 87% to 91 to 98% at low agreement, for 2 to 7 points more Final Cuts and 1 or 2 points fewer players who like the pick.

### When the made-up numbers move

**Proposed values when the made-up numbers move, medium agreement**

Each cell: Final Cut decides, then median / 90th percentile.

| Assumption | 2 | 3 | 4 | 6 | 8 | 10 |
| --- | --- | --- | --- | --- | --- | --- |
| Medium agreement (the reference) | 5%, 0:34 / 1:53 | 23%, 1:22 / 3:46 | 46%, 2:40 / 4:26 | 30%, 2:02 / 5:01 | 23%, 1:39 / 4:58 | 17%, 1:28 / 4:48 |
| Like rate 10% instead of 15% | 16%, 0:56 / 2:46 | 49%, 2:38 / 4:18 | 74%, 3:29 / 4:51 | 62%, 3:56 / 5:37 | 58%, 4:02 / 5:48 | 51%, 3:49 / 5:51 |
| Like rate 20% instead of 15% | 1%, 0:22 / 1:19 | 8%, 0:55 / 2:52 | 24%, 1:31 / 4:00 | 10%, 1:12 / 3:51 | 6%, 1:00 / 3:15 | 4%, 0:53 / 2:45 |
| Deck knows the group less (0.25) | 9%, 0:45 / 2:19 | 29%, 1:45 / 3:57 | 53%, 3:04 / 4:34 | 37%, 2:48 / 5:09 | 30%, 2:12 / 5:15 | 22%, 1:58 / 5:05 |
| Deck knows the group better (0.75) | 3%, 0:24 / 1:31 | 18%, 1:00 / 3:31 | 41%, 2:09 / 4:21 | 27%, 1:31 / 4:53 | 20%, 1:12 / 4:49 | 16%, 1:03 / 4:45 |
| Players past the card count wait | 8%, 0:34 / 1:58 | 30%, 1:22 / 3:59 | 55%, 2:57 / 4:35 | 40%, 2:02 / 5:19 | 31%, 1:39 / 5:16 | 25%, 1:28 / 5:09 |
| Slower players (pace spread 0.5) | 4%, 0:35 / 1:58 | 21%, 1:24 / 4:09 | 45%, 2:51 / 5:34 | 31%, 2:15 / 6:20 | 25%, 1:54 / 6:19 | 20%, 1:39 / 6:22 |

- **The like rate moves everything.** At 10% instead of 15%, the Final Cut decides half of the games for 3 or more players and the 90th percentile nears 6 minutes for big groups; at 20%, the Final Cut decides at most a quarter of the games. The first playtest's like rate is the most useful number to collect.
- **The deck matters less than the like rate**: deck skill from 0.25 to 0.75 moves the Final Cut share by 6 to 12 points.
- **Making fast players wait at the card count** adds up to 10 points of Final Cuts and up to about 20 seconds at the 90th percentile.
- **Slower and more uneven players** push the 90th percentile past 6 minutes for 6 to 10 players, and the time limit starts to matter. This is the case for keeping a time limit at all.

### Near misses

Added on 3 November 2026 for the near-miss beat ([moments.md](../design/moments.md#the-near-miss)). Near misses don't change the bots' play here (bots don't swipe differently on a near-miss card); these tables count what players would be shown, under the decided values (`suggested`, 40 or 30 cards, 6 minutes). "Sent today" follows `api.cast_vote` as merged: one `near_miss` after every like that leaves a film at 2 likes or more without a match. "Proposed" counts only a film one like short of the match rule and still possible.

**Near misses per game, decided values, low agreement**

| | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sent today (2 likes or more, no match) | 0.0 | 4.5 | 12.3 | 12.0 | 21.4 | 22.9 | 35.6 | 47.0 | 51.4 |
| Of those, on a film that can no longer match | n/a | 51% | 67% | 44% | 55% | 41% | 49% | 57% | 45% |
| Proposed: one like short and still possible | 0.0 | 2.2 | 0.8 | 1.6 | 0.7 | 1.3 | 0.7 | 0.3 | 0.6 |
| Games with at least one, proposed | 0% | 93% | 56% | 87% | 53% | 80% | 51% | 26% | 50% |
| Median time of the first, proposed | n/a | 0:42 | 1:08 | 0:54 | 1:12 | 1:00 | 1:16 | 1:23 | 1:17 |

**Near misses per game, decided values, medium agreement**

| | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sent today (2 likes or more, no match) | 0.0 | 4.3 | 12.8 | 9.9 | 19.9 | 16.8 | 29.0 | 43.2 | 38.4 |
| Of those, on a film that can no longer match | n/a | 45% | 60% | 36% | 47% | 32% | 40% | 47% | 35% |
| Proposed: one like short and still possible | 0.0 | 2.4 | 1.4 | 1.9 | 1.4 | 1.8 | 1.4 | 1.0 | 1.4 |
| Games with at least one, proposed | 0% | 98% | 83% | 98% | 86% | 98% | 89% | 76% | 92% |
| Median time of the first, proposed | n/a | 0:28 | 0:50 | 0:31 | 0:51 | 0:33 | 0:49 | 1:00 | 0:50 |

- **Today's rule is noisy.** From 4 players, a game sends about 10 to 51 near misses, and a third to two thirds of them are on films a nope has already ruled out. Shown on every phone, that's a toast every few seconds in a big group.
- **One like short is rare enough to stay special:** about 1 to 2 a game at medium agreement, with at least one in most games, the first within the first minute.
- **Two players never get one** under either rule: 2 likes is already a match.
- **Odd and even sizes differ** because 70% rounds up (4 of 5, 5 of 6, 5 of 7, 6 of 8): a size where one more player barely raises the bar leaves more room for "one short".
- Undo, presence and the deck's close-phase push are left out, as in the rest of the model.

## What it means for M0.7

This is evidence for Harry's decision, not the decision. Under the bots' made-up tastes, the proposal works: every group size picks at a median under 5 minutes and a 90th percentile under 7, at every agreement level, and it beats today's rules for every size of 3 or more. Three of its values could be better, and two changes fall outside M0.7.

**Confirm as proposed**

1. **One finale round instead of two stages** ([The vote](game-modes.md#the-vote-pick-one-veto-one)). It picks the same films as today's veto then rank stages (within 2 points on the share of players who like the pick), and its worst case is one round instead of 1:45. Yes.
2. **Every rule gets a time limit** ([Time to a pick](game-modes.md#time-to-a-pick)). Bots never stall, so the limit barely fires in these games; it's there for the player who puts the phone down for good and for slow or uneven groups, where the sensitivity run shows it starting to matter. Yes.
3. **40 cards for 2 to 4 players** ([Starting values](game-modes.md#starting-values), "Finale card count"). It meets the analytics targets at every agreement level, with the 90th percentile at 4:53 at worst. 30 cards would be faster still, but would hand 3 to 7 points more 3- and 4-player games to the Final Cut for a time that already fits. Yes.

**Proposed changes** (each a starting value in [game-modes.md#starting-values](game-modes.md#starting-values), and a default in [decisions.md](../decisions.md#defaults-not-yet-confirmed))

| Starting value | Proposed in the docs | Suggested here | Why | Trade-off |
| --- | --- | --- | --- | --- |
| Finale card count, Quick Match with 5 to 10 players | 40 | **30** | The count waits for the slowest of up to 10 players; at 40, low-agreement groups of 8 to 10 pick within 5 minutes in only 61 to 70% of games. At 30, 91 to 98%, and the 90th percentile stays under 5 minutes at both agreement levels | 2 to 7 points more Final Cuts, 1 or 2 points fewer players who like the pick. The deck's narrowing phase ends at card 18 instead of 24 for these groups ([How a game unfolds](../architecture/deck-engine.md#how-a-game-unfolds)) |
| Finale time limit | 6 minutes; 7 for 5 to 10 players | **6 minutes for every size** | 7 for 5 to 10 changed no median or 90th percentile in any run. One number is simpler to explain, test and show, and it settles Final Cut mode's limit, where the docs disagree (see [Gaps](#gaps-the-model-had-to-fill)) | A slow 10-player game that would have finished its cards by 7 minutes starts the finale at 6: up to 5% of big low-agreement games at 40 cards, fewer at 30 |
| The vote | One round of 45 seconds | **One round of 60 seconds** | The round closes as soon as everyone locks in, so the cap only matters for the slowest voter, and it's the cap that leaves them out: 1 to 2% of ballots at 60 seconds against up to 7% at 45. It costs 0 to 5 seconds at the 90th percentile. A shorter countdown is also more pressure, and families and kids play | Rests on made-up voting times. If Harry prefers 45, the first playtest's lock-in times should check it; 30 seconds would leave out up to a quarter of ballots and should be ruled out |

The suggested set (all three changes) is compared with the proposal in [A suggested set](#a-suggested-set).

**Outside M0.7, for later**

- **Say what a player sees after the card count** while others are still swiping, in [When it starts](game-modes.md#when-it-starts). The bots keep swiping, which the results depend on: see [Gaps the model had to fill](#gaps-the-model-had-to-fill).
- **The 70% rule zigzags** (5 of 6 and 7 of 9 are the hardest sizes). Two thirds would fix it at a small cost in how many like the pick. No change suggested before playtests with 6 or 9 players; see [The 70% rule](#the-70-rule-not-part-of-m07).

## Gaps the model had to fill

Writing the rules as code showed a few places where the docs don't say enough, or disagree. The simulation's choice is in brackets. Each is a question for Harry, not a change.

**Not said**

- **What a player sees after the card count while others are still swiping** ([When it starts](game-modes.md#when-it-starts)). The count waits for the slowest player, so in a 4-player game the average player has answered about 56 cards by then. (They keep swiping, and their likes count. If they had to wait, the Final Cut would decide up to 10 points more often and the 90th percentile would grow by up to about 20 seconds: see [When the made-up numbers move](#when-the-made-up-numbers-move).)
- **How far the finalists' third rule fills** ([The finalists](game-modes.md#the-finalists)): "If that gives fewer than 2: films nobody has noped yet". Up to 2, or up to the full 3 or 4? (Up to the full count. It almost never matters: some film nearly always has a like.)
- **A ballot whose vetoed film stays in**, when every finalist got a veto and the 2 with the fewest stay ([Counting](game-modes.md#counting)). The film can't be in that player's order, so how many points does it get from that ballot? (The fewest.)
- **The close phase's near-miss push** says "films liked by every present player but one" ([How a game unfolds](../architecture/deck-engine.md#how-a-game-unfolds)). Under the 70% rule, that film has already matched, so the push never fires for 5 to 10 players. (One like short of the match rule, which is the same thing for 2 to 4.)

**Where the docs disagree**

- **Final Cut mode's time limit for 5 to 10 players.** [decisions.md](../decisions.md#defaults-not-yet-confirmed) says every match rule gets 6 minutes, 7 for 5 to 10 players; the table in [Time to a pick](game-modes.md#time-to-a-pick) gives Final Cut mode 6 minutes for 2 to 10.
- **Finalists in Final Cut mode with 2 players.** [The finalists](game-modes.md#the-finalists) and the starting values say 3 for 2 players; the table in [When it's a match](game-modes.md#when-its-a-match), the data model's [match rules](../architecture/data-model.md#configuration) and the seed in schema.sql say a Final Cut of 4 for Final Cut mode with 2 to 4 players.
- **Why super nope was dropped.** [The answers](game-modes.md#the-answers) and [decisions.md](../decisions.md#dropped) say every player has a veto in the Final Cut. But majority matches only happen with 5 to 10 players, and for them Quick Match ends in a ranked vote with no veto ([The modes](game-modes.md#the-modes)); an instant majority match never reaches a vote at all. The players the super nope was meant to protect don't get the veto.
- **How long the finale takes.** The deck engine's [goal](../architecture/deck-engine.md#what-the-engine-is-for) still says the Final Cut takes "about 2 more" minutes; the proposed finale is one round of at most 45 seconds.
- **The "typical" times in [Time to a pick](game-modes.md#time-to-a-pick)** (for example 2:55 for 3 to 4 players) multiply the card count by the average pace, and use today's 50 cards. The same section says the slowest player decides the card count, which comes later: in the bots, with 40 cards, 4-player games at low agreement (80% of them Final Cuts) pick at 3:35 at the median.

## What playtests should measure

Each of these replaces a made-up number in the model. Once a playtest gives one, put it in `WORLD` in [game.mjs](../../tools/sim/game.mjs), rerun, and update this doc.

| Measure | Replaces | Where it's logged |
| --- | --- | --- |
| Like rate on dealt cards, by group size | The like rate (15% on random films, 19 to 28% on dealt cards) | [Like rate by phase and source](analytics.md#game) |
| Seconds per swipe, and the slowest player's time to the card count | The pace and its spread | `votes` timestamps |
| Time from the finale's start to each lock-in | The voting time | Ballot timestamps |
| Instant matches against finales, by group size | Group agreement | `rooms.stats` outcome |
| What fast players do after the card count, and whether they mind | The "keep swiping" assumption | Watching (the [playtest skill](../../.claude/skills/playtest/SKILL.md)) |

## Per-player genres

Added on 6 November 2026 for roadmap task M6.52, by the game designer agent. The question: if each player picks up to 3 TMDB genres in the lobby and the deck leans toward them, does the median time to a pick stay under 5 minutes, including when picks are split? [decisions.md](../decisions.md#decided) (6 November 2026) ships per-player genres in the first release only if it does, and right after launch otherwise. The feature is M6.53 and M6.54 in the [roadmap](roadmap.md#m6-the-game); the lobby row is in [The lobby](onboarding.md#the-lobby).

> **Bots with made-up tastes, on a made-up catalog.** Every number in this section comes from bot games. How much genres matter to a player, how split a room is and the catalog's genre mix are all made up. They test the mechanics (time to a pick, matches, the vote), never the fun.

### The verdict

**The gate passes.** With split picks, the median time to a pick with genres is within 2 seconds of today's deck at every size (3 seconds with another seed), from 2:21 for 2 players to 3:34 for 4, and the 90th percentile stays under 4:50. So, under the 6 November decision, per-player genres can ship in the first release.

**Split picks: time to a pick, today's deck against the genre deck**

| Players | Median, today | Median, with genres | 90th pct, today | 90th pct, with genres | Within 5 min, today / with genres |
| --- | --- | --- | --- | --- | --- |
| 2 | 2:19 | 2:21 | 3:19 | 3:19 | 100% / 100% |
| 3 | 3:13 | 3:13 | 4:14 | 4:16 | 97% / 97% |
| 4 | 3:35 | 3:34 | 4:43 | 4:43 | 94% / 94% |
| 6 | 3:22 | 3:23 | 4:22 | 4:23 | 97% / 97% |
| 8 | 3:27 | 3:28 | 4:40 | 4:41 | 94% / 94% |

Read it with two cautions:

- **The gate is easy to pass.** Under the launch rules a game runs until the third match or the card count (40 cards, 30 from 5 players), then a vote of at most 60 seconds. So for 3 or more players the time is set mostly by the card count and the pace, whatever the deck. The deck shows in matches and in games that end with no match, below.
- **Genres don't make split rooms faster, nor slower.** A split room is slow with today's deck too: with 4 players, 63% of games end with no match and a vote from the swipes. Genres don't cause that and don't fix it. Where picks overlap, they help: with 8 players and shared picks, games without a match fall from 13% to 9% and the median from 2:59 to 2:41.

### How to run the genre simulation

```sh
node tools/sim/genres.mjs
```

It prints every table below, and a few more, in about 8 minutes (1,000 games per cell). `--games`, `--seed` and `--only` work as for the main script; the sections are `catalog`, `main`, `cap`, `share`, `guard` and `sensitivity`. Every variant of a cell plays the same rooms (same catalog, same players, same paces), so a difference between today's deck and the genre deck comes from the deck. With `--seed 2`, medians move by up to 6 seconds and shares by up to 3 points. The tests are in [tools/sim/genres.test.mjs](../../tools/sim/genres.test.mjs).

### The genre model

**What follows the docs and the code**

| Rule | In the simulation | Source |
| --- | --- | --- |
| The game | The launch rules: a match joins the shortlist and the third ends swiping; a single match is the pick; 2 or 3 go to a vote between them; with none, finalists from the swipes, one seat each; 40 cards for 2 to 4 players, 30 from 5, or 6 minutes; one 60-second round. Played by [tools/sim/shortlist.mjs](../../tools/sim/shortlist.mjs) | [When it's a match](game-modes.md#when-its-a-match), [When it starts](game-modes.md#when-it-starts), [The finalists](game-modes.md#the-finalists) |
| Today's deck | The SQL deal: group score 5 × the crowd's percentile among tonight's films, the top 300 above a score of 1, a weighted shuffle at 0.3. **Every seat walks the same order**: `internal.shuffle_key` hashes the room's seed and the film, not the seat, and a refill deals a seat the films others already had first. The first 10 cards are the shared opening | [The SQL fallback](../architecture/deck-engine.md#the-sql-fallback), `internal.deal_baseline` |
| A film's weight | The share of players with picks whose picks include one of its genres. Players with no picks don't count; with no picks at all, the deck is today's, card for card (a test checks it) | The proposal, [M6.53](roadmap.md#m6-the-game) |
| The pick pool | Films with a weight above 0. About 3 slots in 4, the first one among them, draw from it by a weighted shuffle whose odds are the usual ones times the weight. The other slots follow today's order. The shared opening follows the same mix (8 of 10) | The proposal |
| The cap | 3 genres a player | [decisions.md](../decisions.md#decided), 6 November 2026 |
| Genres offered | Every genre but TV Movie with at least 30 films tonight | The proposal |
| The guard | A pick pool under 100 films gets a share of 3 in 4 × its size / 100; a pool that runs dry hands its slots to the open order | The proposal |

**What is made up**

| Number | Value | Why |
| --- | --- | --- |
| The catalog | A synthetic night of **1,500 eligible films** (a room's services, age cap, time budget and quality filter applied to France's 14,043 watchable films), 2.5 genres a film. Genre shares are shaped like TMDB's popular films: Drama 40%, Comedy 28%, Thriller 26%, Action 23%, down to War 3% and Western 1%; genres of a kind come together (Crime with Thriller). A narrow night has 400 | Not measured. The local stack holds only the seed's 500 films with made-up genres, and production is never queried. `node tools/sim/genres.mjs --only catalog` prints the mix |
| What genres explain | **30%** of a player's taste for a film comes from its genres (the average of the player's tastes for them); the rest is the main model's (agreement 0.25 with the group) | Made up. Sensitivity: 15% and 45% |
| Like rate | 15% of random eligible films, with pickier and easier players, as in the main model. On dealt cards it comes to 26 to 34% | As in [What is made up](#what-is-made-up) |
| The rooms | **Split**: two camps of opposite genre tastes (what one camp loves, the other likes least), the worst case. **Everyone different**: unrelated tastes. **Shared**: 80% of genre taste in common. **One player picks**: unrelated tastes, only one player picks. **No picks** | Made up |
| The picks | A player who picks takes their 3 strongest genres among those offered, with a little noise (0.5) | Made up. Sensitivity: noise 1.0 |
| Swipe pace | **3 s a card for 2 players, 3.5 s for 3 or 4, 4 s for 5 to 10**, with the same spread and pauses as the main model, identical in every variant | The placeholders in [Time to a pick](game-modes.md#time-to-a-pick) |
| Voting time, reveal | As in [tools/sim/shortlist.mjs](../../tools/sim/shortlist.mjs): about 16 s to order 4 posters at the median, a 3-second beat per match, a 4-second reveal | Made up |

**What it leaves out:** the fun, and whether a player who didn't pick minds seeing a room's genres; the server deck (M17), which learns during the game; the quality gap between genres (horror rates lower on TMDB); undo, presence, Vote now and late joiners.

### Genre results

**Every case: median / 90th percentile, today's deck, then with genres**

| Players | Split picks | Everyone different | Shared picks | One player picks |
| --- | --- | --- | --- | --- |
| 2 | 2:19 / 3:19, 2:21 / 3:19 | 2:04 / 3:07, 1:59 / 3:06 | 1:52 / 2:59, 1:36 / 2:46 | 2:04 / 3:07, 1:56 / 3:02 |
| 3 | 3:13 / 4:14, 3:13 / 4:16 | 3:08 / 4:16, 3:05 / 4:12 | 2:50 / 4:00, 2:35 / 3:53 | 3:08 / 4:16, 3:05 / 4:12 |
| 4 | 3:35 / 4:43, 3:34 / 4:43 | 3:32 / 4:41, 3:31 / 4:40 | 3:14 / 4:25, 3:04 / 4:22 | 3:32 / 4:41, 3:30 / 4:45 |
| 6 | 3:22 / 4:22, 3:23 / 4:23 | 3:20 / 4:23, 3:18 / 4:22 | 2:55 / 4:00, 2:43 / 3:52 | 3:20 / 4:23, 3:18 / 4:24 |
| 8 | 3:27 / 4:40, 3:28 / 4:41 | 3:24 / 4:34, 3:24 / 4:34 | 2:59 / 4:07, 2:41 / 4:05 | 3:24 / 4:34, 3:22 / 4:32 |

With no picks, the genre deck plays exactly today's games (2:04 / 3:07 for 2 players, 3:24 / 4:34 for 8).

**What the deck changes: today's deck / with genres**

| Picks | Players | Matches a game | No match (a vote from the swipes) | Players who like the pick | Cards in your own genres |
| --- | --- | --- | --- | --- | --- |
| Split | 2 | 2.0 / 2.0 | 14% / 13% | 94% / 94% | 37% / 51% |
| Split | 4 | 0.5 / 0.5 | 63% / 64% | 81% / 81% | 37% / 48% |
| Split | 8 | 0.8 / 0.8 | 47% / 48% | 70% / 70% | 37% / 46% |
| Everyone different | 2 | 2.3 / 2.5 | 9% / 7% | 96% / 97% | 38% / 56% |
| Everyone different | 4 | 0.7 / 0.8 | 53% / 50% | 85% / 86% | 37% / 48% |
| Everyone different | 8 | 1.0 / 1.1 | 38% / 37% | 72% / 73% | 37% / 45% |
| Shared | 2 | 2.6 / 2.7 | 4% / 3% | 98% / 99% | 38% / 63% |
| Shared | 4 | 1.6 / 1.9 | 24% / 17% | 93% / 96% | 39% / 57% |
| Shared | 8 | 2.1 / 2.3 | 13% / 9% | 82% / 84% | 38% / 56% |
| One player picks | 2 | 2.3 / 2.5 | 9% / 5% | 96% / 98% | 38% / 76% |
| One player picks | 4 | 0.7 / 0.8 | 53% / 52% | 85% / 85% | 37% / 75% |
| One player picks | 8 | 1.0 / 1.0 | 38% / 36% | 72% / 73% | 37% / 75% |

"Cards in your own genres" is the share of a picking player's cards that carry one of their own picks; for one picker, it's that player's.

- **The pick pool is most of the night.** Three genres of one player cover about 530 of the 1,500 films; a group's picks cover 750 to 1,390 (63 to 93% of the night from 4 players up). With today's deck, 52 to 92% of a group's cards already come from its pick pool. So "3 cards in 4 from the pool" alone changes little from 4 players up: the weight does most of the work (see the tuning below).
- **The overlap weight helps where there is overlap.** Shared picks gain 0.1 to 0.3 matches a game and 1 to 7 points fewer games without a match. Split camps have few films in both camps' genres, so there's little to lean on.
- **One player who picks steers the room.** Three cards in four for everyone come from that player's genres (75%, against 37%). It costs nothing in time or in how many like the pick, in the bots.
- **No room starves** on a night of 1,500 films: the guard never fires.

### Tuning

**The cap: no match, then cards in your own genres (median time in brackets)**

| Picks | Players | Today | Cap 1 | Cap 2 | Cap 3 | Cap 5 |
| --- | --- | --- | --- | --- | --- | --- |
| Split | 4 | 63%, 37% (3:35) | 68%, 29% (3:35) | 64%, 39% (3:33) | 64%, 48% (3:34) | 63%, 62% (3:33) |
| Split | 8 | 47%, 37% (3:27) | 51%, 25% (3:27) | 49%, 37% (3:26) | 48%, 46% (3:28) | 47%, 61% (3:26) |
| Shared | 4 | 24%, 39% (3:14) | 15%, 40% (2:58) | 16%, 50% (3:03) | 17%, 57% (3:04) | 19%, 69% (3:09) |
| Shared | 8 | 13%, 38% (2:59) | 7%, 35% (2:32) | 8%, 47% (2:36) | 9%, 56% (2:41) | 10%, 68% (2:46) |

Fewer genres sharpen a shared room's lean (1 genre is fastest) but leave split rooms a little worse; more genres dilute it toward today's deck. 3 sits in between. (With a cap of 1, your own genres are naturally rarer, hence the lower share.)

**The share and the weight: no match, then cards in your own genres**

| Variant | Split, 4 | Split, 8 | Shared, 4 | Shared, 8 |
| --- | --- | --- | --- | --- |
| Today's deck | 63%, 37% | 47%, 37% | 24%, 39% | 13%, 38% |
| 1 in 2, weight as odds | 63%, 43% | 47%, 42% | 19%, 49% | 10%, 48% |
| 3 in 4, weight as odds (proposed) | 64%, 48% | 48%, 46% | 17%, 57% | 9%, 56% |
| Every card, weight as odds | 65%, 56% | 51%, 52% | 14%, 70% | 7%, 66% |
| 3 in 4, no weight (the pool only) | 64%, 40% | 47%, 37% | 20%, 48% | 12%, 43% |
| 3 in 4, weight as +1 point of score | 63%, 53% | 48%, 51% | 15%, 64% | 8%, 62% |

Every card from the pool is best for shared picks but starts to cost split rooms of 8 (51% without a match, against 47%) and leaves no room for films outside anyone's picks. Without the weight, the pool alone does about half as much for shared picks. Weight as odds or as a point of score do about the same.

**One player picks: the share as proposed, or times the share of players who picked**

| Players | Variant | No match | Cards in the picker's genres |
| --- | --- | --- | --- |
| 4 | Today's deck | 53% | 37% |
| 4 | 3 in 4 (proposed) | 52% | 75% |
| 4 | 3 in 4 × 1 in 4 who picked | 53% | 39% |
| 8 | Today's deck | 38% | 37% |
| 8 | 3 in 4 (proposed) | 36% | 75% |
| 8 | 3 in 4 × 1 in 8 who picked | 39% | 38% |

Scaling the share by the players who picked takes the lean away almost entirely; it's a question of fairness, not of time.

**A narrow night: 400 eligible films**

| Picks | Players | Guard and genres | Genres offered | Pick pool, median films | Guard fired | Median / 90th pct | Cards in your own genres |
| --- | --- | --- | --- | --- | --- | --- | --- |
| One player | 2 | Today's deck | 12.7 | 169 | n/a | 2:09 / 3:12 | 45% |
| One player | 2 | 100, from 30 films (proposed) | 12.7 | 169 | 1% | 2:04 / 3:09 | 76% |
| One player | 2 | 50, from 30 films | 12.7 | 169 | 0% | 2:04 / 3:09 | 76% |
| One player | 2 | 200, from 30 films | 12.7 | 169 | 69% | 2:04 / 3:10 | 64% |
| One player | 2 | 100, from 15 films | 15.8 | 150 | 11% | 2:02 / 3:07 | 75% |
| One player | 2 | 100, from 50 films | 7.8 | 219 | 0% | 2:04 / 3:14 | 77% |
| Split | 4 | Today's deck | 12.7 | 333 | n/a | 3:36 / 4:45 | 44% |
| Split | 4 | 100, from 30 films (proposed) | 12.7 | 333 | 0% | 3:36 / 4:45 | 49% |

On a narrow night, the 30-film rule does most of the guarding: it hides 5 or 6 genres, and the pool of one player's 3 genres is then under 100 films in only 1% of rooms. Lowering it to 15 films offers 3 more genres and starves 11% of one-picker rooms; raising the guard to 200 shrinks the lean in 69% of them. Time barely moves in any variant (5 seconds at most).

**When the made-up numbers move: split picks, median / 90th percentile and no match, today's deck / with genres**

| Assumption | 2 players | 4 players | 8 players |
| --- | --- | --- | --- |
| The reference | 2:19 / 3:19, 2:21 / 3:19; 14% / 13% | 3:35 / 4:43, 3:34 / 4:43; 63% / 64% | 3:27 / 4:40, 3:28 / 4:41; 47% / 48% |
| Genres explain 15% | 2:07 / 3:09, 2:07 / 3:12; 7% / 7% | 3:30 / 4:42, 3:30 / 4:42; 45% / 46% | 3:21 / 4:27, 3:21 / 4:29; 26% / 27% |
| Genres explain 45% | 2:27 / 3:24, 2:29 / 3:24; 26% / 26% | 3:38 / 4:47, 3:38 / 4:47; 79% / 81% | 3:32 / 4:46, 3:33 / 4:46; 68% / 70% |
| Like rate 10% | 2:32 / 3:32, 2:33 / 3:32; 34% / 33% | 3:38 / 4:50, 3:39 / 4:51; 85% / 86% | 3:34 / 4:49, 3:35 / 4:49; 77% / 79% |
| Low agreement (0.1) | 2:30 / 3:30, 2:30 / 3:28; 29% / 28% | 3:40 / 4:51, 3:40 / 4:51; 90% / 90% | 3:37 / 4:53, 3:38 / 4:53; 88% / 88% |
| Noisier picks (1.0) | 2:19 / 3:19, 2:20 / 3:17; 14% / 13% | 3:35 / 4:43, 3:34 / 4:43; 63% / 64% | 3:27 / 4:40, 3:27 / 4:36; 47% / 48% |

The gate holds under every assumption: the slowest split cells are 3:40 at the median (4 players) and 4:53 at the 90th percentile (8 players), both at low agreement. With genres, medians stay within 2 seconds and games without a match within 2 points of today's deck everywhere. What moves split rooms is how much tastes differ, not the deck.

### Proposals for Harry

Each is a proposal, not a decision. The values are the starting values M6.53 will add to [the deck's starting values](../architecture/deck-engine.md#starting-values).

| Value or rule | Proposed in the 6 November proposal | Suggested here | Why |
| --- | --- | --- | --- |
| Ship in the first release | Only if the simulation passes | **Yes**: the gate passes | Split picks keep the median within a few seconds of today's deck at every size, 3:34 at worst (4 players) |
| Cap | 3 genres a player | **Keep 3** | 1 is fastest for shared rooms but worse for split ones; 5 dilutes the lean |
| Pick share | About 3 cards in 4 | **Keep 3 in 4** | Every card helps shared rooms but costs split rooms of 8 and leaves no open card |
| The weight | Each film weighted by the share of players whose picks it hits | **Keep it, and keep it in the draw.** The pool alone does little from 4 players up, since it holds 63 to 93% of the night's films. Odds × weight is `score + 0.3 × ln(weight)` in `internal.shuffle_key`'s terms | The weight is what makes the deck lean, and it puts overlap first |
| The guard | A pick pool of 100 films; genres under 30 films aren't offered | **Keep both** | The 30-film rule does most of the work; 100 fires in about 1% of narrow nights |
| The open slots | "The best of the rest" | **Today's order over every eligible film**, not only films outside the pick pool | From 4 players up, "the rest" can be as little as 7% of the night (8 players with different picks): only the films outside everyone's genres |
| `internal.deck_candidates`' cut | The top 300 by score | **Cut each pool on its own** (the top 300 of the pick pool, then today's top 300) | A weight as odds never raises a score, so a single top-300 cut would keep only the pool's films that were already in today's top 300 and trip the guard for no reason |
| One player who picks alone | Steers 3 cards in 4 for everyone | **Keep, and watch it in the playtest** | No cost in time or in liked picks in the bots. Whether the others mind is a question for real players; scaling the share by the players who picked would take the lean away |

**Defaults taken** (choices nobody had made; the most cautious reading, for Harry to confirm or change):

- The catalog is synthetic, shaped like TMDB's popular films: the local stack has only the seed's 500 films, and production and staging are never queried.
- Split picks are modelled as two camps with opposite tastes, the worst case, rather than rooms that merely differ (shown as "everyone different").
- A player who picks always picks the full 3 genres.
- The weight is applied as odds times the weight (the literal "drawn by that weight"); a point of score is shown next to it.
- The open slots follow today's order over all eligible films.
- A starved pool's share shrinks in proportion to its size (60 films: 3 in 4 × 0.6).

**For the next playtest:** let players pick genres, and count how many do, how often their picks overlap, and whether a player who didn't pick says "why all these horror films?".

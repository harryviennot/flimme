# Playtests

Every playtest of Flimme, newest first: who played, the build, the room's settings, the numbers, what we saw, what players said, and the changes it suggests. Started on 5 November 2026 by the game designer agent. How to run one is in the `playtest` skill (.claude/skills/playtest); the values a playtest tunes are in [the game's starting values](game-modes.md#starting-values) and [the deck's](../architecture/deck-engine.md#starting-values). A proposed change is a question for Harry until it's in [decisions.md](../decisions.md).

## 5 November 2026: Harry and three bots on staging

- **Who:** Harry on his phone, with three bot players (tools/bots) that each like about half the cards at random.
- **Build and settings:** staging. The room's settings and times weren't recorded.
- **Numbers:** not recorded. A game with these bots usually ends at the first match: in the [simulation](three-matches-and-fair-finalists.md#the-simulation), at a median of 0:54 for 4 players.
- **What Harry said:**
  - "If everyone agrees on the first movie, the game ends, and that's not fun. I think we should allow up to 3 movies everyone wants to watch before we end the game."
  - Films he liked weren't in the Final Cut, so he felt left out and wondered if it was a bug. It isn't: the finalists follow [the finalists](game-modes.md#the-finalists), which never looks at who liked what.
- **Changes:** proposed in [Up to 3 matches, and finalists for everyone](three-matches-and-fair-finalists.md), decided by Harry the same day ([Decided](three-matches-and-fair-finalists.md#decided)): a match joins a shortlist and the third ends the game, in every mode (`matches_to_end`, 3, in [the starting values](game-modes.md#starting-values)), and every player with a like gets a finalist they liked ([the finalists](game-modes.md#the-finalists)). New tasks M6.33 to M6.38.
- **For the next playtest with people:** time the swiping after the first match, and ask each player "was there a film for you in the vote?".

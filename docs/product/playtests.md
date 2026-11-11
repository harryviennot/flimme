# Playtests

Every playtest of Flimme, newest first: who played, the build, the room's settings, the numbers, what we saw, what players said, and the changes it suggests. Started on 5 November 2026 by the game designer agent. How to run one is in the `playtest` skill (.claude/skills/playtest); the values a playtest tunes are in [the game's starting values](game-modes.md#starting-values) and [the deck's](../architecture/deck-engine.md#starting-values). A proposed change is a question for Harry until it's in [decisions.md](../decisions.md).

## Family playtest, 11 November 2026

- **Who:** Harry's family, 4 players in one room, on their own iPhones, in French and English. Feedback was sent afterwards over messages.
- **Build and settings:** Quick Match.
- **Numbers:** not recorded.
- **What they said:**
  1. A sibling: a display bug, a screenshot cut off, not followed up.
  2. A sibling: they couldn't tell a film's genre from the card (horror or thriller?).
  3. A sibling: in the final vote they couldn't reread what a film is about.
  4. A sibling: "it's beautiful and very smooth".
  5. A parent: the genre step's helper sentence didn't make sense.
  6. A parent: they didn't know a game is timed, and it felt long. It would be fine if players knew up front that it takes about 5 minutes.
  7. A parent: the Quick Match line should say roughly how long a game takes.
  8. A parent: there were lots of animated films, and they wanted to take out things they don't want: "no animated films, nothing with Brad Pitt".
  9. A parent: tapping streaming services made clicks they didn't make, out of sync with their taps.
  10. A parent: the graphics could be a bit better.
  11. A parent: the synopsis text is big, so "read more" is needed too often.
  12. A parent: a screenshot was cut off, not followed up.
- **Changes:**
  - Items 2, 5, 6, 7, 9 and 11: the fix pull request "Fix: family feedback, genre on the card, clearer copy, smaller synopsis, no stray clicks".
  - Item 3: task [M6.67](roadmap.md#m6-the-game), the synopsis on the final vote.
  - Item 6: no clock while swiping, as decided earlier. The game's length goes in the lobby rules line.
  - Item 8: tasks [M6.68 to M6.71](game-modes.md#not-tonight), Not tonight.
  - Items 1, 4, 10 and 12: nothing to do.

## 5 November 2026: Harry and three bots on staging

- **Who:** Harry on his phone, with three bot players (tools/bots) that each like about half the cards at random.
- **Build and settings:** staging. The room's settings and times weren't recorded.
- **Numbers:** not recorded. A game with these bots usually ends at the first match: in the [simulation](three-matches-and-fair-finalists.md#the-simulation), at a median of 0:54 for 4 players.
- **What Harry said:**
  - "If everyone agrees on the first movie, the game ends, and that's not fun. I think we should allow up to 3 movies everyone wants to watch before we end the game."
  - Films he liked weren't in the Final Cut, so he felt left out and wondered if it was a bug. It isn't: the finalists follow [the finalists](game-modes.md#the-finalists), which never looks at who liked what.
- **Changes:** proposed in [Up to 3 matches, and finalists for everyone](three-matches-and-fair-finalists.md), decided by Harry the same day ([Decided](three-matches-and-fair-finalists.md#decided)): a match joins a shortlist and the third ends the game, in every mode (`matches_to_end`, 3, in [the starting values](game-modes.md#starting-values)), and every player with a like gets a finalist they liked ([the finalists](game-modes.md#the-finalists)). New tasks M6.33 to M6.38.
- **For the next playtest with people:** time the swiping after the first match, and ask each player "was there a film for you in the vote?".

---
name: playtest
description: Run and write up a playtest of the game (group movie nights, bot games, the internal alpha, the closed beta) and turn it into tuning changes. Use when preparing, analysing or reporting on a playtest, or when tuning the game's starting values.
---

# Playtests

The goal of every game: everyone says yes to a film within about 5 minutes (deck-engine.md#what-the-engine-is-for). Playtests check that, and whether it's fun getting there.

## Before

- Who: group size, who knows the app, a family or friends, which phones.
- What's being tested: one or two questions, e.g. "Do groups of 8 reach an instant match before card 40?"
- The build and the room settings (services, age cap, time budget).
- The checklist for the person running it (below).

## Watch for

- Time from Start to the pick, and how it ended (match, Final Cut, nothing).
- The first 30 seconds of a new player: do they get the swipe without help? Do they find "Seen it"?
- Moments people react to out loud (good or bad): the near miss, the match, the countdown, the veto reveal.
- Hesitations: a screen where someone asks "what do I do?".
- Talk about the game itself: "why does it keep showing me this?", "I already said no".
- Anyone left waiting on others, and for how long.

## After: three questions to every player

1. Would you use it next time you pick a film? Why?
2. What was the best moment, and the most annoying one?
3. Did you watch the pick? (Ask the next day.)

## The write-up

Append to `docs/product/playtests.md` (create it if needed, newest first): date, who, build, settings, the numbers (time to pick, ending, swipes), what we saw, what players said, and **proposed changes**, each tied to a starting value or a rule with its doc link (game-modes.md#starting-values, deck-engine.md#starting-values). A change to a value is a decision: list it for Harry, and once he agrees it goes in decisions.md and becomes a task.

## Simulations

Bot games test mechanics, not fun: how often each group size matches before the card count, how often the finale decides, time to a pick. Say clearly which numbers come from bots with made-up tastes.

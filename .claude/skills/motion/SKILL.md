---
name: motion
description: How things move, buzz and sound in the app (motion tokens, springs, layout presets, the haptic vocabulary, the two sounds, the signature moments, performance rules for gestures). Use before building or reviewing any animation, gesture, haptic, sound or signature moment (swipe, near miss, flip, match, Final Cut, reveal, winner).
---

# Motion, haptics and sound

"Snappy, physical, a little bouncy" (the Figma's Motion page). Every touch answers at once; celebrations are saved for the shared moments; nothing ever blocks the next card.

## Tokens (`@/theme/motion`)

- **`duration`** (ms): `instant` 80 (taps, toggles), `fast` 150 (chips, button presses), `base` 250 (card return, sheet fade), `slow` 400 (sheet slide, card fly-out), `celebrate` 800 (match reveal, bulb chase).
- **`easing`**: `standard` (most transitions), `exit` (cards leaving), `arcade` (the overshoot for stamps, buttons popping back, the match reveal).
- **`timing`**: ready configs for `withTiming`: `press`, `release` (arcade), `toggle`, `base`, `flip`, `exit`, `celebrate`.
- **`spring`**: `card` (a dragged card returning), `snappy` (small things settling), `bouncy` (celebrations). For anything a finger drives.
- **`layout`**: entering and exiting presets (`toastIn`, `toastOut`, `fadeIn`, `fadeOut`, `popIn`) so lists and overlays move alike.

## Rules

1. **Never block input.** Animations are interruptible; a new gesture cancels the old animation.
2. **The next card is already there.** Three cards are mounted; only the top one moves.
3. **UI thread only during gestures.** Reanimated worklets and shared values, Gesture Handler; no `setState` per frame, no JavaScript-thread work while a finger is down.
4. **Reduce Motion** is handled by Reanimated (it skips animations by default). Flights become fades; check it in the feel checklist.
5. **Shared values change through `.set()`**, not `.value =` (React Compiler).
6. Durations come from tokens. A new duration or curve goes into tokens.json first.

## Haptics (`@/lib/haptics`), one meaning each

| Call | When |
| --- | --- |
| `haptics.commit()` | A dragged card crosses the commit line |
| `haptics.press()` | A button, chip or toggle is pressed (Pressable does it) |
| `haptics.throw()` | A card is thrown off the stack, or a swipe button is pressed |
| `haptics.match()` | It's a match; the winner is revealed |
| `haptics.veto()` | A veto lands |
| `haptics.countdown()` | Each of the countdown's last 5 seconds (Countdown does it) |
| `haptics.error()` | A refusal: a wrong code, a full room |

## Sound (`@/lib/sound`)

Decided: **only the match and the reveal**, `playSound('match' | 'reveal')`. Mixed with other audio, quiet on silent, a setting to turn off. The files come with the sounds task (M6.24); until then the call is a no-op. Don't add other sounds without a decision.

## Signature moments

The game designer writes each beat (docs/design/moments.md); the designer specs the feel. Starting points from docs/agent-workflow.md#the-signature-moments:

| Moment | Feel |
| --- | --- |
| A swipe | Stamp grows with the drag, card tilts, `commit` tick at the line, throw follows the finger's speed (`spring.card` back if released early) |
| The near miss | Toast slides in (`layout.toastIn`), the card takes `glow-like` |
| The flip | In place, `timing.flip`, possible mid-stack |
| It's a match | `MarqueeBulbs chasing`, poster scales in (`timing.celebrate`), avatars pop in one by one (`spring.bouncy`), `haptics.match()`, `playSound('match')` |
| The Final Cut | `Countdown` red for the last 10 seconds with ticks; veto slams (`haptics.veto()`); "locked in" |
| The reveal | Vetoed posters fall away, the winner takes `Spotlight tone="marquee"`, `playSound('reveal')` |

## Checking it

Agents can't feel a gesture. Every pull request with motion ends with a feel checklist (the `feel-check` skill) that Harry runs on an iPhone and a low-end Android.

---
name: feel-check
description: Write the short checklist Harry runs on a real phone for a pull request that changes how a screen looks, moves or responds. Use for every UI pull request, and when asked how something should feel.
---

# The feel check

Agents can't judge a gesture, a haptic or a frame rate from a screenshot, and trying makes them loop. So every UI pull request ends with a checklist Harry runs on his phones (an iPhone and a low-end Android) in two or three minutes.

## Write it into the pull request

```markdown
## Feel check
Build: development build, branch <branch>, `mise run dev`.
Where: <how to reach the screen; the dev menu or gallery entry if it helps>.

- [ ] <one thing to try> → <what it should feel like, concretely>
- [ ] ...
Both phones: [ ] iPhone  [ ] low-end Android
```

## What makes a good line

- One action, one expected feeling, with numbers when the spec has them: "Drag the card 40% right: it tilts, the LIKE stamp fades in, a light tick at the commit line."
- Cover: the main gesture or tap, the haptic at the right moment, the animation's speed (no stutter on the Android), an error or empty state, Reduce Motion on, a screen reader on the main action.
- Five to eight lines. If it needs more, the pull request is too big.

## After Harry's check

His notes come back as comments. Fix what he flags; a feeling that needs a design change goes to the designer as a spec update, not a guess.

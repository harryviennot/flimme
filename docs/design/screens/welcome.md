# Welcome

Screen 02 in the Figma (`9:134`). Route `/welcome`. Built in M4.6. Written on 30 October 2026 from [onboarding](../../product/onboarding.md#first-launch) and [the first release](../../product/roadmap.md#the-first-release-whats-in-what-waits).

## Purpose

One screen that says what the game is in three promises, with two ways out: start (then the name) or type a room code. No account, no tutorial.

## Layout

`Screen` without a header, `scroll` for small phones, the buttons in the `footer`.

1. **Hero** (`screens/welcome/hero.tsx`): three fictional posters from `mobile/assets/posters/` in `Poster`, fanned behind each other (the middle one in front, the side ones rotated -8 and 8 degrees, raw in the Figma, so a token first), and a 44-point `bg-like-default` disc with a filled `heart` icon in `text.inverse` on the front poster's corner.
2. **Title**, `Text variant="display-l"`, `onboarding:welcome.title`.
3. **Body**, `body-l`, tone `secondary`, `onboarding:welcome.body`.
4. **Three promises**, a column with `gap-3`: each a row of a 36-point `bg-bg-raised` `rounded-sm` box holding an `Icon` (20, `accent-text`) and a `body-m` line. Icons: `users`, `tv`, `eye`.
5. **Footer:** `Button` primary L `onboarding:welcome.start` (to [the name](name.md)), then `Button` ghost L `onboarding:welcome.haveCode` (to [the code](join-code.md); the name comes after the code).

## States

Nothing here waits on the network: sign-in already happened on the splash. No loading, empty or error state.

## Copy (`onboarding` namespace)

| Key | French | English |
| --- | --- | --- |
| `welcome.title` | Le film du soir, choisi ensemble | Pick tonight's movie together |
| `welcome.body` | Chacun swipe des films que vous pouvez vraiment regarder. Quand tout le monde dit oui, les lumières s'allument. | Everyone swipes on films you can actually stream. When you all say yes, the lights go up. |
| `welcome.promises.room` | Jusqu'à 10 amis dans une salle, sans compte | Up to 10 friends in one room, no account needed |
| `welcome.promises.services` | Seulement des films sur vos plateformes | Only films on the services you have |
| `welcome.promises.seen` | Pas de déjà-vu, sauf si vous voulez le revoir | No films you've seen, unless you want a rewatch |
| `welcome.start` | C'est parti | Get started |
| `welcome.haveCode` | J'ai un code de salle | I have a room code |

## Motion, haptics, sound

- The three posters come in once with `layout.popIn`, 80 ms apart (`duration.instant`), then stay still. Nothing loops.
- Buttons press as `Button` does (`haptics.press()`).

## Accessibility

- The hero is decorative: hidden from screen readers.
- Focus order: title (role header), body, the three promises (one element each), Get started, I have a room code.
- Reduce Motion: the posters are simply there.

## Differences from the Figma

- No **Already have an account? Sign in** link, although onboarding asks for one: accounts wait for M15 ([the first release](../../product/roadmap.md#the-first-release-whats-in-what-waits)). It comes back with them.
- The third promise changes, as onboarding asks: the Figma's "Skips anything someone has already seen" no longer fits the rewatch question ([decisions](../../decisions.md)). Onboarding's own example ("unless you all loved them") needs Letterboxd ratings, which aren't in the first release.

## Questions

1. **Fictional posters in the app.** The figma map says they are for mockups, the gallery and store screenshots. They are our own art with no TMDB data. Default: use them here as the illustration.
2. **The third promise.** Default: the copy above. If the first release ends up hiding every seen film, use "Pas de films déjà vus" / "Skips films you've already seen".

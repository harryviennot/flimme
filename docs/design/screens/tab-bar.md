# The tab bar

No frame in the original Figma; drawn on the First release page as S1 (`Play` with the bar) and S8 (`My films`), see [the Figma map](../figma-map.md#first-release-page-993537). Expo Router group `(tabs)`, with Play (`/play`) and My films (`/my-films`). Built in M6.43. Written on 5 November 2026 (M6.39) from [the tab bar](../../product/solo-and-my-films.md#2-the-tab-bar) (option 2A, decided by Harry that day).

## Purpose

Two places at home: Play (host, join or play alone) and My films (what you liked and what you've seen). Settings stays behind its button in Play's header. The game never shows tabs.

## Layout

`TabBar` (new, `components/ui/tab-bar.tsx`, below), passed to Expo Router's `Tabs` as `tabBar`. Pinned to the bottom of the two tab screens, above the home indicator.

- `bg-bg-surface`, a `border-t border-border-default` hairline, `pb` the bottom safe area.
- Two items in equal columns (`flex-row`, each `flex-1`), each a `Pressable` at least 56 high (`min-h-14`), `items-center justify-center gap-1`, `py-2`:
  - `Icon` size 24: `play` for Play, `film` for My films.
  - The label in `mono-eyebrow`, one line, `maxFontSizeMultiplier` 1.3.
- **Selected:** icon `marquee-default`, label tone `marquee`. **Not selected:** icon `text-muted`, label tone `muted`. No pill, no underline, no badge.
- Play comes first and is the default tab.

**Hidden on** every screen outside `(tabs)`: host setup, Play alone setup (`/solo`), join (code and sheet), every room screen, Settings, the name screen, Welcome and the splash. These are stacks over the tabs in the root layout, so the swipe screen keeps all its height. The film sheet is a `formSheet` over My films and covers the bar.

**Tapping the selected tab** scrolls its screen to the top (My films' grid; Play when it scrolls). Nothing else.

## States

| State | What the player sees |
| --- | --- |
| Play selected | The default after the splash, Welcome's name step and every room exit (`useExitRoomToHome` goes to `/play`) |
| My films selected | After a tap, or the cap card's and the out of films card's My films button |
| Offline | No change: each tab handles being offline |
| The largest text | Labels grow to their cap (1.3) and the bar grows taller; icons keep 24 |
| 375 by 667 | 56 points high plus no bottom inset (a home button phone) |

There is no loading, empty or error state: the bar is two static items.

## Copy (`common` namespace)

| Key | French | English |
| --- | --- | --- |
| `tabs.play` | Jouer | Play |
| `tabs.myFilms` | Mes films | My films |

"MES FILMS" in `mono-eyebrow` fits a half-width column at 375 points with room to spare.

## Motion, haptics, sound

- Switching tabs is instant: no slide, no fade (Play must feel instant, as [Home](home.md) does). The colors change at once.
- `haptics.press()` from `Pressable`. No sound.

## Accessibility

- The row is `accessibilityRole="tablist"`; each item is a `tab` with `accessibilityState.selected`, labelled by its text ("Play, tab, 1 of 2" or the platform's equivalent).
- The bar comes last in focus order on both tab screens.
- Reduce Motion: nothing changes; nothing moves.

## New component

**`TabBar` (`ui/tab-bar`).** Knows nothing about films or routes. Props: `items` (`{ key, label, icon }[]`), `selected` (a key), `onSelect(key)`, `onReselect(key)`. The tab screen wiring (Expo Router's `state` and `navigation`) lives in `app/(tabs)/_layout.tsx`. Gallery: two items with each selected, long French labels, the largest text. No new token and no new icon (Q39.6).

## Differences from the Figma

- The Figma has no tab bar. Its Profile screen (18 Profile, `26:1214`, read once on 5 November 2026) is a pushed screen with a back button; the first release has no Profile tab (M15, M20 bring something to put in it).

## Decided

From [solo mode and My films](../../product/solo-and-my-films.md#decided), 5 November 2026: two tabs, Play and My films; Settings stays behind its button; rooms cover the tabs. The icons (`play`, `film`) are the designer's pick from the existing set (Q39.6).

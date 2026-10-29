# Figma map

Where everything is in the [design file](https://www.figma.com/design/v2ZGLbGmzZ7032V9AI5vWM), by node id, so agents can open one frame instead of a page. Extracted on 29 October 2026. How to use the Figma without wasting tokens is in the `figma` skill (.claude/skills/figma/SKILL.md).

File key: `v2ZGLbGmzZ7032V9AI5vWM`. In node URLs the colon becomes a hyphen (`node-id=19-599`).

## Pages

| Page | Id |
| --- | --- |
| Cover | `0:1` |
| Release screens | `2:2` |
| Design tokens | `2:3` |

## Release screens (page `2:2`)

Each section has a "Screens" frame holding its screens.

| Section | Section id | Screens frame | Screen | Id |
| --- | --- | --- | --- | --- |
| 01 First launch | `9:78` | `9:82` | 01 Splash | `9:83` |
| | | | 02 Welcome | `9:134` |
| | | | 03 Your name | `9:362` |
| 02 Host or join | `15:163` | `15:167` | 04 Home | `15:168` |
| | | | 05 Join with code | `15:312` |
| | | | 06 Game mode | `15:404` |
| | | | 07 Set the vibe | `15:492` |
| | | | 08 Lobby | `15:607` |
| | | | 09 Invite sheet | `15:722` |
| 03 Taste check | `19:433` | `19:437` | 10 Taste check | `19:438` |
| 04 The game | `19:594` | `19:598` | 11 Swipe | `19:599` |
| | | | 12 Mid-swipe | `19:938` |
| | | | 13 Card flipped | `19:1332` |
| | | | 14 It's a match | `22:921` |
| | | | 15 Final cut | `22:1051` |
| | | | 16 Winner | `22:1304` |
| | | | 17 Recap card | `22:1578` |
| 05 Profile and Letterboxd | `26:1209` | `26:1213` | 18 Profile | `26:1214` |
| | | | 19 Connect Letterboxd | `26:1634` |
| | | | 20 Import history | `26:1991` |
| | | | 21 Save account | `26:2063` |
| | | | 22 Settings | `26:2113` |
| | | | 23 Delete account | `26:2202` |
| 06 Edge states | `30:1717` | `30:1721` | 24 Reconnecting | `30:1722` |
| | | | 25 Room closed | `30:1950` |
| | | | 26 Nothing left | `30:2000` |
| 07 Alternative: classic movie card | `56:2330` | `56:2334` | Alt A, new card | `56:2409` |
| | | | Alt B, new card flipped | `56:2437` |
| | | | Alt C, the original card | `71:2734` |
| | | | Alt D, its back | `71:3124` |
| | | | Alt E, mid-swipe | `71:3550` |

The app builds the new card (section 04); section 07 only compares it with the original app's card.

## Design tokens (page `2:3`)

Frame `3:2` "Design system".

| Frame | Id | In code |
| --- | --- | --- |
| Colors | `3:61` | `color.*` in tokens.json |
| Typography | `3:460` | `typography.*` |
| Spacing, radius and strokes | `3:555` | `space.*`, `radius.*`, `stroke.*`, `opacity.*` |
| Effects | `3:634` | `shadow.*` |
| Gradients | `44:553` | `gradient.*` |
| Motion | `44:608` | `duration.*`, `easing.*` |
| Icons | `3:690` | `mobile/assets/icons/*.svg` |
| Components | `3:695` (grid `5:2`) | `mobile/src/components/ui/` and `shared/` |

## Components (frame `5:2`)

| Showcase | Showcase id | Component | Code |
| --- | --- | --- | --- |
| Button | `5:43` | `5:46` | `ui/button` |
| Swipe action | `5:62` | `5:65` | `shared/swipe-action` |
| Chip | `5:72` | `5:75` | `ui/chip` |
| Tag | `5:96` | `5:99` | `ui/tag` |
| Avatar | `5:172` | `5:175` | `ui/avatar` |
| Input | `5:192` | `5:195` | `ui/input` |
| PIN box | `5:202` | `5:205` | `ui/pin-box` |
| Toggle | `5:210` | `5:213` | `ui/toggle` |
| Icon button | `5:220` | `5:223` | `ui/icon-button` |
| Option card | `5:242` | `5:245` | `ui/option-card` |
| List row | `5:253` | `5:246` | `ui/list-row` |
| Top bar | `5:265` | `5:256` | `ui/top-bar` |
| Device chrome | `5:287` | `5:268`, `5:285` | Not built (the system's) |
| Toast | `5:308` | `5:311` | `ui/toast` |
| Player pill | `5:320` | `5:312` | `shared/player-pill` |
| Room ticket | `5:334` | `5:323` | `shared/room-ticket` |
| Service tile | `5:349` | `5:352` | `shared/service-tile` |
| Poster art | `7:26` | `7:29` | `mobile/assets/posters/` |
| Movie card | `8:191` | `8:194` | `shared/movie-card` |
| Poster thumb | `8:228` | `8:195` | `shared/poster` |
| Result row | `8:280` | `8:231` | `shared/result-row` |
| Rating logos | `53:548` | `53:551` | `shared/rating-logo` |
| Movie card (classic) | `69:1041` | `69:1044` | Not built |

## Posters

Fictional posters, for mockups, the gallery and store screenshots only.

| Poster | Id | File |
| --- | --- | --- |
| Last Reel at the Roxy | `7:30` | `last-reel-at-the-roxy.png` |
| Neon Harbor | `7:62` | `neon-harbor.png` |
| The Paper Comet | `7:79` | `the-paper-comet.png` |
| Midnight Matinee | `7:95` | `midnight-matinee.png` |
| Southbound Summer | `7:147` | `southbound-summer.png` |
| Signal and Noise | `7:159` | `signal-and-noise.png` |
| The Quiet Orchard | `7:176` | `the-quiet-orchard.png` |
| Grand Prix of Nowhere | `7:192` | `grand-prix-of-nowhere.png` |

Exported at the Figma's 240 by 360; re-export at 2x or 3x before using them in store screenshots.

## Icons

38 symbols named `Icon/<name>` in frame `3:690`, 24 points with a 2-point stroke: alert, arrow-up, ban, check, chevron-left, chevron-right, clock, copy, external-link, eye, film, globe, heart, info, link, lock, mail, play, plus, popcorn, qr, refresh, scan, settings, share, shield, sliders, star, ticket, trash, tv, undo, upload, user, users, wifi-off, x, zap.

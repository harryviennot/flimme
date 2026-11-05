# Play (Home)

Screen 04 in the Figma (`15:168`), and S1 Play on the First release page with the Play alone card and the tab bar ([the Figma map](../figma-map.md#first-release-page-993537)). Route `/play`, the first tab of the `(tabs)` group ([the tab bar](tab-bar.md)); `/home` stays as a redirect to it (Q43.1). Built in M4.7; the tab move is M6.43 and the Play alone card M6.44. Written on 30 October 2026 from [the paths at a glance](../../product/onboarding.md#the-paths-at-a-glance) and [the first release](../../product/roadmap.md#the-first-release-whats-in-what-waits); updated on 5 November 2026 (M6.39) for [solo mode and My films](../../product/solo-and-my-films.md#the-screens-to-spec). The file keeps its name so links hold; the specs call this screen Home or Play.

## Purpose

Two clear paths, and a third for a night alone: host a movie night, join one with a code, or play alone. Hosting stays first. A returning host is three taps from an open room (Open a room, then Open the room on the setup screen).

## Layout

`Screen` with `scroll`, no `TopBar`, above [the tab bar](tab-bar.md). Cards are 12 points apart (`gap-3`).

1. **Header row:** a `Pressable` holding `Avatar` M (the player's color, from `toAvatarColor(profile.avatar_key)` in `@/features/profile`: a key outside the six, such as `default` or an old value, draws as `blue`) beside the greeting (`mono-eyebrow`, tone `secondary`) and the name (`title-l`); it opens [the name screen](name.md) with `?edit=1`. On the right, `IconButton` filled `settings` to `/settings`.
2. **Host card** (`screens/home/host-card.tsx`): `bg-bg-surface`, a `border-marquee-strong` hairline, `rounded-lg`, `p-5`, `gap-3`. `MarqueeBulbs` (still) across the top, `display-m` title, `body-m` secondary body, then `Button` primary L with icon `plus`, to [host setup](host-setup.md).
3. **Join card** (`screens/home/join-card.tsx`): `bg-bg-surface`, a `border-border-default` hairline, `rounded-lg`, `p-4`, a row: `display-s` title and `body-s` muted line on the left, `Button` secondary S on the right, to [the code](join-code.md).
4. **Play alone card** (`screens/home/solo-card.tsx`, M6.44): the join card's look and layout. `display-s` title `solo:card.title` and `body-s` muted line `solo:card.body` on the left, `Button` secondary S `solo:card.cta` with icon `user` on the right, to [Play alone setup](solo-setup.md) (`/solo`). At the cap the button still goes there: setup shows the cap card.

At the largest text sizes the join and Play alone cards put the button under the text (`flex-col items-start`), so the title never wraps letter by letter.

Measured at 375 by 667: the header, the three cards and the tab bar fit without scrolling (about 500 of the 591 points between the status bar and the tab bar).

## States

| State | What the player sees |
| --- | --- |
| Loaded | The profile comes from the query cache filled on the splash, so there's normally nothing to wait for |
| Profile not cached yet | `Skeleton` for the name (`h-6 w-32 rounded-sm`); the cards are already there |
| Offline | `Banner` warn `home:offline` above the host card. The three buttons still work: each screen handles being offline |
| Back from a solo session the sweeper ended | `showToast` info `solo:ended.title` and `solo:ended.body` once, then Play as usual (Q39.2) |

There is no empty or error state: Home always has its three buttons.

## Copy (`home` namespace)

| Key | French | English |
| --- | --- | --- |
| `greeting.morning` | Bonjour | Good morning |
| `greeting.afternoon` | Bon après-midi | Good afternoon |
| `greeting.evening` | Bonsoir | Good evening |
| `host.title` | Organise une soirée film | Host a movie night |
| `host.body` | Choisis tes plateformes, invite tes amis. Tout le monde swipe jusqu'au match. | Pick your services, invite your friends. Everyone swipes until you match. |
| `host.cta` | Ouvrir une salle | Open a room |
| `join.title` | Tu as un code ? | Got a room code? |
| `join.body` | Rejoins tes amis qui ont déjà ouvert une salle. | Join friends who already started. |
| `join.cta` | Rejoindre | Join |
| `offline` | Tu es hors ligne. Reconnecte-toi pour organiser ou rejoindre. | You're offline. Connect to host or join. |
| `a11y.profile` | {{greeting}}, {{name}} (« Bonjour, Léa ») | {{greeting}}, {{name}} ("Good morning, Léa") |
| `a11y.profileHint` | Modifier ton prénom et ta couleur | Edit your name and color |
| `a11y.settings` | Réglages | Settings |

The Play alone card's keys are in the `solo` namespace (M6.43 registers it):

| Key | French | English |
| --- | --- | --- |
| `card.title` | Tout seul ce soir ? | On your own tonight? |
| `card.body` | Swipe à ton rythme, tes j'aime sont gardés dans Mes films. | Swipe at your own pace. Your likes are saved in My films. |
| `card.cta` | Jouer seul | Play alone |

The offline line still says "host or join": Play alone setup has its own offline state, so the line stays true.

The greeting follows the phone's local time: morning from 5:00, afternoon from 12:00, evening from 18:00.

## Motion, haptics, sound

- No entrance animation: Home must feel instant. The bulbs are lit and still (chasing is for the match).
- Presses as the components do (`haptics.press()`).

## Accessibility

- Focus order: the profile button (`home:a11y.profile`, read as the greeting and the name; `home:a11y.profileHint` says tapping edits them; while the name is unknown, the greeting alone), settings (`home:a11y.settings`), the host title (header), its body, Open a room, the join title (header), Join, the Play alone title (header), its body, Play alone, then the tab bar.
- Reduce Motion: nothing changes; nothing moves.

## Differences from the Figma

- The Play alone card and the tab bar are new (S1 on the First release page); the original Home has neither.

- No Connect Letterboxd card and no "Last movie night" row: Letterboxd waits for M20, and the last night's pick needs history the first release doesn't show ([the first release](../../product/roadmap.md#the-first-release-whats-in-what-waits)). The [app structure](../../architecture/app-structure.md#screens-and-navigation) route table lists both for later.
- The host card's body drops "Pick a mode, set the vibe": the first release has one mode and no moods.
- The Figma's Join button has a scan icon; there's no in-app scanner ([invites and deep links](../../architecture/app-structure.md#invites-and-deep-links)), so no icon.

## Questions

Harry accepted every default below on 30 October 2026.

1. **The last night's pick on Home.** Default: left out of the first release; it returns with the Home cards in M15 ("Did you watch it?").

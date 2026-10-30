# Home

Screen 04 in the Figma (`15:168`). Route `/home`. Built in M4.7. Written on 30 October 2026 from [the paths at a glance](../../product/onboarding.md#the-paths-at-a-glance) and [the first release](../../product/roadmap.md#the-first-release-whats-in-what-waits).

## Purpose

Two clear paths: host a movie night, or join one with a code. A returning host is three taps from an open room (Open a room, then Open the room on the setup screen).

## Layout

`Screen` with `scroll`, no `TopBar`.

1. **Header row:** a `Pressable` holding `Avatar` M (the player's color) beside the greeting (`mono-eyebrow`, tone `secondary`) and the name (`title-l`); it opens [the name screen](name.md) with `?edit=1`. On the right, `IconButton` filled `settings` to `/settings`.
2. **Host card** (`screens/home/host-card.tsx`): `bg-bg-surface`, a `border-marquee-strong` hairline, `rounded-lg`, `p-5`, `gap-3`. `MarqueeBulbs` (still) across the top, `display-m` title, `body-m` secondary body, then `Button` primary L with icon `plus`, to [host setup](host-setup.md).
3. **Join card** (`screens/home/join-card.tsx`): `bg-bg-surface`, a `border-border-default` hairline, `rounded-lg`, `p-4`, a row: `display-s` title and `body-s` muted line on the left, `Button` secondary S on the right, to [the code](join-code.md).

## States

| State | What the player sees |
| --- | --- |
| Loaded | The profile comes from the query cache filled on the splash, so there's normally nothing to wait for |
| Profile not cached yet | `Skeleton` for the name (`h-6 w-32 rounded-sm`); the cards are already there |
| Offline | `Banner` warn `home:offline` above the host card. Both buttons still work: each screen handles being offline |

There is no empty or error state: Home always has its two buttons.

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
| `a11y.profile` | Modifier ton prénom et ta couleur | Edit your name and color |
| `a11y.settings` | Réglages | Settings |

The greeting follows the phone's local time: morning from 5:00, afternoon from 12:00, evening from 18:00.

## Motion, haptics, sound

- No entrance animation: Home must feel instant. The bulbs are lit and still (chasing is for the match).
- Presses as the components do (`haptics.press()`).

## Accessibility

- Focus order: the profile button (`home:a11y.profile`), settings (`home:a11y.settings`), the host title (header), its body, Open a room, the join title (header), Join.
- Reduce Motion: nothing changes; nothing moves.

## Differences from the Figma

- No Connect Letterboxd card and no "Last movie night" row: Letterboxd waits for M20, and the last night's pick needs history the first release doesn't show ([the first release](../../product/roadmap.md#the-first-release-whats-in-what-waits)). The [app structure](../../architecture/app-structure.md#screens-and-navigation) route table lists both for later.
- The host card's body drops "Pick a mode, set the vibe": the first release has one mode and no moods.
- The Figma's Join button has a scan icon; there's no in-app scanner ([invites and deep links](../../architecture/app-structure.md#invites-and-deep-links)), so no icon.

## Questions

1. **The last night's pick on Home.** Default: left out of the first release; it returns with the Home cards in M15 ("Did you watch it?").

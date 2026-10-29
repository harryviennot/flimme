---
name: design-system
description: How the app's UI is built so every screen looks the same (Uniwind classes from the generated theme, the Text and Icon primitives, the ui/shared/screens tiers, the component list, the gallery, adding a token or a component). Use before writing or reviewing anything visible in mobile/, and when adding or changing a component or a token.
---

# The design system

Dark cinema marquee: arcade buttons with a hard 4-point lip, neon glows, spotlights. Display type is Staatliches (uppercase), text is Schibsted Grotesk, data is IBM Plex Mono. Background: docs/architecture/groundwork.md#the-apps-foundations, the component specs in docs/design/components.md, and the gallery in a development build at `/dev/gallery`.

## Styling: Uniwind (Tailwind 4 classes)

- `className` on React Native views, with **theme classes only**. The theme is generated from `mobile/src/theme/tokens.json` into `src/theme/generated/theme.css` and **replaces** Tailwind's defaults: `bg-red-500`, `text-sm` or `shadow-lg` don't exist, and lint fails on them.
- **Colors** are the token paths: `bg-bg-canvas`, `bg-bg-surface`, `bg-bg-raised`, `text-text-primary`, `border-border-default`, `bg-accent-default`, `bg-marquee-default`, `bg-like-default`, `bg-nope-default`, `bg-neon-soft`, `bg-avatar-teal`...
- **Spacing** is Tailwind's 4-point scale (`p-4` is 16, `gap-3.5` is 14). **Radii:** `rounded-xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `pill`.
- **Effects** are utilities: `lip-accent`, `lip-neutral`, `elevation-card`, `elevation-sheet`, `glow-accent`, `glow-like`, `glow-nope`, `glow-marquee`, `glow-focus`, `focus-ring`. Gradients: `gradient-card-scrim`, `gradient-marquee-sunset` (or `GradientFill`), spotlights through `Spotlight` (radial, SVG).
- **Strokes:** `border` (1), `border-2`, `stroke-badge` (1.5). **Opacity:** `opacity-disabled`, `opacity-stack-near`, `opacity-stack-far`.
- **Never:** arbitrary values (`p-[13px]`), hex colors, `fontSize` or `fontFamily` in styles. Need a value that doesn't exist? Add it to tokens.json with a `$description`, run `pnpm tokens` (from mobile/), and say so in the pull request.
- **Animated styles** use Reanimated with values from `tokens.ts` and `@/theme/motion`, never by swapping classes on every frame. `useSharedValue` changes go through `.set()` (the React Compiler forbids `.value =` in handlers).
- Third-party components without `className`: `withUniwind(Component)` from `uniwind`, or a `style` with tokens.

## Primitives every screen uses

- **`Text`**: the only thing that sets type. `variant` is one of the Figma's styles (`display-xl`, `display-l`, `display-m`, `display-s`, `title-l`, `title-m`, `body-l`, `body-m`, `body-m-strong`, `body-s`, `mono-data`, `mono-eyebrow`, `mono-code`, `label-button-l`, `label-button-s`); `tone` is `primary`, `secondary`, `muted`, `disabled`, `inverse`, `on-accent`, `accent`, `marquee`, `like`, `nope`, `neon`. `className` is for layout only. Five extra variants (`display-ticket`, `display-stamp`, `avatar-s/m/l`) belong to one component each.
- **`Icon`**: `name` (38 icons, typed), `size`, `color` (a color token), `strokeWidth`, `filled`.
- **`Pressable`**: every tappable thing. Required `accessibilityLabel`, a 44-point target, a haptic by meaning (`haptic="press"` by default, `false` for none).
- **`Screen`**: the frame (canvas, safe areas, `header`, `footer`, `scroll`).

## The components

| Tier | Component | For |
| --- | --- | --- |
| ui | `Button` | Arcade button: `primary`, `secondary`, `ghost`, `danger`, `marquee`; `l` or `s`; `icon`, `disabled`, `loading`, `block` |
| ui | `IconButton` | Round 40-point icon button, `filled` or `plain` |
| ui | `Chip` | Selectable filter (moods, time budget) |
| ui | `Tag` | Small uppercase label: `neutral`, `accent`, `like`, `nope`, `marquee`, `wildcard` |
| ui | `Avatar` | Initial on one of 10 colors, `s`/`m`/`l`, `online`, `overlap` for stacks |
| ui | `Input` | Labelled text field with helper or error |
| ui | `PinBox` | One digit of a room code |
| ui | `Toggle` | On/off switch |
| ui | `OptionCard` | Radio-style card for one choice |
| ui | `ListRow` | Settings row: icon, label, value or trailing control, chevron |
| ui | `TopBar` | Back, centred title, one action |
| ui | `Toast`, `showToast()` | Room events, the near miss, warnings (`ToastHost` is in the root layout) |
| ui | `Banner` | Reconnecting, offline |
| ui | `Countdown` | The Final Cut's timer from a server deadline |
| ui | `Skeleton`, `EmptyState` | Loading, empty and error states |
| ui | `MarqueeBulbs`, `Spotlight`, `GradientFill` | The brand's lights and gradients |
| shared | `SwipeAction` | The swipe screen's buttons: `nope`, `undo`, `super`, `like`, `seen`; `lit` |
| shared | `MovieCard` | The swipe card, front and back, flip, stamps |
| shared | `Poster`, `PosterThumb` | Posters with their placeholder |
| shared | `PlayerPill`, `RoomTicket`, `ServiceTile`, `ResultRow`, `RatingLogo` | Presence, the room code, services, runners-up, TMDB and Letterboxd marks |

## Tiers and files

- `components/ui/` knows nothing about films or rooms; `components/shared/` does, but gets its data through props; `components/screens/<screen>/` holds single-use pieces named after the route. Lint enforces the imports.
- File names are kebab-case (`movie-card.tsx`), exports PascalCase.
- **A piece needed by a second screen** moves to `shared/` (or `ui/`) in that pull request.
- **Every `ui/` and `shared/` component has a `<name>.gallery.tsx`** exporting `gallery` (name, tier, description, render showing every state with fixture data, `fixturePosters` for posters), listed in `components/gallery-registry.ts`. `scripts/check-gallery.mjs` fails otherwise.
- **Strings** in components come through `t()` (`useTranslation`), never literals. Gallery files are exempt.

## Adding a component

1. Check the gallery and the table above: extend an existing component with a variant before making a new one.
2. Spec it (the designer, in docs/design/components.md or the screen spec), from the Figma when it's there.
3. Build it from primitives and tokens; add its gallery entry; a behaviour test if it has logic (press, disabled, value).
4. `pnpm check` from mobile/.

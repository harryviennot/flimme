# Host setup

Screens 06 Game mode (`15:404`) and 07 Set the vibe (`15:492`) in the Figma, merged into one screen for the first release. Route `/host`. Built in M4.9, with `api.create_room` taking the settings (M4.4) and France's service list (M2.6). Written on 30 October 2026 from [hosting](../../product/onboarding.md#hosting), [the first release](../../product/roadmap.md#the-first-release-whats-in-what-waits), [services, variants and channels](../../integrations/tmdb.md#services-variants-and-channels) and [empty and error states](../../product/onboarding.md#empty-and-error-states).

## Purpose

Tell the room what it can watch, then open it. A returning host taps **Open the room** at once: their services are remembered and the other settings have defaults. The first release has one mode (Quick Match with the Final Cut) and no moods, so the Figma's two steps become one.

## Layout

`Screen` with `scroll`, `TopBar` (back, `host:topBar`), and the button in the `footer`.

1. **Title**, `display-m`, `host:title`.
2. **Services.** Eyebrow `host:services.label`, helper `body-s` muted `host:services.helper`, then **`ServiceGrid`** (new, `shared/`, spec below): the country's services from `api.country_providers` for the host's country, in `display_priority` order, prefilled from `api.my_providers`. Under it, `body-s` muted `host:services.free`.
3. **Time budget.** Eyebrow `host:time.label`, then one row of `Chip` (single choice): `host:time.any` (default, `runtime_max` empty), `host:time.under` for 1 h 45 (105) and for 2 h (120).
4. **Age cap.** Eyebrow `host:age.label`, `Chip` row (single choice, wraps): Adults (default, no cap), 16, 12, 10, All ages; helper `body-s` muted `host:age.helper`. They set `max_age` to empty, 16, 12, 10 and 0.
5. **Footer:** `Button` primary L, icon `ticket`, `host:open`. Disabled while no service is picked, with `body-s` muted `host:services.required` under it.

Sections are 24 points apart (`gap-6`); eyebrow to content 8.

## What Open the room does

1. If the services changed: `api.set_my_providers` (saved to the profile, so they're asked once).
2. `api.create_room` with `quick_match` and `{ runtime_max, max_age }` (one call, M4.4).
3. `ok`: `replace` with `/room/[id]/lobby`, and the [invite sheet](invite-sheet.md) opens over it.

## States and answers

| State or answer | What the host sees | Next |
| --- | --- | --- |
| Services loading | Six `Skeleton` tiles the size and radius of a `ServiceTile`; the chips are already usable | |
| Services failed to load | Inline `EmptyState` `error` in the services section, `host:errors.services` | `common:actions.retry` |
| No services for the country (empty list), or `create_room` refuses the country | The whole form gives way to `EmptyState` icon `globe`, `host:errors.unsupported.*` | `host:errors.unsupported.action`, to [the code](join-code.md) |
| No service picked | Open the room disabled, `host:services.required` | Pick one |
| Opening | `Button` `loading`; the form stays visible | |
| `ok` | The lobby with the invite sheet | |
| `name_required` | Pushes [the name screen](name.md); back here, the choices are kept | Open again |
| `country_required` | As "no services for the country" | |
| `unknown_mode` (a bug) | `showToast` warn `common:errors.generic.title`, reported to Sentry | |
| Offline | `Banner` warn `host:offline`; the button disabled | Enabled again when back online |
| The call failed | `showToast` warn `host:errors.network`, `haptics.error()`; the choices are kept | Open again |

## Copy (`host` namespace)

| Key | French | English |
| --- | --- | --- |
| `topBar` | Nouvelle salle | New room |
| `title` | Prépare la soirée | Set up tonight |
| `services.label` | Où pouvez-vous regarder ? | Where can you watch? |
| `services.helper` | Tes amis ajoutent leurs plateformes en arrivant. | Friends add their own services when they join. |
| `services.free` | Les plateformes gratuites sont toujours incluses. | Free services are always included. |
| `services.required` | Choisis au moins une plateforme | Pick at least one service |
| `time.label` | Durée | Time budget |
| `time.any` | Peu importe | Any length |
| `time.under` | Moins de {{duration}} | Under {{duration}} |
| `age.label` | Le plus jeune devant l'écran | Youngest viewer |
| `age.adults` | Adultes | Adults |
| `age.years` | {{age}} ans | {{age}}+ |
| `age.all` | Tous publics | All ages |
| `age.helper` | Les films au-dessus de son âge restent hors du jeu. | Films above their age stay out of the deck. |
| `open` | Ouvrir la salle | Open the room |
| `offline` | Tu es hors ligne. Reconnecte-toi pour ouvrir une salle. | You're offline. Connect to open a room. |
| `errors.services` | Impossible de charger les plateformes. | We couldn't load the services. |
| `errors.network` | Impossible d'ouvrir la salle. Réessaie. | We couldn't open the room. Try again. |
| `errors.unsupported.title` | Pas encore dans ton pays | Not in your country yet |
| `errors.unsupported.body` | On ne sait pas encore où regarder les films dans ton pays. Tu peux quand même rejoindre la salle d'un ami. | We can't show where to watch in your country yet. You can still join friends' rooms. |
| `errors.unsupported.action` | Rejoindre avec un code | Join with a code |

`{{duration}}` comes from `Intl` in the profile's language ("1 h 45", "2 h"), never hand-formatted. Service names are TMDB's, not translated.

## Motion, haptics, sound

- Tiles and chips change state with their own transitions (`timing.toggle`) and `haptics.press()`.
- Open the room: the `Button` press, then the lobby comes in and the invite sheet slides up with the system's sheet motion. No celebration: the room isn't full yet.

## Accessibility

- Service tiles are checkboxes ("Netflix, selected"); each chip row is a radio group labelled by its eyebrow.
- Focus order: back, title, the services label, the tiles row by row, the free services line, the time chips, the age chips and their helper, Open the room.
- Open the room's disabled reason is its accessibility hint.
- Reduce Motion: state changes without transitions.

## New component

**`ServiceGrid` (`shared/service-grid`).** `ServiceTile`s in rows of three (`gap-2`, 108 points each, as the Figma), wrapping. Props: `services` (id and name), `selected` (ids), `onToggle`, `loading` (shows six `Skeleton` tiles). No data fetching inside. Used here and in the lobby's services sheet ([lobby](lobby.md)), which is why it's shared. Gallery: loading, none selected, three selected, a long list.

## Differences from the Figma

- One screen instead of two ("Step 1 of 2" goes): no mode cards (Quick Match only in the first release), no moods (M17), no "Hide films anyone has seen" toggle (the seen rule is the default, and its Letterboxd wording no longer applies).
- The time budget drops "Epic night": it would need a minimum runtime, which the room's settings don't have. "Any length" is the default instead of "Under 2h".
- The age cap is new: the roadmap puts it in the first release; the Figma never drew it.
- The [app structure's route table](../../architecture/app-structure.md#screens-and-navigation) had `/host/mode` and `/host/vibe`; the code already has `/host`, and that row is corrected in this pull request.

## Questions

1. **The age cap's choices and wording.** Default: "Youngest viewer" with Adults, 16, 12, 10, All ages, mapped onto `max_age` against France's certifications (Tous publics, -10, -12, -16, -18), with Adults as the default. The copy never says "for kids".
2. **The time budget's choices.** Default: Any length, under 1 h 45, under 2 h.
3. **Free services.** They count for every room unless the host turns them off ([decisions](../../decisions.md)). Default: not shown as tiles in the first release, only the line saying they're included; turning them off waits.
4. **Changing settings from the lobby.** `api.update_room_settings` works in the lobby, and the Figma's invite sheet shows a sliders icon. Default: not in the first release; a host who wants other settings goes back and opens a new room.

# Host setup

Screens 06 Game mode (`15:404`) and 07 Set the vibe (`15:492`) in the Figma, merged into one screen for the first release. Route `/host`. Built in M4.9, with `api.create_room` taking the settings (M4.4) and France's service list (M2.6). Written on 30 October 2026 and updated on 3 November 2026 (slice 5's questions, all defaults accepted by Harry) from [hosting](../../product/onboarding.md#hosting), [the first release](../../product/roadmap.md#the-first-release-whats-in-what-waits), [services, variants and channels](../../integrations/tmdb.md#services-variants-and-channels) and [empty and error states](../../product/onboarding.md#empty-and-error-states).

## Purpose

Tell the room what it can watch, then open it. A returning host taps **Open the room** at once: their services are remembered and the other settings have defaults. The first release has one mode (Quick Match with the Final Cut) and no moods, so the Figma's two steps become one.

## Layout

`Screen` with `scroll`, `TopBar` (back, `host:topBar`), and the button in the `footer`.

1. **Title**, `display-m`, `host:title`.
2. **Services.** Eyebrow `host:services.label`, helper `body-s` muted `host:services.helper`, then **`ServiceGrid`** (new, `shared/`, spec below): the country's services from `api.country_providers` for `profile.country`, in `display_priority` order. Under it, `body-s` muted `host:services.free`.
3. **Time budget.** Eyebrow `host:time.label`, then one row of `Chip role="radio"`: `host:time.any` (default, `runtime_max` empty), `host:time.under105` (105) and `host:time.under120` (120).
4. **Age cap.** Eyebrow `host:age.label`, a row of `Chip role="radio"` (wraps): Adults (default, no cap), 16, 12, 10, All ages; helper `body-s` muted `host:age.helper`. They set `max_age` to empty, 16, 12, 10 and 0.
5. **Footer:** `Button` primary L, icon `ticket`, `host:open`. Disabled while no service is picked, with `body-s` muted `host:services.required` under it.

Sections are 24 points apart (`gap-6`); eyebrow to content 8. Each chip row is a `View` with `accessibilityRole="radiogroup"` and the eyebrow's text as its label.

**The prefill.** The selection starts as the saved ids (`api.my_providers`) that the country's list contains. Saved ids the list no longer has are ignored on screen. "Changed" means the selection differs from that starting set (order doesn't count). Both queries run in parallel; the grid shows the loading state until both have answered.

## What Open the room does

1. Only if the selection changed: `api.set_my_providers` with the selection (saved to the profile, so they're asked once). It replaces the saved list, so saved ids the country no longer lists go then. Any answer but `ok`, or a failed call, stops here and no room is created: the host's seat copies the profile's services when the room is created, so the order matters.
2. `api.create_room` with `quick_match`, `profile.country` and `{ runtime_max, max_age }` (one call, M4.4).
3. `ok`: `router.replace('/room/[id]/lobby')` and nothing else: no full-screen share step (decided on 5 November 2026). The host shares from the lobby with the code, **Share link** and **Show QR** ([lobby](lobby.md), [invite sheet](invite-sheet.md)).

Opening a room leaves the kept room: after `ok`, if the phone keeps another room, it calls `api.leave_room` on it once, without waiting or retrying (see [leaving the old seat](join-sheet.md#leaving-the-old-seat)).

## States and answers

| State or answer | What the host sees | Next |
| --- | --- | --- |
| No country on the profile (`profile.country` is null) | The unsupported state at once (the next row); the services aren't queried | `host:errors.unsupported.action` |
| No services for the country (an empty list) | The whole form gives way to `EmptyState` icon `globe`, `host:errors.unsupported.*`. `create_room` doesn't refuse a country without a catalog (decisions.md, 3 Nov 2026), so the empty list is how the screen knows | `host:errors.unsupported.action`, to [the code](join-code.md) |
| Services loading | Six `Skeleton` tiles in two rows of three, each `h-17 flex-1 rounded-md` (68 points, a `ServiceTile`'s height: 12 of border and padding, `title-m`'s 22, a gap of 4, `body-s`'s 18, 12 again); the chips are already usable | |
| Services failed to load (either query) | Inline `EmptyState` `error` in the services section, `host:errors.services` | `common:actions.retry` refetches both |
| No service picked | Open the room disabled, `host:services.required` | Pick one |
| Opening | `Button` `loading`; the form stays visible | |
| `ok` | The lobby | |
| `set_my_providers` `too_many` (a bug: the grid lists 18 at most, the cap is 50) | `showToast` warn `common:errors.generic.title`, reported to Sentry; no room is created, the choices are kept | |
| `set_my_providers` failed (network or server) | As "The call failed" below; no room is created | Open again |
| `name_required` (only through a race: Home needs a name) | Pushes [the name screen](name.md) as `/name?edit=1`, which goes back here after a save; the choices are kept | The host taps Open again |
| `country_required` | The unsupported state | |
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
| `time.under105` | Moins de 1 h 45 | Under 1 h 45 |
| `time.under120` | Moins de 2 h | Under 2 h |
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

The two durations are written as copy, not built with `Intl`: `Intl.DurationFormat` isn't reliable in Hermes, and "1 h 45" isn't a `NumberFormat` unit. They are fixed choices, so the copy rule's "through `Intl`" doesn't apply. Service names are TMDB's, not translated.

## Motion, haptics, sound

- Tiles and chips change state with their own transitions (`timing.toggle`) and `haptics.press()`.
- Open the room: the `Button` press, then the lobby replaces this screen. No celebration: the room isn't full yet.

## Accessibility

- Service tiles are checkboxes ("Netflix, selected"). Each chip row is a radio group labelled by its eyebrow, and each chip in it is a radio (`Chip role="radio"`, announced "Under 2 h, radio button, selected" or the platform's equivalent).
- Focus order: back, title, the services label, the tiles row by row, the free services line, the time chips, the age chips and their helper, Open the room.
- Open the room's disabled reason is its accessibility hint.
- Reduce Motion: state changes without transitions.

## New component

**`ServiceGrid` (`shared/service-grid`).** `ServiceTile`s in rows of three (`gap-2`, each tile a third of the width: 106 points on a 375-wide phone, the Figma's 108 on a large one), wrapping. Props: `services` (id and name), `selected` (ids), `onToggle`, `loading` (shows six `Skeleton` tiles, 68 points high, as in the states table). No data fetching inside. Used here and in the lobby's services sheet ([lobby](lobby.md)), which is why it's shared. Gallery: loading, none selected, three selected, a long list.

## Differences from the Figma

- One screen instead of two ("Step 1 of 2" goes): no mode cards (Quick Match only in the first release), no moods (M17), no "Hide films anyone has seen" toggle (the seen rule is the default, and its Letterboxd wording no longer applies).
- The time budget drops "Epic night": it would need a minimum runtime, which the room's settings don't have. "Any length" is the default instead of "Under 2h".
- The age cap is new: the roadmap puts it in the first release; the Figma never drew it.
- The [app structure's route table](../../architecture/app-structure.md#screens-and-navigation) had `/host/mode` and `/host/vibe`; the code already has `/host`, and that row is corrected in this pull request.

## Differences from onboarding

- The unsupported state offers the French catalog (Q0.4, decisions.md, 5 Nov 2026), next to Join with a code. [Onboarding's error table](../../product/onboarding.md#empty-and-error-states) also lists "Choose another country"; it ships as the country choice below. The 3 Nov 2026 decision that dropped it is replaced.

## The country choice (M11.11)

The unsupported state (no country on the profile, a country whose catalog lists no services, or `country_required`) shows `EmptyState` `globe` with `host:errors.unsupported.*` and two ways out:

- **One country has a catalog** (`api.catalog_countries`, France at launch): the primary action `country:use` ("Utiliser le catalogue : France" / "Use the catalog: France") saves the country with `api.update_profile` and the setup carries on in place, with the services of that country. "Rejoindre avec un code" stays below it as a ghost button.
- **Several have one:** the primary action is `country:choose`, which opens the country list (`/settings/country`, the same list as Settings). Choosing a country goes back to the setup, which carries on.
- While the list loads, or if it fails or is empty, only Join with a code shows (the earlier state).
- A save that fails keeps the state and shows the toast `country:errors.save` with the error haptic.
- A country the server refused is only treated as refused until the player picks another one.

Play alone's setup shows the same state and action (`solo-setup.md`). Players who choose a country see that country's services and availability, whatever their phone's region.

## Questions

Harry accepted every default below on 30 October 2026.

1. **The age cap's choices and wording.** Default: "Youngest viewer" with Adults, 16, 12, 10, All ages, mapped onto `max_age` against France's certifications (Tous publics, -10, -12, -16, -18), with Adults as the default. The copy never says "for kids".
2. **The time budget's choices.** Default: Any length, under 1 h 45, under 2 h.
3. **Free services.** They count for every room unless the host turns them off ([decisions](../../decisions.md)). Default: not shown as tiles in the first release, only the line saying they're included; turning them off waits.
4. **Changing settings from the lobby.** `api.update_room_settings` works in the lobby, and the Figma's invite sheet shows a sliders icon. Default: not in the first release; a host who wants other settings goes back and opens a new room.

Harry accepted every default of slice 5's plan on 3 November 2026; this spec now says each one:

5. **Duration labels** are fixed copy (`time.under105`, `time.under120`), not `Intl`.
6. **Radio chips:** `Chip` gets `role` (`checkbox` by default, `radio`), and each single-choice row is a `radiogroup` labelled by its eyebrow ([components](../components.md#chip-uichip)).
7. **`name_required`** pushes `/name?edit=1`; the choices are kept and the host taps Open again ([name](name.md)).
8. **After `ok`:** replace to the lobby. The invite sheet is not pushed (decided on 5 November 2026).
9. **`set_my_providers`** runs first and only on a change; any failure stops before `create_room`.
10. **Prefill:** the saved ids the country lists; "changed" compares against that.
11. **No country on the profile:** the unsupported state at once, without querying services.
12. **"Choose another country"** is dropped in the first release.

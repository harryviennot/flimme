# The people search sheet

Route `/room/[id]/skip-people`, a `formSheet` where a player finds an actor or a director to skip for the night. Written on 11 November 2026 from the family playtest ("nothing with Brad Pitt"); built by M6.71 on M6.69's `api.search_people` and M6.68's skips. The rules are in [game modes](../../product/game-modes.md#not-tonight) (any person with a director or cast credit in the catalog, up to 3 per player, no room limit for people, private to the player) and the screen's side in [the genre step's Not tonight](genre-step.md#not-tonight-m670-and-m671); the people's images follow [TMDB images](../../integrations/tmdb.md#images).

## Purpose

Type a name, see who it is, tap once. The person joins this player's Not tonight list and the sheet closes. It should take under 10 seconds and never show anyone else what was searched or chosen.

## Where it opens

- From **Add a person** in `TonightPrefs`, on [the genre step](genre-step.md#the-layout-with-not-tonight) and in the lobby's [genres sheet](lobby.md#your-genres-tonight).
- Registered in the room layout like the other sheets: `presentation: 'formSheet'`, `gestureEnabled: true`, `sheetGrabberVisible: true`, `sheetAllowedDetents: [1]` (full height: the keyboard takes the lower half, and the results need the rest).
- **Over the genres sheet** it is presented on top of it (a sheet over a sheet, which iOS supports). If that misbehaves on the simulator, the genres sheet uses `router.replace` to the search sheet and the search sheet replaces itself back on close; the draft lives in `features/lobby/tonight-draft.ts`, so nothing is lost either way (question 1).
- `isAllowed`: `skip-people` in `lobby` only. Start closes it with the screen under it ([Start with unsaved changes](genre-step.md#what-a-tap-does)).

## Layout

`Screen` with `sheet` (Gesture Handler's `ScrollView` under its own root view), `bg-bg-canvas`, no footer.

1. **The header,** fixed, `px-5 pt-5 gap-3`:
   1. A row: `skipPeople.title` in `display-s`, role `header`, `flex-1`; `IconButton` plain `x` (`common:actions.close`).
   2. `skipPeople.helper`, `body-s` tone `secondary`. At the cap it is replaced by `prefs.notTonight.peopleCap` (a polite live region).
   3. **`SearchField`** (new, [below](#new-component-searchfield-uisearch-field)): label `skipPeople.field`, placeholder `skipPeople.placeholder`, `autoFocus`, `maxLength` 60, `returnKeyType="search"`, `autoCorrect` off, `autoCapitalize="none"`.
2. **The results,** a scroll view below the header, `px-5 pt-3`, bottom padding `max(insets.bottom, 16)`, `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`, `automaticallyAdjustKeyboardInsets`. The rows sit in one group, `rounded-lg border border-border-default bg-bg-surface overflow-hidden`.

**A result** is a `ListRow` (with its new `description`), with no photo and no icon (avatars come later, [question 2](#questions)):

- `label`: the name, `body-l`, up to 2 lines.
- `description`: one known film, `skipPeople.knownFor` ("Fight Club (1999)"), or `skipPeople.knownForNoYear`; no line when the answer has none.
- No chevron (a tap adds, it doesn't navigate). A person already on this player's list shows `skipPeople.already` as the `value`, and an `Icon` `check`, 18, `accent-text`.

**Rows come in the server's order** (name similarity, then popularity), up to 8. No paging: a ninth person means a longer name.

**Sizes.** On a 375 by 667 phone with the keyboard up, the header and three to four rows show and the rest scrolls. At the largest text the title caps at `display-s`'s scale, the helper wraps to three lines, names wrap to two, and the field keeps its height with the text scaling inside.

## What the search does

- **Under 2 characters** (after trimming): no call. Any earlier results clear and the helper stays.
- **2 to 60 characters:** the call goes 300 ms after the last keystroke (a constant in `features/lobby/people.ts`, not a motion token). Only the latest query's answer is drawn; an older answer that arrives late is dropped.
- **The query never leaves the call.** No analytics, no logs, no Sentry breadcrumb with the text (privacy rule 7). A Sentry report for a bad answer carries the status only.
- **A tap on a result** adds `{ id, name }` to the draft and closes the sheet (`router.back()`). The chip pops into the People row under it. Nothing is saved until Continue or Done.
- **A tap on someone already on the list** closes the sheet with no change.

## States and answers

| State or answer | What the player sees |
| --- | --- |
| Just opened | The header, the field focused with the keyboard up, the helper; no results area |
| Fewer than 2 characters | The same; results cleared |
| Searching, first time | Three skeleton rows in the group: a name line (`h-4 w-32`) and a film line (`h-3 w-24`). The field's leading icon becomes a small `ActivityIndicator` (`busy`) |
| Searching again | The last results stay at full opacity until the new ones replace them; the field shows `busy` |
| `ok` with people | The rows; `skipPeople.a11y.results_*` announced politely |
| `ok` with none | `EmptyState` icon `user`, title `skipPeople.empty`, body `skipPeople.emptyHint`, no action |
| Offline | `EmptyState` icon `wifi-off`, `skipPeople.offline`, action `genresSheet.retry`. Typing still works; back online, it searches the current text by itself |
| The call failed (online) | `EmptyState` `error`, `skipPeople.failed`, action `genresSheet.retry` |
| `invalid` (the length check: a bug, since the phone sends 2 to 60) | As a failed call, reported to Sentry without the text |
| The cap reached (3 people in the draft; only through a race, since Add a person is disabled at the cap) | Results show; the helper reads `prefs.notTonight.peopleCap`; a tap on a new person adds nothing and keeps the sheet open; no haptic beyond the press |
| Start, the room closes, the seat is removed | The sheet closes with the screen under it, as every room sheet |

## New component: `SearchField` (`ui/search-field`)

A one-line search box. It shares `Input`'s surface and focus look, without the eyebrow label (the label is for screen readers; the sheet's title already says what to type).

- **Look:** `h-12 flex-row items-center gap-2 rounded-md bg-bg-raised`. Idle: `border border-border-control`, padding `pl-3.25 pr-1`. Focused: `border-2 border-accent-default glow-accent`, padding `pl-3 pr-0.75`, so the text never moves sideways (as `Input` does). Leading: `Icon` `search`, 20, `text-muted`, or while `busy` an `ActivityIndicator` in `text-muted` in the same 20-point box. The text: `type-input text-text-primary`, placeholder `text-muted`, cursor and selection `accent-default`. Trailing, only when the value isn't empty: `IconButton` plain `x` with `common:actions.clear`; a press empties the field and keeps focus.
- **Props:** the `TextInput` props it passes through (`value`, `onChangeText`, `placeholder`, `maxLength`, `returnKeyType`, `autoFocus`, `onSubmitEditing`), plus `accessibilityLabel` (required) and `busy`.
- **Accessibility:** the container has `accessibilityRole="search"`; the input reads its label and value; the clear button is its own element. `busy` sets `accessibilityState.busy`.
- **Gallery:** empty with a placeholder, focused, with text and the clear button, `busy`, the largest text.
- **Tests:** the clear button shows only with text and empties the field; `busy` swaps the icon for the spinner.

Strings come through props, except the clear button's label (`common:actions.clear`, new: "Effacer" / "Clear").

## Design-system changes

- **`SearchField`** (`ui/search-field`), new, above.
- **`Icon`** gains `search` (24 points, 2-point stroke, `assets/icons/search.svg`, the same family as `info` and `x`), then `mise run tokens`.
- **`ListRow`** (`ui/list-row`) gains `description` (a second line under the label, `body-s` tone `muted`, one line, included in the row's screen reader label). The row's minimum height stays 56; with a description it grows to fit. Gallery: a row with a description, and one with `value` and a check.

## Copy (`lobby` namespace, `skipPeople`)

| Key | French | English |
| --- | --- | --- |
| `skipPeople.title` | Écarter quelqu'un | Skip someone |
| `skipPeople.helper` | Un acteur, une actrice, un réalisateur : ses films sortent du jeu ce soir. Les autres ne voient pas qui tu écartes. | An actor or a director: their films leave tonight's deck. Nobody else sees who you skip. |
| `skipPeople.field` | Chercher un nom | Search for a name |
| `skipPeople.placeholder` | Un acteur, une réalisatrice… | An actor, a director… |
| `skipPeople.knownFor` | {{title}} ({{year}}) | {{title}} ({{year}}) |
| `skipPeople.knownForNoYear` | {{title}} | {{title}} |
| `skipPeople.already` | Déjà dans ta liste | Already on your list |
| `skipPeople.empty` | Personne à ce nom dans nos films. | Nobody by that name in our films. |
| `skipPeople.emptyHint` | Vérifie l'orthographe ou essaie un autre nom. | Check the spelling or try another name. |
| `skipPeople.failed` | La recherche n'a pas marché. | The search didn't work. |
| `skipPeople.offline` | Pas de réseau. La recherche revient avec la connexion. | No network. Search comes back with your connection. |
| `skipPeople.a11y.row` | {{name}}, {{film}} | {{name}}, {{film}} |
| `skipPeople.a11y.rowHint` | Ses films sortent du jeu ce soir. | Their films leave tonight's deck. |
| `skipPeople.a11y.results_one` | {{count}} résultat | {{count}} result |
| `skipPeople.a11y.results_other` | {{count}} résultats | {{count}} results |
| `skipPeople.a11y.searching` | Recherche en cours | Searching |
| `skipPeople.a11y.added` | Dans ta liste : {{name}} | On your list: {{name}} |

In `common`: `actions.clear`, "Effacer" / "Clear". Reused: `common:actions.close`, `lobby:genresSheet.retry`, `lobby:prefs.notTonight.peopleCap`. "ÉCARTER QUELQU'UN" fits the sheet's title line at 375 points. The French avoids gendered past participles for a person ("Dans ta liste : …"), since the name can be anyone's.

## Motion, haptics, sound

- The system sheet's slide in and out; the keyboard rises with it.
- Skeleton rows give way to results with `layout.fadeIn`; a new answer replaces rows in place, with no stagger (typing would make it flicker).
- The chosen person's chip arrives on the screen under it with `layout.popIn` ([the genre step](genre-step.md#motion-haptics-sound-1)).
- Haptics: `haptics.press()` on a row, Close and Clear (through `Pressable`); no haptic for "no result" or a failure (they aren't refusals of something the player did). No sound beyond the button tick.
- Reduce Motion: the system's sheet; fades stay.

## Accessibility

- On open, focus goes to the field (the keyboard is up). Order: the title (header), Close, the helper, the field, Clear, the results.
- Each result is a button: `skipPeople.a11y.row` (or the name alone with no film), hint `skipPeople.a11y.rowHint`; one already on the list adds `skipPeople.already` and is `selected`.
- After each answer the count is announced politely (`skipPeople.a11y.results_*`), or the empty title. `skipPeople.a11y.searching` is announced once per search only when it takes over a second.
- On close after a pick, focus returns to Add a person, and `skipPeople.a11y.added` is announced.
- Dynamic Type and the smallest screen: [Sizes](#layout). Every target is 44 points.

## Feel check (for M6.71)

- Type "pitt": after a short pause, rows with a name and one film each; typing more replaces them with no flicker.
- Type one letter: nothing happens, no spinner.
- Tap a result: the sheet slides down and the chip pops into People at once.
- Airplane mode: the offline state; back online, the results come by themselves.
- A name with no match ("zzzz"): the empty state, no buzz.
- Open it from the lobby's genres sheet: it stacks cleanly, and closing it finds the genres sheet as it was.
- VoiceOver: the field is focused on open; the results count is read after each search.

## Questions

1. **A sheet over the genres sheet.** Default: presented on top of it; `router.replace` both ways if stacking misbehaves on the simulator (the draft survives either way).
2. **Photos.** Decided by Harry on 11 November 2026: no photos for now. A result shows the name and one known film. Avatars come later, from Harry's own avatar design, not from TMDB profile photos; `api.search_people` doesn't need `profile_path` until then.
3. **Close after one pick.** Default: yes. Most players skip one person; a second is one tap away.

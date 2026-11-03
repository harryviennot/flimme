# Join with a code

Screen 05 in the Figma (`15:312`). Route `/join`. Built in M4.8, with the answers from M4.1 (and `removed` and `locked` from M4.2). Written on 30 October 2026 and updated on 3 November 2026 (slice 6's questions, then slice 7's kept room, all defaults accepted by Harry) from [joining with a code](../../product/onboarding.md#joining-with-a-code-or-a-qr-code), [empty and error states](../../product/onboarding.md#empty-and-error-states), [the worked example](../../agent-workflow.md#a-worked-example-joining-with-a-code), [room codes and joining](../../architecture/security.md#room-codes-joining-and-the-host) and `JOIN_ROOM_ANSWERS` in `packages/contract/src/answers.ts`.

## Purpose

Six digits and you're in. The app tries to join as soon as the sixth digit is typed; there is no Join button.

## Layout

`Screen` with `TopBar` (back, `join:topBar`).

1. **Title**, `display-l`, `join:title`.
2. **Body**, `body-m`, tone `secondary`, `join:body`.
3. **`CodeField`** (`screens/join/code-field.tsx`): six `PinBox` in a row (`gap-2`, so 328 points wide at 375), over a hidden `TextInput` that owns the value: `keyboardType="number-pad"`, `maxLength` 6, focused on open, no autofill. The box for the next digit is `active`; typed boxes show their digit. Tapping the boxes focuses the input. The keypad is the system number pad, as the Figma draws it.
4. **Status line**, `body-s`, under the boxes: `join:checking` in tone `muted` while the call runs; an answer's message in tone `nope`. One line reserved, so nothing jumps.
5. **Paste**, under the status line while the field is empty: on iOS 16 and later, `ClipboardPasteButton`, which pastes without the system alert; on Android (and older iOS), `Button` ghost S with icon `copy`, `join:paste`, which reads the clipboard only when tapped. Both come from **expo-clipboard**, which M4.8 installs: a native package, so the development builds are rebuilt. Pasted text that is an invite link (parsed as strictly as the [join sheet's](join-sheet.md#links) links) gives its code and its room reference; anything else keeps its digits only, and six of them fill the field.
6. **Next step**, under the status line when an answer offers one: `Button` secondary S (`join:actions.host`, to [host setup](host-setup.md), or `common:actions.retry`).

## Answers (`api.join_room`)

| Answer | Message (status line) | Boxes | Haptic | Next |
| --- | --- | --- | --- | --- |
| `ok` | | Stay filled | None: arriving is the reward | `replace` with `/room/[id]`; the room layout shows the lobby or the swipe screen |
| `not_found` | `join:errors.notFound` | Shake, then clear; the caret goes back to the first box | `haptics.error()` | Type again |
| `rate_limited` | `join:errors.rateLimited` | Clear, no shake | `haptics.error()` | Paste a link, or wait |
| `full` | `join:errors.full` (`{{max}}` is `max_players`) | Stay filled | `haptics.error()` | Host a movie night |
| `starting` | `join:shuffling` in tone `muted` | Stay filled | None | Retries every second for up to 10 seconds, then `join:errors.starting` and Retry |
| `in_finale` | `join:errors.inFinale` | Stay filled | `haptics.error()` | Host a movie night |
| `name_required` | | Stay filled | None | Pushes [the name screen](name.md) with `?code=`. Back here, it joins again by itself only if the profile now has a name; a player who backed out without saving finds the digits filled and no message (deleting a digit and typing it again retries) |
| `closed` (a pasted link to an ended room) | `join:errors.closed` | Clear | `haptics.error()` | Host a movie night |
| `removed` (planned, M4.2) | `join:errors.removed` | Clear | `haptics.error()` | Host a movie night |
| `locked` (planned, M4.2) | `join:errors.locked` | Stay filled | `haptics.error()` | Host a movie night |
| Offline before the call | `join:errors.offline` | Stay filled | None | Joins by itself when the connection comes back |
| The call failed | `join:errors.network` | Stay filled | `haptics.error()` | Retry |

Typing or deleting a digit clears the message. A Jest test walks `JOIN_ROOM_ANSWERS` and `PLANNED_JOIN_ROOM_ANSWERS` and fails if one has no row here. `removed` and `locked` ship in M4.8 against the planned list (`['removed', 'locked']` after M4.1), so they work the day M4.2 makes `join_room` return them, with no app change.

**Leaving the old seat (M4.22).** When the phone keeps a seat in another room, an `ok` here leaves it exactly as the [join sheet](join-sheet.md#leaving-the-old-seat) does (once, without waiting or retrying), and the new room becomes the kept one. There is **no leave line**: a typed code joins at once, with nothing to confirm (Q22.4).

**What the call sends.** `api.joinRoom({ code, via: 'code' })` for typed digits. For a pasted link: `{ code, ref, via: 'link' }`, with no `link_opened_at` (nobody knows when the link was tapped). The [join sheet](join-sheet.md) is the only caller that sends `link_opened_at`.

## Copy (`join` namespace)

The messages are shared with the [join sheet](join-sheet.md).

| Key | French | English |
| --- | --- | --- |
| `topBar` | Rejoindre une salle | Join a room |
| `title` | Entre le code de la salle | Enter the room code |
| `body` | Demande les 6 chiffres à l'hôte, ou scanne son QR code avec l'appareil photo. | Ask the host for the 6 digits, or scan their QR code with your camera. |
| `checking` | Vérification… | Checking… |
| `paste` | Coller | Paste |
| `shuffling` | On mélange les cartes… | Shuffling the deck… |
| `errors.notFound` | Aucune salle ouverte avec ce code. Vérifie les chiffres avec l'hôte. | No open room with this code. Check the digits with the host. |
| `errors.rateLimited` | Trop d'essais. Demande le lien à l'hôte, ou réessaie dans quelques minutes. | Too many tries. Ask the host for the link, or try again in a few minutes. |
| `errors.full` | Cette salle est complète : {{max}} joueurs maximum. | This room is full ({{max}} players). |
| `errors.starting` | La partie démarre. Réessaie dans un instant. | The game is starting. Try again in a moment. |
| `errors.inFinale` | Ils votent pour le film du soir en ce moment. Tu seras de la prochaine partie. | They're voting on the final pick right now. Catch the next game. |
| `errors.closed` | Cette soirée film est terminée. | This movie night has ended. |
| `errors.removed` | L'hôte t'a retiré de cette salle. | The host removed you from this room. |
| `errors.locked` | Cette salle est verrouillée. Demande à l'hôte de l'ouvrir. | This room is locked. Ask the host to unlock it. |
| `errors.offline` | Tu es hors ligne. Reconnecte-toi pour rejoindre. | You're offline. Connect to join. |
| `errors.network` | Impossible de joindre la salle. Vérifie ta connexion. | We couldn't reach the room. Check your connection. |
| `actions.host` | Organiser une soirée | Host a movie night |
| `a11y.field` | Code de la salle, 6 chiffres | Room code, 6 digits |
| `a11y.progress` | {{digits}}, {{count}} chiffres sur 6 | {{digits}}, {{count}} of 6 digits |

## Motion, haptics, sound

- A typed digit appears in its box at once (`PinBox` filled); the active border moves with `timing.toggle`.
- **The wrong-code shake:** the row moves 8 points left, right, left and back (`space.8`), each step `duration.instant` with `easing.standard` (320 ms in all), with `haptics.error()` at the start. The digits clear when it ends. It should read as "try again", not as a crash.
- `PinBox` shows its new `error` state (below) from the answer until the next keystroke.
- The keypad's own clicks are the system's; no haptic per digit.

## Accessibility

- The hidden `TextInput` is the one accessible element: label `join:a11y.field`, value `join:a11y.progress` (digits read one by one). The boxes are hidden from screen readers.
- Each message is announced when it appears (a polite live region).
- Focus order: back, title, body, the code field, Paste, the next-step button.
- Reduce Motion: no shake; the red boxes, the message and the haptic stay.

## Design-system change

**`PinBox` gains `error`:** a 2-point `nope.default` border instead of the default or active one. Gallery: add the error state.

## Differences from the Figma

- No **Scan QR code** button. The [app structure](../../architecture/app-structure.md#invites-and-deep-links) and M4.15 use the phone's own camera; onboarding still lists an in-app scanner as a second option. The body text says to use the camera instead.
- Inline error states and the Paste button, as [onboarding's Figma changes](../../product/onboarding.md#changes-to-the-figma) ask.

## Questions

Harry accepted every default below on 30 October 2026.

1. **An in-app scanner.** Default: none in the first release (one less permission, and the camera app already opens the link). Onboarding's permissions table keeps the camera row for when it comes.
2. **`full` with the number.** `join_room` didn't say the room's maximum. Default: M4.1 adds `max_players` to the `full` answer, and the message always shows it.
3. **Paste on Android.** Default: the ghost Paste button reads the clipboard only when tapped. Android 13 and later shows its own "pasted" notice, which is fine.

Harry accepted every default of slice 6's plan on 3 November 2026; this spec now says each one:

4. **Paste now** (Q8.1): M4.8 installs expo-clipboard, with new development builds.
5. **A pasted link** (Q8.2) sends `via: 'link'` and the reference, no `link_opened_at`; typed digits send `via: 'code'`.
6. **Back from the name screen without saving** (Q8.3): join again only when the profile now has a name.
7. **`removed` and `locked`** (Q1.6) get their messages in M4.8, against `PLANNED_JOIN_ROOM_ANSWERS`.

Harry accepted these on 3 November 2026 (slice 7):

8. **The old seat** (Q22.4): the code screen leaves it too, with no leave line.

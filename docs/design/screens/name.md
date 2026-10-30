# Your name

Screen 03 in the Figma (`9:362`). Route `/name`. Built in M4.6, with the name rules from M4.3. Written on 30 October 2026 from [onboarding](../../product/onboarding.md#first-launch), [keeping kids safe on screen](../../architecture/security.md#keeping-kids-safe-on-screen) and `api.update_profile` in [schema.sql](../../architecture/schema.sql).

## Purpose

A name and a color are all a player needs to host or join. One field, one row of colors, one button.

It opens from three places:

| From | Route | After Continue |
| --- | --- | --- |
| Welcome's Get started | `/name` | Home (`replace`) |
| A code typed before naming (`join_room` answered `name_required`) | `/name?code=482913` | Back to [the code](join-code.md), which joins again with the same code |
| Home's avatar (edit) | `/name?edit=1` | Back to Home |

The [join sheet](join-sheet.md) uses the same form (`NameForm`) for players arriving by link.

## Layout

`Screen` with `TopBar` (back, `onboarding:name.topBar`) and the button in the `footer`, which rides above the keyboard.

1. **Title**, `display-l`, `onboarding:name.title`.
2. **`NameForm`** (new, `shared/`, spec below):
   - eyebrow `onboarding:name.colorLabel`, then **`AvatarPicker`** (new, `ui/`): 6 `Avatar` M swatches showing the typed name's initial, one row, spread across the width.
   - **`Input`** with label `onboarding:name.nameLabel` and helper `onboarding:name.helper`; `maxLength` 24, autocapitalised, no autocorrect, `textContentType="nickname"`. Focused on open (unless a screen reader is on).
3. **Note**, `body-s`, tone `muted`, `onboarding:name.note`.
4. **Footer:** `Button` primary L `onboarding:name.continue`, disabled until the trimmed name has 1 to 24 characters, `loading` while saving.

The color is preselected: a random one of the six the first time (so friends rarely start on the same), the current one when editing.

## States and answers (`api.update_profile`)

| Answer or state | What the player sees | Next |
| --- | --- | --- |
| `ok` | Moves on as the table above says | |
| `invalid_name` (nothing left after normalising, such as only spaces or invisible characters) | `Input` error `onboarding:name.errors.invalid`; `haptics.error()` | The field keeps the text |
| The blocklist answer from M4.3 | `Input` error `onboarding:name.errors.notAllowed`; `haptics.error()`. Never says which word | The field keeps the text |
| Offline | `showToast` warn, `onboarding:name.errors.offline` | Continue works again once connected |
| Request failed | `showToast` warn, `common:errors.generic.title` | Continue again |

## Copy (`onboarding` namespace)

| Key | French | English |
| --- | --- | --- |
| `name.topBar` | Ton profil | Your profile |
| `name.title` | Comment on t'appelle ? | What should we call you? |
| `name.colorLabel` | Ta couleur | Your color |
| `name.nameLabel` | Ton prénom | Your name |
| `name.helper` | C'est ce que tes amis verront dans la salle. | This is how friends see you in the room. |
| `name.note` | Pas de compte, pas d'e-mail. Juste un prénom pour ce soir. | No account, no email. Just a name for tonight. |
| `name.continue` | Continuer | Continue |
| `name.errors.invalid` | Mets au moins une lettre ou un chiffre. | Use at least one letter or number. |
| `name.errors.notAllowed` | Ce prénom ne passe pas. Choisis-en un autre. | That name isn't allowed. Pick another one. |
| `name.errors.offline` | Tu es hors ligne. Reconnecte-toi pour continuer. | You're offline. Connect to continue. |

Color names for the picker's labels, in `common` (the `ui/` component reads them): `colors.blue` Bleu / Blue, `colors.green` Vert / Green, `colors.gold` Or / Gold, `colors.red` Rouge / Red, `colors.violet` Violet / Violet, `colors.teal` Turquoise / Teal; `colors.selected` "{{color}}, choisie" / "{{color}}, selected".

## Motion, haptics, sound

- Picking a swatch: the ring scales in with `timing.toggle`; `haptics.press()` from `Pressable`.
- The initial in every swatch follows the typing at once, with no animation.
- Errors use the `Input` error state; no shake (a shake means "wrong digits" on the code screen).

## Accessibility

- Focus order: back, title (header), the color group, the name field, Continue.
- The swatches are a radio group labelled `onboarding:name.colorLabel`; each says its color name and "selected" (`common:colors.selected`).
- With a screen reader on, the field isn't focused on open, so the title is read first.
- Continue's disabled state has a hint: the helper text.
- Reduce Motion: the ring appears without scaling.

## New components

**`AvatarPicker` (`ui/avatar-picker`).** A row of `Avatar` M swatches, one per color in `colors`, each showing `initial` (empty when there's none). Props: `colors`, `value`, `onChange`, `initial`. Selected: a 2-point ring in the swatch's own avatar color, 2 points out from the disc (a `bg.canvas` gap), as in the Figma. Each swatch is a `Pressable` with a 44-point target. Gallery: none selected, one selected, an empty initial.

**`NameForm` (`shared/name-form`).** The color label and `AvatarPicker`, then the name `Input` with its helper or error. Controlled: `name`, `color`, `error`, `onChangeName`, `onChangeColor`, `autoFocus`. Holds no network logic; the screen saves. Used here and in the [join sheet](join-sheet.md), which is why it's shared.

## Differences from the Figma

- The note drops "You can save your history later from your profile": accounts and the profile wait for M15.
- The Figma's swatch ring is in the gold of the selected swatch; that's kept as "the swatch's own color" for every swatch.

## Questions

Harry accepted every default below on 30 October 2026.

1. **How many colors.** Onboarding says 6 (the Figma's blue, green, gold, red, violet, teal); `Avatar` has 10 and its Figma description says colors are "assigned in join order and never repeated in a room". The docs win, so a player picks their own. Default: these 6, and two players in one room may share a color (their initials and names tell them apart).
2. **The blocklist answer's name.** M4.3 hasn't named it. Default: `name_not_allowed`, added to `packages/contract` with the others.
3. **Editing from Home.** Nobody decided that the Home avatar opens this screen. Default: yes, with `?edit=1`, since the profile screen waits for M15.

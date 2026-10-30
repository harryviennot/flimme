# Invite page (web)

New, not in the Figma. The page an invite link opens in the browser when the app isn't installed (or in an in-app browser that doesn't hand links to apps). Built in M4.14. Written on 30 October 2026 from [app not installed](../../product/onboarding.md#app-not-installed), [invites and deep links](../../architecture/app-structure.md#invites-and-deep-links), [invite links and the web page](../../product/store-listing.md#invite-links-and-the-web-page), and the decision of 30 October 2026: **no browser version for guests**. An invited friend downloads the app; this page shows the room code in large type and the store buttons, and the player types the code after installing (or the link opens the app if it's installed).

## Purpose

Get the guest to install without losing the room. The code is the one thing they must leave with.

## Layout

One centred column, the phone layout (at most the width of a phone, centred on a laptop), on `bg.canvas`, with the generated theme's colors and fonts.

1. **Wordmark** (the [splash's](splash.md) logo, smaller) with `Spotlight tone="accent"` behind it.
2. **Title**, `display-l`: `web:invite.title`.
3. **The code** as a `RoomTicket` (code in `display-ticket`, left detail `join:link.ticketLeft`, right detail `join:link.ticketRight`).
4. **Steps**, `body-m`, numbered: `web:invite.steps.get`, `web:invite.steps.open`, `web:invite.steps.code` (with the code).
5. **Store badges:** the official App Store and Google Play badges, in each brand's artwork and wording (not our `Button`), the device's own store first. Each opens the store page.
6. **`Button` secondary L `web:invite.copy`:** copies the full link (code and room reference), so the app's Paste button on the [code screen](join-code.md) gets both. The label changes to `web:invite.copied` for 2 seconds.
7. **`Button` ghost L `web:invite.open`:** opens `flimme://join/<code>?r=<ref>`, for players who have the app but landed here from a messenger's in-app browser.
8. **Footer**, `body-s` tone `muted`: the privacy policy link, `web:credits.tmdb`, `web:credits.justwatch`.

Plus, in the page head: the Smart App Banner (`apple-itunes-app` with `app-argument` set to the link), `<html lang>` from the chosen language, a title and description that don't name the host.

## States

| State | What the page shows |
| --- | --- |
| A valid link | Everything above |
| A malformed link (no 6-digit code) | Title `web:invite.broken`, the store badges, no ticket and no Copy button |
| JavaScript off | The same page; Copy is hidden (it needs the clipboard API) |

The page calls no API: it can't tell an open room from an ended one, and it never shows who invited the guest. The app says it after the code is typed.

## Copy (`web` namespace)

Language: French when the browser's language is French, English otherwise.

| Key | French | English |
| --- | --- | --- |
| `invite.title` | On t'invite à choisir le film du soir | You're invited to pick tonight's movie |
| `invite.steps.get` | Installe Flimme. | Get Flimme. |
| `invite.steps.open` | Ouvre-la et touche « J'ai un code de salle ». | Open it and tap "I have a room code". |
| `invite.steps.code` | Tape {{code}}. Ou touche à nouveau ton lien d'invitation. | Type {{code}}. Or tap your invite link again. |
| `invite.copy` | Copier le code | Copy the code |
| `invite.copied` | Copié | Copied |
| `invite.open` | Déjà Flimme ? Ouvre l'app | Have Flimme? Open it |
| `invite.broken` | Ce lien d'invitation est incomplet. Demande le code à l'hôte. | This invite link looks broken. Ask the host for the code. |
| `credits.tmdb` | Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. | This product uses the TMDB API but is not endorsed or certified by TMDB. |
| `credits.justwatch` | Disponibilités fournies par JustWatch. | Streaming availability by JustWatch. |
| `privacy` | Confidentialité | Privacy policy |

The step quoting Welcome's button must match `onboarding:welcome.haveCode` exactly.

## Motion

None: a web page that loads and stays still.

## Accessibility

- One `h1` (the title); the steps are an ordered list.
- The code has a label read digit by digit ("4 8 2 9 1 3").
- Store badges are links with Apple's and Google's own alternative text ("Download on the App Store", "Get it on Google Play"; in French "Télécharger dans l'App Store", "Disponible sur Google Play").
- Colors from the tokens keep the app's contrast; the page zooms to 200% without horizontal scrolling.

## Questions

1. **How it's built.** M4.14 serves the verification files from the web export. Default: the page is a web-only version of the same route (`app/join/[code].web.tsx`), built from `Text`, `Button` and `RoomTicket` with the same translations, so nothing is styled twice. If the web export turns out heavy, a static page using the generated `theme.css` instead.
2. **Android's install referrer.** Onboarding lists it as a small upgrade (the store carries the room to the first launch). Default: later; the Copy button and "tap your link again" cover launch.
3. **Copying on a badge tap.** Copying the link without asking when a badge is tapped would make the iOS Paste button work by itself, but surprises people. Default: only the Copy button copies.
4. **The TMDB and JustWatch credits.** The page shows no film, but store-listing.md asks for the credits. Default: keep them in the footer; it costs one line.

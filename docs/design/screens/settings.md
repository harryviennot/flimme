# Settings

Screen 22 in the Figma (`99:4309` on First release, original `26:2113`), and screen 23's delete confirmation (`26:2202`, original page only) redrawn as a sheet. Route `/settings`, a stack screen over the tabs (no tab bar), opened from Play's settings button ([Play](home.md), `/play`); back returns to Play; the delete sheet is `/settings/delete`. Built in M8.7; M9.1 adds the detailed stats row. Written on 5 November 2026 from slice 14's plan (every question took its default while Harry was away, night of 4 November 2026: Q7.1 to Q7.7, Q1.1 to Q1.5), [players' rights](../../product/privacy.md#players-rights-in-practice), [consents](../../product/privacy.md#consents), [analytics consent](../../product/analytics.md#analytics-consent), [account deletion](../../architecture/security.md#account-deletion-and-data-export) and [TMDB's attribution](../../integrations/tmdb.md#terms-licence-and-attribution).

## Purpose

Everything a player may want once and never again, in one calm list: the language, haptics and sound, the analytics switch, their data (download or delete), the legal pages, support, and the credits TMDB and JustWatch require. Nothing here is a game moment, so nothing celebrates. Every row works for a guest: there is no account to sign into.

## Layout

`Screen` with `scroll` and `header`: `TopBar` with back (`common:actions.back`) and the title `settings:title`. The content is a column of sections with `gap-6`, `pb-8`.

A **section** (`screens/settings/settings-section.tsx`, single use): an optional label in `mono-eyebrow` tone `muted` (`px-1`, the token uppercases it), then the group, `overflow-hidden rounded-lg border border-border-default bg-bg-surface`, holding `ListRow`s (the lobby's lock row uses the same surface), then an optional helper in `body-s` tone `muted` (`px-1`). Label, group and helper are spaced `gap-2`.

| # | Section label | Rows (`ListRow`, top to bottom) | Helper |
| --- | --- | --- | --- |
| 1 | `sections.preferences` | **Language**: icon `globe`, `language.label`, value `language.current`, chevron. **Country** (M11.11): icon `film`, `country:row`, value the country's name (the `country:names` table in the app's language, because Hermes has no `Intl.DisplayNames`; a country that gets a catalog needs its name added there, `Intl` and then the code are the fallbacks), chevron. **Haptics**: icon `zap`, `haptics.label`, `trailing` a `Toggle`. **Sound**: icon `volume` (new, below), `sound.label`, `trailing` a `Toggle` | `preferences.helper` |
| 2 | `sections.privacy` | **Help improve the app**: icon `eye`, `analytics.label`, `trailing` a `Toggle`. **Detailed stats** (M9.1, strict regions only): icon `user`, `analytics.detailed`, `trailing` a `Toggle` | `analytics.helper`, then in strict regions (M9.1) `analytics.helperStrict` on its own line |
| 2, second group | none (a second group in the Privacy section, `mt-2` under the helper) | **Download my data**: icon `upload`, `export.label`, chevron. **Privacy policy**: icon `shield`, `legal.privacy`, chevron. **Terms of use**: icon `info`, `legal.terms`, chevron | none |
| 3 | `sections.help` | **Contact support**: icon `mail`, `support.label`, chevron | none |
| 4 | `sections.about` | The about card (below), not a `ListRow` | none |
| 5 | none | **Delete my data**: `ListRow` `tone="danger"` (new, below), icon `trash`, `delete.label`, no chevron | none |

**The about card** (`screens/settings/about-card.tsx`, single use), inside the section's group, `p-4`, `gap-3`:
1. A row, `gap-3.5`, `items-center`: `RatingLogo source="tmdb"` with `height={16}` (the approved file in `assets/logos/tmdb.png`, unmodified, never tinted), then `about.tmdb` in `body-s` tone `secondary`, `flex-1`.
2. `common:card.justwatch` in `body-s` tone `muted` (the existing key: one wording for the credit everywhere).
3. `about.version` in `mono-data` tone `muted`, from `expo-application` (`nativeApplicationVersion` and `nativeBuildVersion`).

Delete comes last, alone, after About: far from the switches, so a thumb scrolling the list never lands on it.

### Rows that hide

| Row | Hidden when |
| --- | --- |
| Detailed stats | Always in M8.7. From M9.1: hidden outside strict regions (the EEA, the UK, Switzerland, by Q1.1 and Q1.2); shown in them |
| Privacy policy, Terms of use | `legal_urls` in `app_config` is missing or malformed, or has no link for that page (M8.12's `LegalUrls` parser) |
| Contact support | `legal_urls.support_email` is missing or malformed |
| The Help section | Its only row is hidden |

The link is picked in the app's language (`fr` or `en`), falling back to the other language when one is missing.

## The rows

### Language

Tap: `Linking.openSettings()` (decision row 105), which opens Flimme's page in the phone's settings, where iOS (and Android 13 and later) let the player pick the app's language. Nothing else happens in the app; on return to the foreground the app already re-reads the language, and the value follows. `language.current` is the app's current language written in that language ("Français" in `fr`, "English" in `en`), so each locale file holds its own name.

### Country

Tap: pushes `/settings/country`, a full screen with a `TopBar` (`country:title`), the countries that have a catalog (`api.catalog_countries`) as `ListRow`s with the country's name, a check on the chosen one and `country:selected` as its hint, and the helper `country:helper` under the list. Choosing one saves it with `api.update_profile` and goes back; a different country changes the services and films the player sees in Host and Play alone. While the list loads: a `Skeleton` row. If it fails: `EmptyState` `country:empty.*` with Try again. A failed save: toast `country:errors.save` and the error haptic. Copy: `country:row` Pays / Country, `country:title` Pays / Country, `country:helper` "On te montre les plateformes et les films disponibles dans ce pays. Tu peux en changer quand tu veux." / "You'll see the services and films available in this country. You can change it any time."

### Haptics and sound

The existing switches in `features/settings/store.ts` (`hapticsEnabled`, `soundEnabled`), persisted on the phone only: no server call. They take effect at once through `bindSettings`. Turning haptics back on gives one `haptics.press()` after the value changes, so the player feels it is back (the press-in haptic was still off). Turning sound on plays nothing: the only sounds are the match and the reveal, which the helper says.

### Help improve the app, and detailed stats

The stored choice is `analyticsChoice` in the settings store: `on` (the default), `off` or `detailed` (M8.12's `public.analytics_choice`).

| Switch | Shows on when | Turning it on | Turning it off |
| --- | --- | --- | --- |
| Help improve the app | the choice is `on` or `detailed` | `on` | `off` (a `detailed` choice goes too) |
| Detailed stats (M9.1) | the choice is `detailed` | `detailed` | `on` |

While the choice is `off`, the detailed stats switch is shown but `disabled` (off, `opacity-disabled`), so the player sees what it depends on. In a region that isn't strict the row is hidden and a stored `detailed` reads as `on` (M9.1 rule 4).

Each change is saved in the store first, so the switch never waits on the network, then sent with `api.setAnalyticsChoice({ choice, version })`, where `version` is the wording constant kept beside the copy (`2026-11-analytics-1`; bumped whenever `analytics.*` copy changes).

| Answer (`api.set_analytics_choice`) | What the player sees |
| --- | --- |
| `ok` | Nothing more: the switch already moved |
| `rate_limited` (20 an hour) | Nothing: the choice on the phone stands, and the latest value is sent on the next launch |
| `invalid` (the version is wrong: a bug) | Nothing; it goes to Sentry with the answer only |
| Offline, or the call failed | Nothing; sent again on the next launch (Q7.7) |

Quick taps send the latest value only: a change made while a call is in flight is sent when that call answers. Turning analytics off works immediately on the phone whatever the server says (from M9.1: `optOut` and `reset`).

### Download my data

Tap calls `api.exportMyData()` (M8.6).

| State or answer | What the player sees |
| --- | --- |
| In progress | The row's chevron becomes a spinner (`ListRow` `loading`, new); the row is disabled, so a double tap sends one request, and a screen reader hears `export.preparing`. Every other row still works |
| `ok` | The data, without the `status` field and pretty-printed, is written to `flimme-data-<YYYY-MM-DD>.json` (local date) in the cache folder, and the share sheet opens (`expo-sharing`, Android dialog title `export.shareTitle`). The row returns to normal when the sheet opens. No toast: the sheet is the feedback. The file is deleted when the sheet closes, shared or not |
| `rate_limited` (one an hour) | `showToast` info, title `export.rateLimited.title`, message `export.rateLimited.message`; `haptics.error()` |
| Offline (`useOnline()` false at tap) | `showToast` warn `errors.offline`; nothing is sent |
| The call failed online, an unexpected answer, or the file or the share sheet failed | `showToast` warn, title `export.failed.title`, message `export.failed.message`. The row is back to normal: tapping it again is the retry. An unexpected answer goes to Sentry with the answer's status only, never the data |

A failure after `ok` (the file or the sheet) used up the hour's export on the server, so the retry within the hour gets `rate_limited`: its message is still true.

### Privacy policy and terms of use

Tap opens the link in the in-app browser (`expo-web-browser`). Offline, the browser shows its own page; the app adds nothing. Until M8.3 publishes the pages, the links may 404 (Q7.1).

### Contact support

Tap opens a mail to `legal_urls.support_email` (`mailto:`, Q7.6) with the subject `support.subject` and a body that ends with two blank lines and `about.version` plus the platform and its version ("iOS 18.1"), so support knows the build. No id of any kind goes in the mail. With no mail app (`Linking.canOpenURL` false, or the open fails), the address is copied (`expo-clipboard`) and `showToast` info shows `support.copied.title` with `support.copied.message`.

### Delete my data

Tap opens the delete sheet (below). The row is disabled while a deletion runs.

## The delete sheet

Route `/settings/delete`, a `formSheet` with the grabber and `sheetAllowedDetents: 'fitToContents'`, declared in the root stack (so `app/settings.tsx` becomes `app/settings/index.tsx` beside `app/settings/delete.tsx`). Single-use piece `screens/settings/delete-sheet.tsx`. Screen 23's layout, without the typed word (Q7.3):

1. A `ScrollView` (for the largest text), `p-5`, `gap-4`, `items-center`:
   1. A disc, `size-16 rounded-pill bg-nope-soft`, with `Icon` `alert`, size 28, color `nope-text` (as `EmptyState` draws its error icon, on the red disc the Figma shows).
   2. `delete.title` in `display-m`, centred, `accessibilityRole="header"`.
   3. `delete.body` in `body-m` tone `secondary`, centred.
   4. The status line, when there is one (below), in `body-s`, centred.
2. Pinned under the scroll, `px-5 pb-5 gap-3`: `Button` danger L, `block`, icon `trash`, `delete.confirm`; then `Button` secondary L, `block`, `common:actions.cancel`, which closes the sheet.

The two buttons are the whole confirmation: one destructive tap, one way out. No typed word, no second alert.

Confirm calls `POST ${serverUrl}/v1/account/delete` with the session's access token (M8.5).

| State or answer | What the player sees |
| --- | --- |
| Deleting | Confirm shows `loading` (one request, whatever the taps), Cancel is disabled, and the sheet can't be swiped away (`gestureEnabled: false` until the answer), so the result always lands somewhere |
| `ok` | From M9.1, analytics `forget()` first. Then the wipe (Q7.3): sign out; clear the session, the vote queue, cached cards and every persisted store (`settings`, `room`, `match-shown`, `hints`, `vote-queue`, the profile cache, the query cache); then `router.replace('/')`. The splash signs in a new guest and lands on [welcome](welcome.md), where `showToast` info shows `delete.done`. No sound, no celebration |
| `unauthorized` | The session is refreshed once and the call sent again, still `loading`. A second `unauthorized` shows the `try_again` line |
| `try_again`, or the call failed online (a timeout, a dropped connection) | Status line `delete.errors.tryAgain` in tone `nope`; Confirm is enabled again and is the retry. Nothing is wiped. Deletion is idempotent, so a retry after a lost answer is safe |
| Offline | Status line `delete.errors.offline` in tone `muted`, and Confirm disabled until the phone is back online, as the [report sheet](report-sheet.md#answers) does. Nothing is sent, nothing is wiped. Going offline while deleting falls into the row above |

The status lines are in the sheet, not toasts: the `ToastHost` sits under a native sheet and would not be seen.

## States of the screen

| State | What the player sees |
| --- | --- |
| Loaded | Everything comes from the phone (the store, the app version) or the query cache (`app_config`, read at the splash), so the screen draws at once |
| `app_config` not read yet (rare: a first launch offline) | Privacy policy, Terms of use and Contact support each show a `Skeleton` line (`h-4 w-32 rounded-sm`) in place of the label; they become rows, or hide, when the read answers |
| `app_config` failed or malformed | Those rows are hidden ([rows that hide](#rows-that-hide)). No error state: every other row works |
| Offline | `Banner` warn `offline` above the first section. The switches still work (they save on the phone); Download shows its offline toast; the delete sheet shows its offline line |
| The export in progress | [Download my data](#download-my-data): the row's spinner, nothing else blocked |
| A deletion in progress | The sheet is locked (above); the Delete row is disabled until it answers |
| The largest text size | `ListRow` grows (`min-h-14`, new) and its label wraps to two lines instead of truncating; values and toggles stay on the right, centred on the label. "Télécharger mes données" and "Aider à améliorer l'appli" take two lines at the largest size. The about card's notice wraps beside the logo. In the delete sheet the text scrolls and the two buttons stay pinned |
| A 375 by 667 screen | The list scrolls; at the default size About and Delete are below the fold, which is fine (they are rare). The delete sheet fits (about 430 points); at the largest text its text scrolls above the pinned buttons |
| A room capped under 13 | No row changes. Settings is reached from Home, never from a room route, so the kids' rule (no analytics from a capped room's routes, Q1.3) never applies on this screen; the switches mean the same thing everywhere |
| Region changes (M9.1, on return to the foreground) | The detailed stats row appears or hides with `layout.fadeIn` and `layout.fadeOut`; the stored choice doesn't change |

## What never shows

- No id of any kind: no profile id, install id, analytics id, user id or build hash beyond the version and build number.
- No export content on screen, in a toast, in Sentry or in logs. The file goes only where the player shares it.
- No email field and no email of the player: guests have none. The only address shown is support's, after a copy.
- No account rows: no sign in, save account, profile, My services or Connect Letterboxd (M15, M20). No training or "Show my Letterboxd ratings" switch until those features exist. No feedback link (M14.5).
- No typed confirmation, no "Are you sure?" alert on top of the sheet, no guilt ("you'll lose everything!"), no countdown.
- No consent banner or pop-up for analytics: the switch is the choice ([analytics consent](../../product/analytics.md#analytics-consent), Q1.5).
- No store, payment or upgrade row.
- Nothing that says who voted or noped anything (there is no game data on this screen).

## Copy (`settings` namespace, new)

| Key | French | English |
| --- | --- | --- |
| `title` | Réglages | Settings |
| `sections.preferences` | Préférences | Preferences |
| `sections.privacy` | Confidentialité | Privacy |
| `sections.help` | Aide | Help |
| `sections.about` | À propos | About |
| `language.label` | Langue | Language |
| `language.current` | Français | English |
| `haptics.label` | Vibrations | Vibration |
| `sound.label` | Sons | Sound |
| `preferences.helper` | Les sons ne jouent qu'au match et à la révélation du film. | Sounds only play at the match and when the film is revealed. |
| `analytics.label` | Aider à améliorer l'appli | Help improve the app |
| `analytics.helper` | Des stats sur les écrans que tu ouvres, pour voir ce qui coince. Jamais tes swipes ni tes films. | Stats on the screens you open, so we can see what gets in the way. Never your swipes or your films. |
| `analytics.detailed` | Stats détaillées | Detailed stats |
| `analytics.helperStrict` | Elles sont anonymes. Les stats détaillées les relient à ton profil. | They're anonymous. Detailed stats link them to your profile. |
| `export.label` | Télécharger mes données | Download my data |
| `export.preparing` | Préparation de tes données | Preparing your data |
| `export.shareTitle` | Tes données Flimme | Your Flimme data |
| `export.rateLimited.title` | Un téléchargement par heure | One download an hour |
| `export.rateLimited.message` | Tu viens de télécharger tes données. Réessaie un peu plus tard. | You just downloaded your data. Try again a little later. |
| `export.failed.title` | Téléchargement impossible | Download failed |
| `export.failed.message` | Réessaie dans un instant. | Try again in a moment. |
| `legal.privacy` | Politique de confidentialité | Privacy policy |
| `legal.terms` | Conditions d'utilisation | Terms of use |
| `support.label` | Contacter le support | Contact support |
| `support.subject` | Support Flimme | Flimme support |
| `support.copied.title` | Adresse copiée | Address copied |
| `support.copied.message` | Écris-nous à {{email}}. | Write to us at {{email}}. |
| `about.tmdb` | Cette application utilise TMDB et les API de TMDB, mais n'est ni approuvée, ni certifiée, ni validée d'aucune autre manière par TMDB. | This app uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB. |
| `about.version` | Version {{version}} ({{build}}) | Version {{version}} ({{build}}) |
| `delete.label` | Supprimer mes données | Delete my data |
| `delete.title` | Supprimer tes données ? | Delete your data? |
| `delete.body` | Ton prénom, tes plateformes et ton historique de soirées seront effacés. Tes votes passés restent dans leurs salles, sans ton prénom. Tu repars de zéro, comme à la première ouverture. C'est définitif. | Your name, your services and your movie night history are erased. Past votes stay in their rooms, without your name. You start fresh, like the first time you opened the app. This can't be undone. |
| `delete.confirm` | Tout supprimer | Delete everything |
| `delete.done` | Tes données sont supprimées | Your data is deleted |
| `delete.errors.tryAgain` | Impossible de supprimer tes données pour l'instant. Rien n'a changé, réessaie. | We couldn't delete your data just now. Nothing changed, so try again. |
| `delete.errors.offline` | Tu es hors ligne. Rien n'a été supprimé. | You're offline. Nothing was deleted. |
| `offline` | Tu es hors ligne. Le téléchargement et la suppression de tes données attendent ton retour. | You're offline. Downloading or deleting your data waits until you're back. |
| `errors.offline` | Tu es hors ligne. Reconnecte-toi pour télécharger tes données. | You're offline. Connect to download your data. |
| `a11y.languageHint` | Ouvre les réglages du téléphone | Opens your phone's settings |
| `a11y.opensBrowser` | S'ouvre dans le navigateur | Opens in the browser |
| `a11y.opensMail` | Ouvre ton appli mail | Opens your mail app |
| `a11y.deleteHint` | Demande une confirmation | Asks you to confirm first |
| `a11y.tmdb` | Logo TMDB. {{notice}} | TMDB logo. {{notice}} |

Reused: `common:actions.back`, `common:actions.cancel`, `common:card.justwatch`. The namespace is new (`resources.ts`, `i18next.d.ts`). `about.tmdb` keeps TMDB's English notice word for word (tmdb.md); the French is a faithful translation, to confirm in the lawyer's review. `delete.confirm` is the longest button label ("TOUT SUPPRIMER", 14 capitals) and fits `label-button-l` at 375 points.

## Motion, haptics, sound

- No entrance animation: Settings must feel instant.
- Switches: the `Toggle`'s own `timing.toggle` and `haptics.press()` (from `Pressable`), plus one `haptics.press()` when haptics come back on.
- Row presses: `active:bg-bg-raised` and `haptics.press()`. The download spinner replaces the chevron with no transition.
- The delete sheet: the system sheet motion. Status lines come in with `layout.fadeIn`.
- `haptics.error()` only on the export's `rate_limited`. No haptic on a successful deletion, no `haptics.match()` anywhere, no sound (sound is for the match and the reveal only).
- Reduce Motion: nothing to change; the toggles' knob jump is handled by Reanimated, and the fades become instant.

## Accessibility

- Order: back, the title (header), then each section top to bottom: its label (header), its rows, its helper. In full: Preferences, Language (read as `Language, Français` with `a11y.languageHint`), Haptics switch, Sound switch, the preferences helper; Privacy, Help improve the app switch, Detailed stats switch (M9.1), the analytics helper(s), Download my data, Privacy policy (`a11y.opensBrowser`), Terms of use (`a11y.opensBrowser`); Help, Contact support (`a11y.opensMail`); About, the TMDB logo and notice as one element (`a11y.tmdb`), the JustWatch credit, the version; Delete my data (`a11y.deleteHint`).
- Switch rows read once: the `Toggle` carries the label (`accessibilityRole="switch"`, `checked`), and the row's own label is hidden from screen readers (`ListRow` change, below). A disabled detailed stats switch reads as dimmed.
- Download in progress: the row has `accessibilityState={{ busy: true }}` and is labelled `export.preparing`.
- The delete sheet: focus goes to the title. Order: title, body, status line (announced when it appears), Delete everything, Cancel. While deleting, Confirm reads as busy.
- After a deletion, focus starts on the welcome screen as on a first launch; the `delete.done` toast is announced.
- Every target is at least 44 points (`ListRow` is 56).

## Privacy

- The only calls that carry anything about the player are the export (to the player's own phone) and the deletion (the token alone names whom to delete). The analytics choice sends the choice and the wording version.
- No PostHog event for anything on this screen in the first release (M9.2's list has none). From M9.1 the screen view is the route pattern `/settings`, like any screen.
- Sentry gets answers' statuses only, never the export, the support address or a token.

## Design-system changes

- **`ListRow`** (ui) gains, with its gallery entry showing each:
  - `tone="danger"`: icon `nope-text`, label tone `nope`, and no chevron.
  - `loading`: a small `ActivityIndicator` in `text-muted` in place of the value and chevron, `accessibilityState={{ busy: true }}`, presses ignored.
  - `disabled`: `opacity-disabled`, presses ignored.
  - Text scaling: `min-h-14` with `py-3` instead of `h-14`, and the label wraps to two lines (`numberOfLines={2}`) instead of one. At the default size nothing moves.
  - When `trailing` is set, the label is hidden from screen readers (`importantForAccessibility="no-hide-descendants"` and `accessibilityElementsHidden` on the label), so a `Toggle` row reads once. The lobby's lock row gets this for free.
- **An icon, `volume`** (a speaker with two waves, Lucide's `volume-2`), in `mobile/assets/icons/` and the `Icon` names, drawn like the set (24 points, 2-point stroke), for the Sound row: nothing in the set reads as sound. Then `mise run tokens`.
- No new token. Every color, size and duration above exists (`bg-nope-soft`, `nope-text`, `opacity-disabled`, `timing.toggle`, `layout.fadeIn`).

## Differences from the Figma

- "Share usage stats" becomes "Help improve the app", the wording privacy.md fixes. Haptics, Sound, Contact support and the detailed stats row are new.
- The TMDB box is the real logo, and its notice is TMDB's exact one (the Figma shortens it). The credits section is "About" and holds the version, so Delete comes last.
- The delete confirmation drops the typed "DELETE" (Q7.3), says "data" rather than "account" (guests have no account) and doesn't mention Letterboxd (M20). Its title stays `display-m`; the buttons are the Figma's (danger with `trash`, then secondary Cancel).
- No My services row (the Figma's screen 23 background): services are picked per room.

## Questions

Every question below took its default while Harry was away (night of 4 November 2026); he can reverse any of them.

1. **Order of the list.** Delete last and alone, after About, and the version inside About. Default taken while Harry was away.
2. **The detailed stats switch while analytics are off.** Shown disabled, not hidden. Default taken while Harry was away.
3. **A toast after deleting.** `delete.done` on the welcome screen, so the player knows it worked. Default taken while Harry was away.
4. **A new `volume` icon** for the Sound row. Default taken while Harry was away.
5. **The support mail** carries the app version and the platform, no id. Default taken while Harry was away.
6. **Labels.** "Vibrations" and "Vibration" for haptics; "Supprimer mes données" for the delete row; the French TMDB notice above, for the lawyer. Default taken while Harry was away.

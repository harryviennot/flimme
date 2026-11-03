# Report sheet

The Figma's N5 Report (`110:2119`, a draft). Route `/room/[id]/report/[memberId]`, a `formSheet` with the grabber and `sheetAllowedDetents: 'fitToContents'`, opened from the [seat sheet](host-menu.md#the-seat-sheet)'s Report. Built in M7.2 on `api.report_member` (M7.1). Written on 3 November 2026 from slice 8's plan (Harry accepted every default that day: Q1.2 to Q1.5, Q7.1), [passing review](../../product/store-listing.md#passing-review) and the privacy-and-kids skill.

## Purpose

Any player can flag another in three taps, from a fixed list, without anyone in the room knowing. The store asks for it (Apple 1.2: a way to report people); the room needs it to feel safe with friends of friends.

## Layout

`p-5`, `gap-4`:

1. `IconButton` plain `x` at the top right (`common:actions.close`).
2. **Title**, `display-s`, `report:title` (naming the player; it may wrap to two lines).
3. **Helper**, `body-s` tone `secondary`: `report:helper`. It says the truth: only the Flimme team sees it, and nobody in the room is told.
4. **Three `OptionCard`s**, `gap-3`, one per reason in `REPORT_REASONS` order, none selected at first:

| Reason | Icon | Title | Description |
| --- | --- | --- | --- |
| `offensive_name` | `alert` | `report:reasons.offensiveName.title` | `report:reasons.offensiveName.description` |
| `spam` | `zap` | `report:reasons.spam.title` | `report:reasons.spam.description` |
| `other` | `info` | `report:reasons.other.title` | `report:reasons.other.description` |

5. **`Button` primary L, `block`, `report:send`**, disabled until a reason is picked. Picking a reason and sending is the confirm: no alert after it.

No free text anywhere (store-listing.md: "no free text"). A Jest test walks `REPORT_REASONS` and fails if one has no row here.

## Answers

Send calls `api.reportMember({ room_id, member_id, reason })`. Send shows `loading`; the cards are disabled meanwhile.

| Answer (`api.report_member`) | What the player sees |
| --- | --- |
| `ok` (new, or a repeat: the server keeps one per pair and still says `ok`) | The thank-you state (below) |
| `rate_limited` | The cards and Send stay; under Send a `body-s` tone `nope` line `report:errors.rateLimited`; `haptics.error()` |
| `not_in_room` (this phone's seat was removed meanwhile, or the seat isn't in this room) | The sheet closes. If this phone was removed, the [removed side](host-menu.md#the-removed-players-side) takes over |
| Offline | `showToast` warn `report:errors.offline`; the sheet stays with the reason picked, Send works again |
| The call failed (online) | `showToast` warn `report:errors.generic`; the sheet stays, Send works again |

A `22023` (reporting yourself) is a bug: the own row has no sheet. It goes to Sentry and shows as the failed row.

## The thank-you state

The sheet's content gives way to an `EmptyState`, icon `check`, title `report:thanks.title`, body `report:thanks.body`, action `report:thanks.done` (closes the sheet). For the host, the body is `report:thanks.bodyHost`, which points at Remove without pressing it. Same state for a repeat report: nobody learns it was a repeat.

What happens next is nothing anyone can see: no hiding, no automatic removal, no message to the reported player, to the host or to anyone else (Q1.5). The report waits for Harry (M9.5).

## While the sheet is open

| Change | The sheet |
| --- | --- |
| The reported seat leaves or is removed | Stays: a seat that left can still be reported (Q1.3) |
| The game starts | Stays over the swipe screen (the room layout's rule); sending still works in any state |
| This phone is removed | Closes; the removed side takes over |

## Copy (`report` namespace, new)

| Key | French | English |
| --- | --- | --- |
| `title` | Signaler {{name}} | Report {{name}} |
| `helper` | Seule l'équipe Flimme le verra. Personne dans la salle n'est prévenu. | Only the Flimme team sees this. Nobody in the room is told. |
| `reasons.offensiveName.title` | Prénom choquant | Offensive name |
| `reasons.offensiveName.description` | Insultes, propos haineux ou déplacés | Insults, hate or anything out of line |
| `reasons.spam.title` | Spam ou sabotage | Spam or trolling |
| `reasons.spam.description` | Gâche la partie exprès | Ruining the game on purpose |
| `reasons.other.title` | Autre chose | Something else |
| `reasons.other.description` | Un autre problème avec ce joueur | Another problem with this player |
| `send` | Envoyer le signalement | Send report |
| `thanks.title` | Merci | Thanks |
| `thanks.body` | On va regarder. Rien ne change dans la salle. | We'll take a look. Nothing changes in the room. |
| `thanks.bodyHost` | On va regarder. En attendant, tu peux aussi retirer {{name}} de la salle. | We'll take a look. Meanwhile, you can also remove {{name}} from the room. |
| `thanks.done` | OK | Done |
| `errors.rateLimited` | Beaucoup de signalements d'un coup. Réessaie plus tard. | That's a lot of reports at once. Try again later. |
| `errors.offline` | Tu es hors ligne. Ton signalement n'est pas parti. | You're offline. Your report wasn't sent. |
| `errors.generic` | Impossible d'envoyer le signalement. Réessaie. | We couldn't send your report. Try again. |
| `a11y.reason` | Motif : {{title}} | Reason: {{title}} |

The namespace is new (`resources.ts`, `i18next.d.ts`), so a report can later open from other screens without moving keys.

## Motion, haptics, sound

- System sheet motion. Selecting a card: the `OptionCard`'s own change with `timing.toggle` and `haptics.press()`.
- The thank-you state comes in with `layout.fadeIn`. No celebration, no sound: a report is not a shared moment.
- `haptics.error()` only on `rate_limited`.

## Accessibility

- Focus goes to the title. Order: title, helper, the three reasons (radio buttons: `accessibilityRole` `radio`, `accessibilityState` `checked`, labelled `report:a11y.reason` with the description as hint), Send, close.
- The `rate_limited` line is announced when it appears.
- The thank-you state takes focus on its title (`EmptyState` `autoFocus`).
- Reduce Motion: the thank-you state simply replaces the form.

## Privacy

- The reason and the names never go to logs, Sentry or PostHog: ids only. No PostHog event for reports.
- Nothing is broadcast; no other phone can tell a report happened.
- The sheet never says the reported player will know anything.

## Differences from the Figma

- The helper: the draft's "Jo won't know who reported them" suggests Jo is told something; nobody is (Q1.5).
- The second reason: the draft's "Impersonating someone" becomes `spam` (Q1.2's list). An impostor name falls under "Something else".
- The thank-you state and the answers are new; the draft has the form only.
- A close button for screen readers.

## Questions

Harry accepted every default on 3 November 2026 (slice 8): the three reasons with no free text (Q1.2), Report on every other row in the lobby (Q7.1), one report per pair, 10 an hour (Q1.4), nothing automatic and nobody told (Q1.5). The reason labels above are this spec's; French terms follow the glossary.

---
name: copy
description: Voice, tone and rules for every word players see, in French and English (buttons, hints, errors, empty states, toasts, notifications, store text), plus the glossary. Use before writing or changing any user-facing string or translation key.
---

# Copy

French is the primary language (France launches first); English sits next to it. Neither is a literal translation of the other: each should sound like a person from there wrote it.

## Voice

- **A friend running movie night**, not a brand. Warm, quick, a little playful. The cinema theme (marquee, tickets, the projector) is a seasoning, not every line.
- **Short.** Buttons are 1 to 3 words. Hints fit on one line under the card. Errors say what happened and what to do, in two short sentences at most.
- **Second person**, informal: *tu* in French (a game among friends). Plural *vous* only when addressing the whole room ("Vous avez un match").
- **Celebrate the shared moments** (the match, the winner), keep everything else calm.
- **Never guilt, nag or pressure.** No streaks, no "you'll lose", no fake urgency. Families and kids use this app.

## Rules

- Display-font labels (Staatliches, uppercase) stay short: check the longest language (French usually runs 15 to 30% longer) fits the button at 375 points wide.
- No exclamation mark on anything but celebrations.
- Numbers and times through `Intl` (`3 min 42 s`, `1 h 43`), never hand-formatted.
- Never "for kids" (store and app: store-listing.md#age-ratings).
- Never reveal who noped, who vetoed or what someone voted. Counts only: "2 of 3 of you liked this".
- Errors for status answers are specific: `full` is "This room is full (10 players)", not "Something went wrong".
- No em dashes or en dashes; commas, colons or parentheses instead.

## Keys

- One JSON file per feature in `mobile/src/i18n/locales/fr/` and `en/`, the same keys in both (CI checks).
- Keys describe the meaning, not the text: `join.errors.full`, not `roomIsFull`.
- Plurals: `_one` and `_other` (French treats 0 and 1 as singular; i18next handles it).
- Write the French first, then the English, and read both aloud.

## Glossary

The words players see, used the same way everywhere. French terms marked "proposed" need Harry's yes the first time they ship; then mark them decided.

| Concept | English | French |
| --- | --- | --- |
| The group session | movie night | soirée film (proposed) |
| The virtual space | room | salle (proposed) |
| The six digits | room code | code de la salle (proposed) |
| The person who opens it | host | hôte (proposed) |
| Everyone else | guests, players | invités, joueurs (proposed) |
| Answers | Like, Nope, Super like, Seen it | J'aime, Bof, Coup de cœur, Déjà vu (proposed) |
| Rewatch question | Watch it again tonight? | On le revoit ce soir ? (proposed) |
| Everyone agreed | It's a match | C'est un match (proposed) |
| Almost agreed | 2 of 3 of you liked this | 2 sur 3 ont aimé (proposed) |
| The quick mode | Quick Match | Partie rapide (decided on 30 October 2026) |
| The final vote | the Final Cut; "Pick one. Veto one." | le Final Cut; « Choisis-en un. Élimine-en un. » (proposed) |
| The result | tonight's pick | le film du soir (proposed) |
| The share image | recap card | récap (proposed) |
| Streaming services | services | plateformes (proposed) |
| Time budget | time budget, "Under 2 h" | durée, « Moins de 2 h » (proposed) |

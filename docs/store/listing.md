# Store listing copy

Every text value of Flimme's two store listings, in French and English, ready to paste into App Store Connect and Google Play Console. Written on 6 November 2026 for roadmap task M11.1. The rules behind the copy are in [store-listing.md](../product/store-listing.md#the-listing-in-english-and-french); the credits come from [tmdb.md](../integrations/tmdb.md#terms-licence-and-attribution); what the first release holds is in the [roadmap](../product/roadmap.md#the-first-release-whats-in-what-waits). Decisions are in [decisions.md](../decisions.md).

`node tools/store-copy.mjs` checks every value below against the stores' limits and rules, and CI runs its tests on every pull request. Run it after any change here.

## How to use this file

- **Each grey block is one value.** Copy it with GitHub's copy button: the block holds exactly what goes in the field, nothing more.
- **App Store Connect** has three localizations: French (France), the primary language, then English (U.S.) and English (U.K.). Add the two English ones from the language menu at the top right of the App Information page. Name and Subtitle are on **App Information**; Promotional Text, Description and Keywords are on the **version page** (1.0 Prepare for Submission). Pick each language in the menu, then paste its blocks.
- **Why English (U.K.):** it is the second language of France's storefront and the default language of Belgium's ([App Store localizations](https://developer.apple.com/help/app-store-connect/reference/app-store-localizations), checked on 5 November 2026). Apple's English is one text: only the keywords differ, with "movie" words for the U.S. and "film" words for the U.K.
- **Google Play Console** has two languages: French (France), the default, and English (United States). Name, short description and full description are on the main store listing; tags are in Store settings, under App category.
- **Left out on purpose:** anything the first release doesn't have (Letterboxd, a deck that learns your taste, accounts, notifications, moods, other modes, "no swipe limit", since solo stops at 100 cards a day) and any streaming service's name (Q1.4).

## The rules the checker applies

| Rule | Where it comes from |
| --- | --- |
| Name 30 characters, subtitle 30 | [Apple, App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information) |
| Promotional text 170, description 4,000, keywords 100 bytes, each keyword more than two characters | [Apple, Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information) |
| Keywords separated by commas with no spaces; no word twice, no plural of a word already there, no category name, not the word "app", not the app's own name, no other app or company | [Apple, Creating your product page](https://developer.apple.com/app-store/product-page/); the platform version reference |
| No price or ranking words in the name or subtitle ("free", "best", "#1"), no unverifiable claims | [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) 2.3.7 |
| No "For Kids" or "For Children" ("pour enfants" in French) | Guidelines 2.3.8 |
| No other mobile platform: no Android or Google Play on Apple, no iPhone, iOS or App Store on Google | Guidelines 2.3.10, and the reverse for Google |
| App name 30 characters, short description 80, full description 4,000 | [Play Console, Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152) |
| No emoji, price, promotion or ranking words ("free", "#1", "new") in the app name; no repeated keywords; no anonymous testimonials | [Play's metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842) |
| Up to 5 tags, chosen in the console's list | [Play Console, Choose a category and tags](https://support.google.com/googleplay/android-developer/answer/9859673) |
| The TMDB notice and the JustWatch credit in every full description, word for word as the app shows them | [tmdb.md](../integrations/tmdb.md#terms-licence-and-attribution) |
| No em or en dash; no exclamation mark (the app keeps them for celebrations) | CLAUDE.md, the copy skill |

Every page above was checked on 5 November 2026. The limits match store-listing.md; Apple's "more than two characters" per keyword is new.

## App Store Connect: App Information

### Name · fr-FR (30)

```text
Flimme
```

### Subtitle · fr-FR (30)

```text
Le film du soir, entre amis
```

### Name · en-US (30)

```text
Flimme
```

### Subtitle · en-US (30)

```text
Pick tonight's movie together
```

### Name · en-GB (30)

```text
Flimme
```

### Subtitle · en-GB (30)

```text
Pick tonight's movie together
```

## App Store Connect: version page

### Promotional Text · fr-FR (170)

Editable at any time, without a new version.

```text
Fini les soirées à chercher quoi regarder. Chacun swipe sur son téléphone, et Flimme trouve le film qui plaît à toute la salle.
```

### Description · fr-FR (4,000)

```text
Choisir un film ne devrait pas prendre une heure. Avec Flimme, chacun swipe sur son téléphone, et le film qui plaît à toute la salle sort du lot.

COMMENT ÇA MARCHE
1. Ouvre une salle (jusqu'à 10 personnes) et partage le code, le lien ou le QR code.
2. Chacun swipe : J'aime, Bof, Coup de cœur ou Déjà vu.
3. Quand toute la salle aime un film (presque toute, dans un grand groupe), c'est un match.
4. Au moment de choisir, un vote final de 60 secondes tranche. De 2 à 4 joueurs, c'est le Final Cut : choisis-en un, élimine-en un.

POURQUOI ÇA MARCHE
- Seulement des films à voir ce soir, sur les plateformes de la salle.
- Indique l'âge du plus jeune devant l'écran : les films au-dessus de son âge restent hors du jeu. Ajoute une durée, comme « Moins de 2 h ».
- Déjà vu ? Glisse vers le haut, et on te demande si tu le reverrais ce soir.
- « 2 sur 3 ont aimé » te dit qu'un film est à un j'aime du match. Personne ne voit jamais qui a dit Bof.
- Le film du soir s'affiche avec où le regarder, et un récap à partager, sans aucun prénom dessus.
- Tout seul ce soir ? Jouer seul te laisse swiper à ton rythme, puis choisir ton film du soir parmi tes j'aime.
- Mes films garde sur ce téléphone les films que tu as aimés et ceux que tu as déjà vus.
- Pas de compte, pas d'e-mail : juste un prénom et une couleur.

Gratuit. Le catalogue couvre les films et les plateformes disponibles en France.

Cette application utilise TMDB et les API de TMDB, mais n'est ni approuvée, ni certifiée, ni validée d'aucune autre manière par TMDB.
Disponibilités fournies par JustWatch.
```

### Keywords · fr-FR (100 bytes)

Words already in the name and subtitle (film, soir, amis) are searched without repeating them here.

```text
choisir,regarder,quoi,quel,soirée,cinéma,famille,couple,groupe,swipe,idée,ensemble,décider,jeu
```

### Promotional Text · en-US (170)

```text
No more evenings lost to scrolling. Everyone swipes on their own phone, and Flimme finds the film the whole room wants to see.
```

### Description · en-US (4,000)

```text
Movie night shouldn't take an hour. With Flimme, everyone swipes on their own phone, and the film the whole room likes comes out on top.

HOW IT WORKS
1. Open a room (up to 10 people) and share the code, the link or the QR code.
2. Everyone swipes: Like, Nope, Super like or Seen it.
3. When the whole room likes a film (most of the room, in a big group), it's a match.
4. Time to choose: a final vote of 60 seconds settles it. With 2 to 4 of you, it's the Final Cut: pick one, veto one.

WHY IT WORKS
- Only films you can watch tonight, on the services in the room.
- Set the youngest viewer's age, and films above it stay out. Add a time budget, like "Under 2 h".
- Seen it? Swipe up, and we'll ask if you'd watch it again tonight.
- "2 of 3 of you liked this" tells you a film is one like away from a match. Nobody ever sees who said Nope.
- Tonight's pick comes with where to watch it, and a recap card to share, with no names on it.
- On your own tonight? Play alone: swipe at your own pace, then pick one of your likes for tonight.
- My films keeps the films you liked and the ones you've seen, on this phone.
- No account, no email: just a name and a color.

Free. The catalog covers the films and services available in France.

This app uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.
Streaming availability by JustWatch.
```

### Keywords · en-US (100 bytes)

"Movie" words for the U.S.; "movie", "tonight's", "pick" and "together" are already in the subtitle.

```text
what,watch,decide,friends,family,group,couple,night,swipe,match,picker,streaming,choose,ideas
```

### Promotional Text · en-GB (170)

```text
No more evenings lost to scrolling. Everyone swipes on their own phone, and Flimme finds the film the whole room wants to see.
```

### Description · en-GB (4,000)

```text
Movie night shouldn't take an hour. With Flimme, everyone swipes on their own phone, and the film the whole room likes comes out on top.

HOW IT WORKS
1. Open a room (up to 10 people) and share the code, the link or the QR code.
2. Everyone swipes: Like, Nope, Super like or Seen it.
3. When the whole room likes a film (most of the room, in a big group), it's a match.
4. Time to choose: a final vote of 60 seconds settles it. With 2 to 4 of you, it's the Final Cut: pick one, veto one.

WHY IT WORKS
- Only films you can watch tonight, on the services in the room.
- Set the youngest viewer's age, and films above it stay out. Add a time budget, like "Under 2 h".
- Seen it? Swipe up, and we'll ask if you'd watch it again tonight.
- "2 of 3 of you liked this" tells you a film is one like away from a match. Nobody ever sees who said Nope.
- Tonight's pick comes with where to watch it, and a recap card to share, with no names on it.
- On your own tonight? Play alone: swipe at your own pace, then pick one of your likes for tonight.
- My films keeps the films you liked and the ones you've seen, on this phone.
- No account, no email: just a name and a color.

Free. The catalog covers the films and services available in France.

This app uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.
Streaming availability by JustWatch.
```

### Keywords · en-GB (100 bytes)

"Film" words for the U.K. and the storefronts that show English (U.K.).

```text
film,cinema,what,watch,decide,friends,family,group,couple,night,swipe,match,picker,choose,streaming
```

## Google Play Console: Main store listing

### App name · fr-FR (30)

```text
Flimme
```

### Short description · fr-FR (80)

```text
Swipe avec tes amis ou ta famille et trouve le film du soir qui plaît à tous.
```

### Full description · fr-FR (4,000)

```text
Choisir un film ne devrait pas prendre une heure. Avec Flimme, chacun swipe sur son téléphone, et le film qui plaît à toute la salle sort du lot.

COMMENT ÇA MARCHE
1. Ouvre une salle (jusqu'à 10 personnes) et partage le code, le lien ou le QR code.
2. Chacun swipe : J'aime, Bof, Coup de cœur ou Déjà vu.
3. Quand toute la salle aime un film (presque toute, dans un grand groupe), c'est un match.
4. Au moment de choisir, un vote final de 60 secondes tranche. De 2 à 4 joueurs, c'est le Final Cut : choisis-en un, élimine-en un.

POURQUOI ÇA MARCHE
- Seulement des films à voir ce soir, sur les plateformes de la salle.
- Indique l'âge du plus jeune devant l'écran : les films au-dessus de son âge restent hors du jeu. Ajoute une durée, comme « Moins de 2 h ».
- Déjà vu ? Glisse vers le haut, et on te demande si tu le reverrais ce soir.
- « 2 sur 3 ont aimé » te dit qu'un film est à un j'aime du match. Personne ne voit jamais qui a dit Bof.
- Le film du soir s'affiche avec où le regarder, et un récap à partager, sans aucun prénom dessus.
- Tout seul ce soir ? Jouer seul te laisse swiper à ton rythme, puis choisir ton film du soir parmi tes j'aime.
- Mes films garde sur ce téléphone les films que tu as aimés et ceux que tu as déjà vus.
- Pas de compte, pas d'e-mail : juste un prénom et une couleur.

Gratuit. Le catalogue couvre les films et les plateformes disponibles en France.

Cette application utilise TMDB et les API de TMDB, mais n'est ni approuvée, ni certifiée, ni validée d'aucune autre manière par TMDB.
Disponibilités fournies par JustWatch.
```

### App name · en-US (30)

```text
Flimme
```

### Short description · en-US (80)

```text
Swipe with friends or family and find the movie you all want to watch.
```

### Full description · en-US (4,000)

```text
Movie night shouldn't take an hour. With Flimme, everyone swipes on their own phone, and the film the whole room likes comes out on top.

HOW IT WORKS
1. Open a room (up to 10 people) and share the code, the link or the QR code.
2. Everyone swipes: Like, Nope, Super like or Seen it.
3. When the whole room likes a film (most of the room, in a big group), it's a match.
4. Time to choose: a final vote of 60 seconds settles it. With 2 to 4 of you, it's the Final Cut: pick one, veto one.

WHY IT WORKS
- Only films you can watch tonight, on the services in the room.
- Set the youngest viewer's age, and films above it stay out. Add a time budget, like "Under 2 h".
- Seen it? Swipe up, and we'll ask if you'd watch it again tonight.
- "2 of 3 of you liked this" tells you a film is one like away from a match. Nobody ever sees who said Nope.
- Tonight's pick comes with where to watch it, and a recap card to share, with no names on it.
- On your own tonight? Play alone: swipe at your own pace, then pick one of your likes for tonight.
- My films keeps the films you liked and the ones you've seen, on this phone.
- No account, no email: just a name and a color.

Free. The catalog covers the films and services available in France.

This app uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.
Streaming availability by JustWatch.
```

## Google Play Console: Store settings

### Tags · all (up to 5)

Chosen in the console's tag list (Manage tags), for what the app does: it helps pick a film, and it doesn't stream one. Google publishes no list, so these names come from a third-party copy of it (AppTweak, updated 19 September 2024). If the console names one differently, pick the closest and fix this list.

- Movie
- Entertainment

## Claims and where the app makes them

Every claim in the copy, matched to the string (in `mobile/src/i18n/locales/en/` and `fr/`) or the rule that makes it true.

| Claim | Where |
| --- | --- |
| A room holds up to 10 people, joined by code, link or QR code | `onboarding.json` welcome.promises.room; `join.json` body; `lobby.json` shareLink, showQr, invite.qr |
| Like, Nope, Super like, Seen it (J'aime, Bof, Coup de cœur, Déjà vu) | `swipe.json` a11y.actions; `common.json` answers |
| A match when the whole room likes a film, most of it in a big group | `swipe.json` shortlisted.title; `match.json` count; [When it's a match](../product/game-modes.md#when-its-a-match) (everyone up to 4 players, 70% from 5) |
| A final vote of 60 seconds; the Final Cut, "pick one, veto one", for 2 to 4 | `finale.json` title, heading; [The vote](../product/game-modes.md#the-vote-pick-one-veto-one) |
| Only films on the room's services | `onboarding.json` welcome.promises.services; `host.json` services; `lobby.json` roomServices |
| The youngest viewer's age keeps older films out; a time budget such as "Under 2 h" | `host.json` age.label, age.helper, time.under120 |
| Seen it: swipe up, then "Watch it again tonight?" | `swipe.json` hints.seen, seenQuestion.title; Quick Match rooms allow rewatches (migration `20261104130000_allow_rewatch_default.sql`) |
| "2 of 3 of you liked this"; nobody sees who said Nope | `swipe.json` nearMiss; [What players see](../product/game-modes.md#what-players-see-party-and-blind) |
| Tonight's pick with where to watch it; a recap card with no names | `winner.json` eyebrow, whereToWatch; `recap.json` sheet.body |
| Play alone at your own pace, then pick one of your likes | `solo.json` card, checkpoint.pick, pickSheet |
| My films: liked and seen, on this phone | `myFilms.json` segments, accounts |
| No account, no email, a name and a color | `onboarding.json` name.note, name.colorLabel |
| Free | [Price and countries](../product/store-listing.md#price-and-countries) |
| The catalog is France's | [The first release](../product/roadmap.md#the-first-release-whats-in-what-waits) (Catalog: France only) |

# Store listing

How MovieMatch gets into the App Store and Google Play: choosing the name, the developer accounts, the store records, the listing in English and French, screenshots and the preview video, age ratings, passing review, the invite links the stores care about, price and countries, the closed beta, and a release checklist. Written on 29 October 2026; every store rule below was checked on Apple's and Google's live pages that day (see [Sources checked](#sources-checked)).

It builds on the [onboarding](onboarding.md) (the invite page, accounts), the [app structure](../architecture/app-structure.md) (builds, links, sign-in), [monetization](monetization.md) (free at launch, kids' safety, not the Kids category), [tmdb.md](../integrations/tmdb.md) (credits, countries at launch) and the [Letterboxd integration](../integrations/letterboxd.md). It replaces the Store part of the revival plan's [publishing checklist](revival-plan.md#publishing-checklist). The App Privacy labels and the Data safety form are in [privacy.md](privacy.md); store and install metrics are in [analytics.md](analytics.md). Decisions are in [decisions.md](../decisions.md).

The app's name is still open, so this doc writes **[Name]** wherever it goes. Every number marked as a starting value is a placeholder.

## Contents

1. [Choosing the name](#choosing-the-name)
2. [Developer accounts](#developer-accounts)
3. [Setting up the store records](#setting-up-the-store-records)
4. [The listing, in English and French](#the-listing-in-english-and-french)
5. [Screenshots and the preview video](#screenshots-and-the-preview-video)
6. [Age ratings](#age-ratings)
7. [Passing review](#passing-review)
8. [Invite links and the web page](#invite-links-and-the-web-page)
9. [Price and countries](#price-and-countries)
10. [The closed beta](#the-closed-beta)
11. [Timeline](#timeline)
12. [Release checklist](#release-checklist)
13. [Changes this asks elsewhere](#changes-this-asks-elsewhere)
14. [Starting values](#starting-values)
15. [Open questions](#open-questions)
16. [Sources checked](#sources-checked)

## Choosing the name

The name blocks more than the listing: the bundle id and package name, the invite domain, the URL scheme and the universal links all wait on it (see [app structure](../architecture/app-structure.md#invites-and-deep-links)). This section doesn't pick one; it says how to check one.

**What makes a name work here**

- **Short.** Both stores cap the name at 30 characters, and that includes any descriptive suffix ("[Name]: Movie Night").
- **Says it out loud.** It's spoken across a couch ("open [Name]"), so it should be easy to say and spell in French and in English.
- **Not confusable** with the apps already doing this: MatchMovie, CineMatch, MatchFlicks, ReelMatch, Movie Night, LazyWatch (from the revival plan's [competitor list](revival-plan.md#what-similar-apps-already-do)). Anything built on "Match" + "Movie" or "Flick" is crowded.
- **No third-party names** in it. App Store guideline 5.2.1 rules out "misleading, false, or copycat representations, names, or metadata", so nothing that suggests Letterboxd, Netflix or TMDB.

**How to check a shortlist** (about five names):

1. Search both stores for the exact name and close variants.
2. Search trademarks in the classes that cover an app: downloadable software (Nice class 9), entertainment services (41) and online software services (42). The free databases are the EUIPO's TMview, which includes France's office, and WIPO's Global Brand Database; check INPI's own search for France too. An empty result isn't proof the name is free: unregistered names and trade names don't show up.
3. Check the domains (a short one for invite links, plus `.com`, `.app` or `.fr`) and the social handles.
4. Say it out loud to a few people in both languages.

Filing a trademark is optional at launch; a lawyer's check is worth it before spending on marketing.

## Developer accounts

Both stores need an account before any build reaches a tester. The choice of **individual or organisation** decides what players see and how long setup takes.

| | Apple Developer Program | Google Play Console |
| --- | --- | --- |
| Fee | 99 USD a year (shown in local currency) | 25 USD once |
| Individual | Your legal name is shown as the seller. For an "individual or sole proprietor/single person business" | A personal account. Shows your legal name, country and developer email; **your full address too once the app earns money** |
| Organisation | The organisation's name is shown as the seller. Must be a legal entity (no trade names), with a D-U-N-S number, a public website and an email on its domain | Needs a D-U-N-S number. Shows the organisation's legal name, address, email and phone |
| D-U-N-S | Free from Dun & Bradstreet; Apple says to allow up to 5 business days, then 2 more for Apple to receive it | Same number, free |
| Extra step | EU trader status for the Digital Services Act (below) | **New personal accounts must run a closed test with at least 12 testers opted in for 14 days in a row** before applying for production access |

**Google's testing requirement** applies to "personal developer accounts created after November 13, 2023". Google's page doesn't mention organisation accounts. With a personal account, the public launch on Android is at least 14 days after the first 12 testers opt in, so the closed beta has to start early (see [The closed beta](#the-closed-beta)).

**EU trader status (Digital Services Act).** Every Apple developer must declare whether they're a trader, even with no EU distribution. A trader's address (or a P.O. box with proof), phone and email are shown on the product page in all 27 EU countries once Apple verifies them. Apple can't decide for you: earning money from the app, advertising, being VAT-registered or building the app as part of a business point to trader; "a hobbyist [...] with no intention of commercializing" may not be one. A non-trader can still be listed, and EU players are told consumer protection law doesn't apply. Since Host Pro is planned, the honest answer is probably trader, which means publishing a contact address.

**Recommendation (Harry's choice):** run the closed beta on **individual and personal accounts**, which are fastest to open and don't show anything in EU storefronts yet, and **decide the legal entity before the public launch**. If a company will exist within the year, enrolling it as an organisation before launch keeps Harry's name and home address off the stores (a P.O. box or a business domiciliation address covers the trader address otherwise). A third-party guide reports Apple can convert an individual membership to an organisation through support; Google's conversion path wasn't checked.

## Setting up the store records

| Item | Choice | Notes |
| --- | --- | --- |
| Bundle id and package name | Reverse of the invite domain, e.g. `app.<domain>` | Treat as permanent once a build is uploaded. Waits on the name. The app structure's development and preview builds use suffixed ids |
| Primary language | French (France) | Launch countries are French-speaking. Add English (U.S.) and English (U.K.) localizations |
| Category | Entertainment, as JustWatch uses | Secondary on Apple: Lifestyle (default) |
| Apple capabilities | Sign in with Apple, Associated Domains | From the app config ([app structure](../architecture/app-structure.md#sign-in)) |
| Content rights (Apple) | Yes, the app shows third-party content | Posters and synopses come from TMDB under its licence; see [tmdb.md](../integrations/tmdb.md#terms-licence-and-attribution) |
| Encryption (Apple export compliance) | Standard HTTPS only | Set the exemption in the app config so each build doesn't ask |
| Privacy policy URL | Required by both stores and inside the app (App Store guideline 5.1.1(i)) | From [privacy.md](privacy.md) |
| Support URL | A page with a contact email | Apple requires real contact details on it |
| Account deletion web page | Required by Google Play for apps with accounts | A page where players can ask for deletion without the app; also linked in the Data safety form ([privacy.md](privacy.md)) |
| Android target | API level 36 (Android 16) | Required for new apps and updates on Google Play since 31 August 2026; check what Expo SDK 58 sets |

## The listing, in English and French

**Limits:** name 30 characters on both stores; Apple subtitle 30, promotional text 170 (editable without a new version), description 4,000, keywords 100 bytes; Google short description 80, full description 4,000.

**Rules that shape the copy**

- **No "for kids" or "for children".** Apple reserves those words for the Kids Category (guideline 2.3.8). "For the whole family" is fine. Google may reject a listing that "appeals to children" through youthful imagery if the app isn't in its Families programme (see [Age ratings](#age-ratings)).
- **No other app or company names in the keywords** (Apple allows none; guideline 2.3.7 bans packing metadata with trademarks). So no "Letterboxd", "Netflix" or "TMDB" in the keyword field.
- **Third-party names in the description only to describe a real feature**, with no logos and no partnership wording: "Import your Letterboxd history", never "Letterboxd for groups". Add "Not affiliated with Letterboxd" ([Letterboxd ground rules](../integrations/letterboxd.md#ground-rules)).
- **Credits in the description and the app's About screen:** "Film data from TMDB. Where-to-watch data powered by JustWatch. This product uses the TMDB API but is not endorsed or certified by TMDB" ([tmdb.md](../integrations/tmdb.md#terms-licence-and-attribution)).
- **No Android in the iOS listing** (guideline 2.3.10), and the reverse.

**Drafts** (lengths checked):

| Field | English | French |
| --- | --- | --- |
| Subtitle (Apple, 30) | Pick a movie together, fast | Le film du soir, en 5 minutes |
| Promotional text (Apple, 170) | Stop scrolling, start watching. Everyone swipes, and the app finds the film you all want to see, usually in under five minutes. | Fini les heures à chercher. Chacun swipe, et l'appli trouve le film que tout le monde a envie de voir, souvent en moins de cinq minutes. |
| Short description (Google, 80) | Swipe with friends or family and find the movie everyone wants to watch. | Swipez entre amis ou en famille et trouvez le film que tout le monde veut voir. |
| Keywords (Apple, 100 bytes) | movie night,film,group,friends,family,swipe,match,watchlist,what to watch,decide,couple,date night | soirée film,film,cinéma,amis,famille,swipe,match,quoi regarder,choisir,couple,ce soir,watchlist |

**Full description, English** (a start):

> Movie night shouldn't take an hour. With [Name], everyone swipes on their own phone and the app finds the film the whole room says yes to.
>
> HOW IT WORKS
> 1. Open a room and share the code, link or QR code.
> 2. Everyone swipes: like, nope, super like, or "seen it".
> 3. It's a match when you all like the same film. No match yet? The Final Cut settles it in under a minute.
>
> WHY IT'S DIFFERENT
> - Only films you can watch tonight, on the services in the room.
> - A deck that learns what each of you likes, and doesn't serve the same films every week.
> - Nobody gets stuck with a film they'd hate.
> - Optional: import your Letterboxd history so the deck knows your taste from the first card.
>
> Free, no account needed, no swipe limit.
>
> Film data from TMDB. Where-to-watch data powered by JustWatch. This product uses the TMDB API but is not endorsed or certified by TMDB. Not affiliated with Letterboxd.

**Full description, French** (a start):

> Choisir un film ne devrait pas prendre une heure. Avec [Name], chacun swipe sur son téléphone et l'appli trouve le film qui plaît à tout le monde.
>
> COMMENT ÇA MARCHE
> 1. Créez une salle et partagez le code, le lien ou le QR code.
> 2. Chacun swipe : j'aime, non, coup de cœur, ou « déjà vu ».
> 3. C'est un match quand tout le monde aime le même film. Pas encore de match ? Le Final Cut tranche en moins d'une minute.
>
> CE QUI CHANGE
> - Seulement des films que vous pouvez regarder ce soir, sur les plateformes de la salle.
> - Des propositions qui apprennent vos goûts et ne vous resservent pas les mêmes films chaque semaine.
> - Personne ne se retrouve devant un film qu'il déteste.
> - En option : importez votre historique Letterboxd pour que l'appli connaisse vos goûts dès la première carte.
>
> Gratuit, sans compte, sans limite de swipes.
>
> Données des films : TMDB. Disponibilités fournies par JustWatch. Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. Sans lien avec Letterboxd.

The answer labels in the French copy should match the app's French strings once they exist.

## Screenshots and the preview video

**What's required today**

| | Apple | Google Play |
| --- | --- | --- |
| Phone | At least 1, up to 10, for **iPhone with Dynamic Island (medium)**: 1179 × 2556 or 1206 × 2622 portrait. Other sizes are optional and scaled from it | At least 2 to publish, up to 8 per device type; 320 to 3840 px, long side at most twice the short side. **To be recommended, at least 4 at 1080 × 1920 or more** |
| Tablet | **13-inch iPad required if the app runs on iPad**: 2064 × 2752 or 2048 × 2732 | Optional; at least 4 for tablets and Chromebooks, 1080 to 7680 px |
| Other assets | Icon from the build | Icon 512 × 512 PNG; feature graphic 1024 × 500 |
| Video | Up to 3 previews per size and language, 15 to 30 seconds, screen captures of the app only (guideline 2.3.4), 886 × 1920 for the newest iPhones | One YouTube link, public or unlisted, ads off, not age-restricted; only the first 30 seconds autoplay |
| Content | Must suit a 4+ audience even if the app is rated higher (guideline 2.3.8) | Must match the content rating |

If the app supports tablets (an open question in [app structure](../architecture/app-structure.md#project-setup)), Apple's reviewers will also test it on an iPad, so the centred phone layout has to look intentional there.

**The screenshots**, in order (starting value: 6):

| # | Screen | Caption (EN / FR) |
| --- | --- | --- |
| 1 | A card mid-swipe, with the room's avatars | Everyone swipes. / Chacun swipe. |
| 2 | "It's a match" | A film you all want, in minutes. / Le film que tout le monde veut, en quelques minutes. |
| 3 | The lobby with code and QR | Join with a code or a link. / Rejoignez avec un code ou un lien. |
| 4 | The card's back: synopsis, where to watch | Only what you can watch tonight. / Seulement ce que vous pouvez regarder ce soir. |
| 5 | The Final Cut | No match? The Final Cut decides. / Pas de match ? Le Final Cut tranche. |
| 6 | The recap card | Share your movie night. / Partagez votre soirée. |

**Posters in store assets.** Use the design's fictional posters (the Figma already has them, such as "Midnight Matinee") rather than real studio artwork. Real posters are third-party copyrighted works (guideline 5.2.1), and a fictional set can be chosen to stay safely 4+. Service names can appear as text; avoid service logos in store assets. This is Harry's choice; it's the recommendation.

**The preview video** (starting value: 25 seconds): three phones in a room, swipes, a near miss, the match, the winner screen. Apple only accepts screen captures of the app, so phones side by side are composited from captures; narration and text overlays are allowed. The same cut goes on YouTube, unlisted, for Google Play.

## Age ratings

### Apple

Apple's ratings are now 4+, 9+, 13+, 16+ and 18+ (12+ and 17+ were retired; the new questionnaire was due by 31 January 2026). The rating follows the content the app can show, and ours is mainstream films' posters, titles, synopses and trailer links (adult titles are always excluded).

| Questionnaire item | Our honest answer | Rating it implies |
| --- | --- | --- |
| Horror/Fear Themes | Infrequent (horror posters only reach rooms that like horror) | 9+ |
| Cartoon or Fantasy Violence, Profanity or Crude Humor, Mature or Suggestive Themes | Infrequent | 9+ |
| Realistic Violence | Infrequent (action and crime posters, synopses) | **13+** |
| Sexual Content or Nudity | Infrequent (suggestive posters and synopses of some R-rated films) | **13+** |
| User-generated content | Display names and preset emoji reactions, seen only by the room. Answer yes to be safe; it doesn't raise the rating | 4+ |
| Messaging and chat | No: no free text between players | |
| Unrestricted web access | No: the app only opens specific pages (Letterboxd's export page, TMDB's watch page) in the system browser sheet, with no address to type. Open those "More details" links in the external browser if a reviewer disagrees | (16+ if yes) |
| Advertising, gambling, contests | None | |

**Expected: 13+.** For comparison, JustWatch is rated 13+ with the same infrequent descriptors, and Letterboxd 16+ (it has messaging). A 9+ rating would need a catalog with no realistic violence or suggestive images at all, which isn't the product.

### Google Play

Google's content rating comes from the IARC questionnaire in Play Console; each region's authority applies its own rules (PEGI in Europe, so France; ESRB in the Americas). Answer it with the same facts as Apple's. The result can't be known before filling it in.

**Target audience** is a separate Play Console setting. Choosing any age group under 13 brings in Google's Families policy: only self-certified ad SDKs, disclosure and parental consent for children's data where required, and a neutral age screen for mixed audiences. **Recommendation: target 13 and over at launch**, and keep the listing free of youthful imagery so it isn't judged to "appeal to children".

### What this means for the family bet

- **Kids' locked devices may not install it.** A child's iPad limited to 9+ won't install a 13+ app, as [monetization](monetization.md#kids-safety-and-privacy) foresaw. Kids join on a parent's phone, or through the web if web guests launch ([decisions.md](../decisions.md)).
- **The pitch stays "the whole family", never "for kids".**
- **Family profiles later** (kid profiles under a parent's account) will need this revisited: they may bring Google's Families policy and Apple's parental-controls answers into play.

## Passing review

| Risk | Rule | How we pass |
| --- | --- | --- |
| **A reviewer alone can't play a group game** | 2.1, app completeness | A **demo room**: a reserved room code, listed in the review notes, where two server-run bot players join and swipe, so one device can reach a match and a Final Cut. Works for Apple's and Google's reviewers alike |
| No login to test | 2.1 | None needed: the app signs in anonymously. Say so in the notes |
| Account deletion | 5.1.1(v); Google Play's account deletion policy | Settings > Delete account, in the app. A web page to request deletion for Google. On deletion, the server revokes the player's Sign in with Apple tokens through Apple's REST API, as Apple's guideline page recommends |
| Sign in with Apple | 4.8 | Offered next to Google on iOS ([onboarding](onboarding.md#accounts)). Android offers Google only, which Apple's rule doesn't cover |
| Display names and reactions | 1.2, user-generated content: filtering, reporting, blocking, contact | A name filter on `api.update_profile`; preset avatars and preset emoji only, no free text; the host can **remove a player** from the room; **Report** on a player in the lobby; a contact email in the app and on the support page |
| Third-party content | 5.2.1, 5.2.2: permission under the service's terms, "authorization must be provided upon request" | TMDB's licence (the commercial agreement question is open in [decisions.md](../decisions.md)); JustWatch credited; Letterboxd data comes only from the player's own export file and public feed. Explain this in the notes |
| Letterboxd import can't be tried without an export | 2.1 | A demo Letterboxd account we own, and its export file linked in the notes. Its public feed matches, so [the RSS check](../integrations/letterboxd.md#the-rss-check) passes |
| Minimum functionality | 4.2: beyond a repackaged website | Native card stack, gestures, haptics, live rooms. Fine |
| Store assets | 2.3.3, 2.3.4, 2.3.8 | App in use, captures only, 4+ images |
| Kids Category | 1.3 | Not chosen: it bans third-party analytics and ads and links out without a parental gate ([monetization](monetization.md#kids-safety-and-privacy)) |
| Privacy | 5.1.1(i); Google's Data safety | [privacy.md](privacy.md) |

**Review notes** (both stores; a start):

> [Name] is a group movie picker: everyone in a room swipes on films, and the app finds the one everybody likes. No account is needed; the app signs in anonymously.
>
> To play a full game on one device: open the app, tap "I have a room code" and enter [demo code]. Two demo players join and swipe. Like a few films to get a match; if none comes, the Final Cut opens after a few minutes.
>
> To play with two devices: create a room on one, then join it from the other with the code or the invite link.
>
> Letterboxd import (optional): it uses the player's own export file from letterboxd.com. Our demo account's export is at [URL]. Profile > Connect Letterboxd.
>
> Save an account: Profile > Save your history (Sign in with Apple or Google). Delete it: Settings > Delete account.
>
> Film data comes from TMDB under its API terms; where-to-watch data is credited to JustWatch.

Google's reviewers get the same notes in Play Console's app access section.

## Invite links and the web page

What the stores need from the links in [onboarding](onboarding.md#the-link) and [app structure](../architecture/app-structure.md#invites-and-deep-links):

- **Verification files** on the invite domain: `apple-app-site-association` for universal links and `assetlinks.json` for Android App Links, under `/.well-known/`. iOS reads its file at install and on updates.
- **The invite page** carries a Smart App Banner on iOS and the official store badges, used as each brand's guidelines say. It also carries the privacy policy link and the TMDB and JustWatch credits, since it shows the room and, if web guests launch, films.
- **The store links** on that page open the right store for the device; Android can pass the room through Play's install referrer ([onboarding](onboarding.md#app-not-installed)).

## Price and countries

- **Free, no in-app purchases at launch**, as [monetization](monetization.md#recommended-sequence) recommends. Host Pro later adds purchases, a paywall review and RevenueCat.
- **Countries follow the catalog** ([tmdb.md](../integrations/tmdb.md#countries-at-launch)): France for the closed beta; France, Belgium and Switzerland at the public launch; the UK, Ireland, the US and Canada once the English copy is done. **Default: the stores list only countries where hosting works,** so nobody installs an app they can't host with. A guest abroad joins through the invite link (and the web, if web guests launch).

## The closed beta

| | TestFlight (iOS) | Google Play testing |
| --- | --- | --- |
| Small circle | Internal testers: up to 100 members of the team with a role in App Store Connect | Internal testing: up to 100 testers by email; a build reaches them within minutes |
| Friend groups and families | External testers: up to 10,000, by email or a **public link**; the first build needs TestFlight review | Closed testing: email lists (up to 2,000 people each) or **a Google Group** |
| Devices | Up to 30 per tester | |
| Gate to launch | App Review of the release build | For a personal account: **12 testers opted in for 14 days in a row**, then apply for production access |

**Plan:**

1. **Internal** (Harry and two or three friends): TestFlight internal and Play internal testing, from the first build.
2. **Closed beta** (5 to 10 friend groups and 3 to 5 families, as the revival plan and monetization doc ask): one TestFlight public link and one Google Group, shared in the same invite message. On Android, count the 12 testers from day one and keep them opted in for at least 14 days.
3. **Public launch** once the beta's goals hold (median time to a pick, rooms ending with a pick; see [analytics.md](analytics.md)) and Google has granted production access.

## Timeline

The order matters more than the dates; durations are what the stores' pages say, not guarantees.

| Step | Waits on | Typical wait |
| --- | --- | --- |
| Name chosen, domain bought | Harry | |
| Accounts opened (individual and personal) | Identity checks | Days. An organisation adds the D-U-N-S number: up to 5 business days, plus 2 for Apple |
| Bundle id and package name created | The name | |
| First internal builds | Accounts, the app | Play internal testing: minutes |
| First external TestFlight build | TestFlight review | |
| Closed beta | 12 Android testers opted in | **At least 14 days** on a personal Google account |
| Ratings, listing, privacy forms, review notes, demo room | This doc, privacy.md | |
| Production access (Google, personal account) | The 14-day test | |
| App Review and Play review | Everything above | |
| EU trader status verified (Apple) | Documents | Forum reports describe weeks; start early |

## Release checklist

Replaces the Store section of the revival plan's [publishing checklist](revival-plan.md#publishing-checklist). Privacy and account items now live in [privacy.md](privacy.md), security items in [security.md](../architecture/security.md).

**Identity and accounts**

- [ ] Name chosen after the checks in [Choosing the name](#choosing-the-name); domain and handles secured
- [ ] Legal entity decided; Apple and Google accounts opened accordingly
- [ ] EU trader status declared, contact address ready (P.O. box or business address if not home)
- [ ] Bundle id and package name created

**Build**

- [ ] Android target API level 36
- [ ] Encryption exemption in the app config
- [ ] Sign in with Apple and Associated Domains capabilities
- [ ] Account deletion in the app, with Sign in with Apple token revocation on the server
- [ ] Verification files live on the invite domain; universal links and App Links tested from a cold install
- [ ] Name filter, Report and Remove player in place
- [ ] Demo room and bot players running, demo code working
- [ ] About screen with the TMDB logo and notice, JustWatch credit

**Listing**

- [ ] English and French copy final, within limits, no "for kids", no third-party names in keywords
- [ ] Screenshots: iPhone (and 13-inch iPad if tablets are supported), Play phone (4 or more at 1080 × 1920)
- [ ] Play icon 512 × 512 and feature graphic 1024 × 500
- [ ] Preview video: captures only, 15 to 30 seconds; unlisted YouTube copy with ads off
- [ ] Support URL with contact details; privacy policy URL; account deletion web page

**Ratings and forms**

- [ ] Apple age rating questionnaire
- [ ] IARC questionnaire and target audience (13 and over) in Play Console
- [ ] App Privacy labels and Data safety form ([privacy.md](privacy.md))
- [ ] Content rights declared (Apple)

**Review and beta**

- [ ] Review notes and the demo Letterboxd export in both consoles
- [ ] TestFlight external review passed; Google closed test at 12 testers for 14 days
- [ ] Countries set: France for the beta; France, Belgium, Switzerland at launch
- [ ] Price: free

## Changes this asks elsewhere

| Where | Change | Why |
| --- | --- | --- |
| Game functions ([game-modes.md](game-modes.md)) | The host can remove a player; a removed player can't rejoin that room. `api.report_player(room, seat, reason)` | App Store guideline 1.2 asks for blocking and reporting |
| `api.update_profile` | A name filter (a word list in French and English) | 1.2's filtering |
| Server ([server-structure.md](../architecture/server-structure.md)) | A demo room: a reserved code that's never handed to a real room, and two bot players that join and swipe | Reviewers testing on one device |
| Server HTTP API, account deletion | Revoke Sign in with Apple tokens with Apple's REST API | Apple's account deletion guidance |
| Web ([app structure](../architecture/app-structure.md#invites-and-deep-links)) | Smart App Banner and store badges on the invite page; an account deletion request page | Store requirements |
| [operations.md](../architecture/operations.md) | A demo Letterboxd account and its export, kept current | Review notes |

## Starting values

| Value | Start |
| --- | --- |
| Screenshots per device | 6 |
| Preview video length | 25 seconds |
| Closed beta length | At least 14 days, 12 or more Android testers opted in throughout |
| Beta size | 5 to 10 friend groups, 3 to 5 families |
| Bot players in the demo room | 2 |

## Open questions

1. **Legal entity.** Individual and personal accounts for the beta, with the entity decided before the public launch? An individual's legal name is the seller on both stores, Google shows a personal account's full address once the app earns money, and an EU trader's contact address shows on Apple's product pages. Recommended: individual for the beta; an organisation before launch if a company is planned within the year.
2. **Store assets with fictional posters** (as in the Figma) instead of real studio posters and service logos? Recommended: yes.
3. **Google Play target audience of 13 and over**, and an honest 13+ on Apple, with kids joining on a parent's device or the web? Recommended: yes, until family profiles exist.
4. **Stores listed only where hosting works** (France for the beta; France, Belgium and Switzerland at launch)? Recommended: yes.
5. **A demo room with bot players** for reviewers? Recommended: yes. A "try it with bots" option for new players could reuse it later.
6. **French as the primary store language**, with English (U.S. and U.K.) localizations? Recommended: yes.

## Sources checked

All on 29 October 2026.

- Apple: [enrolment](https://developer.apple.com/programs/enroll/) (individual vs organisation, D-U-N-S, 99 USD), [D-U-N-S help](https://developer.apple.com/help/account/membership/D-U-N-S/) (5 business days, then 2), [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications), [app preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-preview-specifications), [app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information) (name and subtitle 30), [platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information) (promotional text, description, keywords), [age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (1.2, 1.3, 2.1, 2.3.3, 2.3.4, 2.3.7, 2.3.8, 2.3.10, 4.2, 4.8, 5.1.1, 5.2.1, 5.2.2), [offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/) (token revocation), [DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/), [apps without trader status removed in the EU](https://developer.apple.com/news/?id=einwn76m), [TestFlight](https://developer.apple.com/testflight/)
- Age rating coverage: [9to5Mac, July 2025](https://9to5mac.com/2025/07/24/apple-notifies-developers-of-new-app-store-age-rating-system/) (new tiers, 31 January 2026 deadline); comparable apps: [JustWatch on the App Store](https://apps.apple.com/us/app/justwatch-movies-tv-shows/id979227482) (13+), [Letterboxd on the App Store](https://apps.apple.com/us/app/letterboxd/id1054271011) (16+)
- Google Play: [testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465), [account types](https://support.google.com/googleplay/android-developer/answer/13634885), [information requirements and verification](https://support.google.com/googleplay/android-developer/answer/13628312) (what's shown publicly), [getting started](https://support.google.com/googleplay/android-developer/answer/6112435) (25 USD fee), [testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334), [preview assets](https://support.google.com/googleplay/android-developer/answer/9866151), [store listing limits](https://support.google.com/googleplay/android-developer/answer/9859152), [content ratings](https://support.google.com/googleplay/android-developer/answer/9859655), [target audience and content](https://support.google.com/googleplay/android-developer/answer/9867159), [account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111), [target API level](https://developer.android.com/google/play/requirements/target-sdk) (API 36 from 31 August 2026)
- Trademarks: [WIPO Global Brand Database](https://www.wipo.int/en/web/global-brand-database/faqs_branddb), [TMview guide](https://www.intepat.com/blog/trademark/tmview/)

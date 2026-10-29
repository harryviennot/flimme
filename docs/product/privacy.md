# Privacy and legal ground

What MovieMatch stores about players and why, the legal basis for each use, the consents and when they're asked, players' rights in practice, children, what Letterboxd's and TMDB's terms mean for us, who processes data on our behalf and where, the store privacy forms, and outlines of the privacy policy and the terms of use. Written on 29 October 2026 for a French developer publishing in the EU first.

It builds on the data model's [retention](../architecture/data-model.md#retention), [who sees what](../architecture/data-model.md#who-sees-what) and [account deletion](../architecture/data-model.md#deleting-an-account-exporting-data), the Letterboxd integration's [rules for using the data](../integrations/letterboxd.md#using-the-data), TMDB's [terms](../integrations/tmdb.md#terms-licence-and-attribution), onboarding's [Letterboxd flow](onboarding.md#letterboxd) and [permissions](onboarding.md#permissions), the app's [analytics and crash reports](../architecture/app-structure.md#analytics-and-crash-reports) and the monetization doc's [kids' safety](monetization.md#kids-safety-and-privacy). Technical protections are in [security.md](../architecture/security.md); the analytics events are designed in [analytics.md](analytics.md). Decisions are in [decisions.md](../decisions.md).

**This isn't legal advice.** It was written from public sources by someone who isn't a lawyer. Every point marked **Lawyer** needs a lawyer's read before the public launch; [Questions for a lawyer](#questions-for-a-lawyer) lists them so one meeting can cover them. Laws and store rules were checked on their live pages on 29 October 2026 ([Sources checked](#sources-checked)).

## Contents

1. [The short version](#the-short-version)
2. [Who is responsible](#who-is-responsible)
3. [What we store and why](#what-we-store-and-why)
4. [Legal bases](#legal-bases)
5. [Consents](#consents)
6. [Analytics without a consent prompt](#analytics-without-a-consent-prompt)
7. [Crash reports](#crash-reports)
8. [Training models across players](#training-models-across-players)
9. [Players' rights in practice](#players-rights-in-practice)
10. [Children](#children)
11. [Letterboxd](#letterboxd)
12. [TMDB and JustWatch](#tmdb-and-justwatch)
13. [Who processes data for us](#who-processes-data-for-us)
14. [Store privacy forms](#store-privacy-forms)
15. [Privacy policy outline](#privacy-policy-outline)
16. [Terms of use outline](#terms-of-use-outline)
17. [French specifics](#french-specifics)
18. [Questions for a lawyer](#questions-for-a-lawyer)
19. [Changes this asks elsewhere](#changes-this-asks-elsewhere)
20. [Starting values](#starting-values)
21. [Sources checked](#sources-checked)

## The short version

- **Data lives in the EU**: the database in Supabase's Paris region, the recommendation server with an EU host. The one exception is Expo's update service, in the US under the EU-US Data Privacy Framework.
- **No ads, no tracking, nothing sold.** No SDK in the app builds profiles across apps.
- **Only one consent at launch**: the Letterboxd import. Analytics are set up as anonymous audience measurement, which the CNIL exempts from consent, so nothing is asked before the first game, as [onboarding](onboarding.md#goals) requires.
- **Every player, guest or account, can export and delete their data from the app**, and can switch off analytics and the use of their games for training.
- **Kids:** the France launch is a general-audience app in which no consent-based processing touches guests. Family profiles and the US launch need a lawyer first.
- **Four things need a lawyer before launch**: the analytics exemption, crash reports without consent, Letterboxd ratings in models trained across players, and the kids' design for later markets.

## Who is responsible

| Role | Who |
| --- | --- |
| Controller | Harry, as an individual (decided on 29 October 2026). The privacy policy, the store developer accounts and the TMDB agreement all name him |
| Processors | Supabase, the server host, object storage, Sentry, PostHog, Expo (see [Who processes data for us](#who-processes-data-for-us)) |
| Independent controllers | Apple and Google (sign-in, stores), Letterboxd (the member's own account) |
| Data protection officer | Not required at launch in our reading: the mandatory cases are large-scale systematic monitoring or sensitive data as a core activity. **Lawyer**: revisit as the player count grows, since decks are built from profiling |
| Record of processing | Kept from the start; [What we store and why](#what-we-store-and-why) is its base. The CNIL publishes a template |
| Impact assessment (DPIA) | Recommended before launch. The CNIL's list of criteria includes profiling and vulnerable people such as children, and two criteria usually call for one. The CNIL's free PIA tool is enough |

## What we store and why

Guests and accounts store the same things; a guest simply has no email. Retention comes from the data model's [retention table](../architecture/data-model.md#retention) unless marked new.

| Data | What it holds | Why | Basis | Who else sees it | Kept |
| --- | --- | --- | --- | --- | --- |
| Sign-in (Supabase Auth) | User id; for saved accounts, the email and name Apple or Google pass on (Apple can give a relay email); sign-in times | Keep the same player across devices | Contract | Nobody | While the account exists. Guests inactive for 90 days are deleted |
| Profile | Display name, preset avatar, country, language | Show you in rooms, pick the catalog country and card language | Contract | Name and avatar: people in your rooms | While the account exists |
| Services | Streaming services you have | Only deal films you can watch | Contract | People in your rooms (the lobby shows each player's services) | While the account exists |
| Consents | Kind, wording version, dates | Prove consent was given | Legal obligation (GDPR art. 7(1)) | Nobody | While the account exists. **New**: a minimal proof after deletion, see [Starting values](#starting-values) |
| Letterboxd link and imports | Username, export date, sync times, the feed check result; films waiting to be matched | Connect and keep in sync | Consent | Nobody; "Letterboxd linked" shows in the lobby | While linked. Unmatched films 30 days |
| Letterboxd diary | Every diary entry: film, watched date, rating, rewatch | Your taste | Consent | Your rating of a film on that film's card back, and watchlist labels ("On Sam's watchlist"), in your rooms | While linked |
| Film history | Per film and source: seen, rating, watchlist, your Love it / It's fine / Not for me answers | Your taste and the seen rule | Contract; consent for Letterboxd rows | As the diary | While the account exists; Letterboxd rows while linked |
| Taste profile | Embedding, leanings by genre, decade, language, director and runtime, confidence | Personalised decks | Contract | Nobody. Never shown to others | While the account exists, rebuilt from scratch each time |
| Card memory (`card_history`) | Per film: times shown, liked and noped, last shown, how the game ended | Fresh decks between games ([deck engine](../architecture/deck-engine.md#card-memory)) | Contract | Nobody | 12 months after the last showing |
| Rooms and seats | Room settings, your seat's name snapshot, services, times, your after-game answer | Run the game, your history | Contract | People in that room | While the account exists. Seats become anonymous on deletion; lobbies that never start go after 7 days |
| Votes, matches, finale ballots | Each answer and its time | Run the game | Contract | Counts during the game; after the pick, in Party mode, who liked the runners-up ([game modes](game-modes.md#what-players-see-party-and-blind)) | While the account exists, anonymous after deletion |
| Swipe log | Every vote and undo, time on screen, whether the card was flipped | Improve the deck | Legitimate interest | Nobody | 13 months |
| Deal logs (`rec`) | Each card dealt with its score, features, model and experiment | Train and compare models | Legitimate interest | Nobody | Ranked cards 90 days, requests 13 months |
| Training exports | Deal logs joined to votes, with seat ids only | Train models | Legitimate interest, with an opt-out | Nobody | **New**: 24 months (the data model sets none) |
| Room taste | The room's live taste and dropped genres | The deck during the game | Contract | Nobody | With the room |
| Rate limits | Counters keyed by player id | Stop room codes being guessed | Legitimate interest (security) | Nobody | 1 day |
| Analytics (PostHog) | Anonymous events: screens, taps, timings; device model, OS, app version. No player id, no IP | Measure and fix the app | Exempt audience measurement, with an opt-out | Nobody | 25 months at most |
| Crash reports (Sentry) | Stack traces, device model, OS, app version. No names, codes, emails or IP | Fix crashes | Legitimate interest (**Lawyer**) | Nobody | Sentry's retention, set in [operations.md](../architecture/operations.md) |
| Server and database logs | Requests, errors, IP addresses | Security and operations | Legitimate interest | Nobody | Set in [security.md](../architecture/security.md) and [operations.md](../architecture/operations.md) |
| On the phone | Sign-in session, vote queue, settings | Keep you signed in, keep offline votes | Strictly necessary | Stays on the phone | Until sign-out or uninstall |
| "Did you watch it?" reminder | A local notification scheduled on the phone; no push token at launch | The follow-up | OS permission | Stays on the phone | Until it fires |

Not personal: `rec.title_stats` (per-film totals of in-app reactions) and `letterboxd_film_map` (Letterboxd film to TMDB film).

**What rooms reveal.** Inside a room, players see each other's names, avatars, services, whether Letterboxd is linked, a seated player's Letterboxd rating of the film on screen, watchlist labels, and after the pick in Party mode who liked the runners-up. Never anyone's swipes during the game, taste check answers, taste profile or games played with other people (the deck engine's [label rule](../architecture/deck-engine.md#reason-labels)).

## Legal bases

| Basis | Used for | Our reasoning |
| --- | --- | --- |
| Contract (GDPR art. 6(1)(b)) | Running the game, profiles, rooms, votes, the taste profile and personalised decks, card memory | The personalised deck is the service a player asks for. **Lawyer**: confirm personalisation fits under contract rather than consent |
| Legitimate interest (art. 6(1)(f)) | The swipe log, deal logs and training, crash reports, security logs and rate limits | Players expect the app to learn and work; data is pseudonymised, never shown or sold; players can object. Write down the balancing test with the DPIA |
| Consent (art. 6(1)(a)) | The Letterboxd import | Decided in [letterboxd.md](../integrations/letterboxd.md#connecting); disconnecting withdraws it |
| Legal obligation (art. 6(1)(c)) | Keeping proof of consent | |

**Storing and reading on the phone** falls under the French rules on trackers (article 82 of the French data protection act), separate from the bases above. The sign-in session and the vote queue are strictly necessary for the service the player asks for. Analytics are exempt when set up as below. Crash reports are a **Lawyer** question.

**Watch history and sensitive data.** What someone watches can hint at their sexual orientation or religion. The CJEU held in case C-184/20 (1 August 2022) that data which indirectly reveals such traits counts as sensitive data. We never infer, label or use such traits, never show a taste profile to anyone, and never use data for ads. **Lawyer**: confirm that recommendation-only use with these safeguards stays outside article 9.

## Consents

| Consent | Asked | Covers | Withdrawn by |
| --- | --- | --- | --- |
| Letterboxd import | On the explanation screen, before anything is uploaded ([onboarding](onboarding.md#letterboxd)). Stored with its wording version | Reading the export and the public feed; using the diary and watchlist for your taste and decks; showing your rating of a film on its card and watchlist labels in your rooms; derived scores in shared models, if Harry picks that option ([Training](#training-models-across-players)) | Disconnecting, which deletes it all |
| Notifications | The phone's own prompt, only after "Remind me tomorrow?" | The local reminder | The phone's settings |
| Identified analytics | Not at launch. Only if we ever want analytics tied to accounts, and never before the first game | | Settings |

**Settings switches**, all on by default and described in the privacy policy:
- "Help improve the app": anonymous analytics.
- "Use my games to improve recommendations for everyone": training (an objection, not a consent).
- "Show my Letterboxd ratings in my rooms".

## Analytics without a consent prompt

The CNIL exempts audience measurement from consent when it meets strict conditions (its page of 4 July 2025, which covers mobile apps):

| CNIL condition | Our setup |
| --- | --- |
| Purpose limited to measuring the app's audience, for the publisher only | Screens, taps, timings and errors, for our own statistics |
| Anonymous statistics only | No `identify` with the player id, no person profiles, IP capture off, no session replay, no capture of typed text |
| No cross-referencing with other processing; nothing non-anonymous passed to third parties | The analytics id is a random install id, never joined to the database |
| No tracking across apps or sites | One project, no shared identifiers |
| Recommended: tell users | The privacy policy, plus the Settings switch to opt out |
| Recommended: identifier lifetime around 13 months, not extended on each visit; data kept 25 months at most | The install id resets after 13 months; events deleted after 25 |
| Watch out for providers reusing data and for transfers outside the EU | PostHog EU Cloud in Frankfurt, data not reused by PostHog. **Lawyer**: PostHog is a US company |

Most of what we measure doesn't need analytics at all. Time to a pick, swipes per pick, repeat rate, rooms ending in a match and crews coming back come from our own game tables, which we hold to run the game anyway. PostHog only adds what happens between screens. The events themselves are designed in [analytics.md](analytics.md).

**Decided on 29 October 2026:** product analytics are on by default wherever the law allows, with an opt-out, and opt-in where consent is required; advertising measurement always needs consent. This exempt mode is the default in the EU, the UK and Switzerland, with an opt-in to identified analytics; elsewhere identified analytics run by default with an opt-out ([analytics.md](analytics.md#analytics-consent)). The UK and Switzerland have their own rules: **lawyer** to confirm that this mode fits them too.

## Crash reports

Sentry in its EU data region (Frankfurt), with personal data off: no IP, no names, room codes or emails in events or breadcrumbs. The basis is legitimate interest: a crashing app can't provide the service. **Lawyer**: whether the French tracker rules require consent for a crash reporting SDK. If they do, server-side errors stay reported and the app asks with nothing else, after the first game.

## Training models across players

**What's used.** The deal logs joined to votes (seat ids, never player ids, names or Letterboxd usernames) and per-film totals. After an account is deleted its seats no longer point at anyone, so its training rows can't be traced back.

**Basis.** Legitimate interest, with the Settings switch above: switching it off leaves that player's future games out of training exports. Kid profiles (later) are never in training.

**Letterboxd ratings in models trained across players** is the open question from [letterboxd.md](../integrations/letterboxd.md#using-the-data). The options:

| Option | What the shared model sees | Risk |
| --- | --- | --- |
| 1. Raw ratings | A player's Letterboxd ratings as features | Highest. Close to building a dataset from Letterboxd content |
| 2. Derived scores only | Numbers computed from the player's own profile (similarity, leanings), never the ratings themselves | Medium. The player's own content, used for their own decks, consented to |
| 3. Nothing from Letterboxd | Training rows computed without Letterboxd data | Lowest. Weaker models for Letterboxd players |

**Recommendation: option 2**, said plainly in the Letterboxd consent wording, pending a lawyer's read. Per-film Letterboxd totals stay ruled out whatever the option (Letterboxd's terms 6.8).

## Players' rights in practice

| Right | How | Guests |
| --- | --- | --- |
| Access and portability | Settings, then My data, then Export: `api.export_my_data` returns JSON with the profile, services, consents, Letterboxd link and diary, film history, taste leanings, card memory and the player's own votes | Same button |
| Erasure | Settings, then Delete my data: the server deletes the auth user and everything cascades; seats in past rooms become anonymous ([data model](../architecture/data-model.md#deleting-an-account-exporting-data)). For accounts made with Sign in with Apple, the server also revokes the Apple tokens, as Apple asks. A web page lets anyone request deletion without the app (Google Play requires one) | Same button, with no account needed |
| Rectification | Edit name, avatar and services; a new Letterboxd export; disconnect | Same |
| Objection | The training and analytics switches | Same |
| Withdrawing consent | Disconnect Letterboxd | |
| Complaint | The policy names the CNIL | |

- **Deadline**: one month from the request (GDPR art. 12(3)).
- **Email requests** go to a privacy address. A guest can't be identified by email, so guests are pointed to the in-app buttons.
- **Analytics and crash data** aren't in the export: they're not linked to the player.

## Children

| Situation | When | What applies | What we do |
| --- | --- | --- | --- |
| Kids join a friend's or parent's room as guests | Launch, France | General-audience app. France's age of digital consent is 15 (article 45 of the French data protection act): under 15, processing based on consent needs the minor's and a parent's joint consent. In our setup no consent-based processing touches guests: analytics are exempt and Letterboxd requires members to be 16 | Minimal data (a nickname and a preset avatar, no birth date or email), no ads ever, no chat beyond emoji reactions, guests deleted after 90 days without playing |
| Family profiles | Later, with Pro | The parent creates a kid profile; consent from the parent, jointly with the child under 15 if consent is the basis; profiling a child is a sensitive point | Nickname, avatar and birth year only; never in analytics or training; taste stays within the household; deleted by the parent. **Lawyer** and a DPIA update before building it |
| US players | Later | COPPA, amended rule in force since 23 June 2025, compliance due 22 April 2026: it applies to services directed at under-13s or with actual knowledge of collecting their data. Family profiles mean actual knowledge. The FTC's February 2026 policy statement eases age checks on mixed-audience services. Texas's app store age law applies to new Texas accounts from 4 June 2026, with Apple's Declared Age Range API | **Lawyer** before the US launch: age screen, verifiable parental consent for family profiles |
| UK players | Later | The ICO's Children's code, for services likely to be used by under-18s | Its standards, high-privacy defaults, a DPIA |
| France's under-15 social network law | Adopted 21 July 2026 | Aimed at online social networks | MovieMatch has no public profiles, posts, feed or messaging. **Lawyer**: confirm it's out of scope, and recheck when crews arrive |

**Stores.**
- **Apple**: not in the Kids Category, as decided in [monetization.md](monetization.md#kids-safety-and-privacy). Guideline 5.1.4 says apps that collect personal data from a minor need a privacy policy and must follow children's privacy laws. Guideline 2.3.8 forbids metadata implying the main audience is children, so no "for kids" wording in the listing ([store-listing.md](store-listing.md)).
- **Google Play**: the Target audience and content form decides whether the Families policy applies (a neutral age screen for mixed audiences, approved SDKs only), and misstating it can get the app removed. Recommended: declare 13 and over at launch, with no kid-focused store marketing until family profiles exist, then revisit.

## Letterboxd

What its terms say (updated October 2026, read today):

| Section | Says | For us |
| --- | --- | --- |
| 4 | Members must be at least 16 | No Letterboxd for kid profiles |
| 11 | Members remain the owners of their Posted Content | The import is the member's own content |
| 6.8 | No exporting content "except your own Posted Content"; no "index of any significant portion of the Service content" | Import only from the member's own export; no pooled per-film Letterboxd scores |
| 6.11 | No robot, scraper or "automated data gathering or extraction tool" except as explicitly authorised | We read only the member's own public RSS feed, at their request, a few times a day, with conditional requests. **Lawyer**: confirm reading a published feed this way is fine |
| 6.4 | No recreating features exclusive to paid accounts | Letterboxd features stay free ([monetization](monetization.md#constraints)) |
| (none) | Nothing on AI or machine learning | The shared-model question stays a judgement call ([options](#training-models-across-players)) |

## TMDB and JustWatch

Obligations from [tmdb.md](../integrations/tmdb.md#terms-licence-and-attribution), as legal requirements:
- The TMDB logo and notice in About.
- A JustWatch credit wherever we show where a film can be watched.
- Nothing from TMDB kept longer than 6 months.
- **The machine-learning clause** (TMDB terms 1.C and 2.A): using TMDB content "in connection with" an ML or AI application needs TMDB's commercial agreement. The deck engine likely counts, so email TMDB before building the catalog.
- No personal data is ever sent to TMDB.

## Who processes data for us

| Service | Role | Gets | Where | Transfer basis |
| --- | --- | --- | --- | --- |
| Supabase | Processor | The database, sign-in, realtime: everything in the data map | An EU region we choose: Paris (`eu-west-3`) recommended. Supabase notes a region is "a data-location control, not proof of regulatory compliance" | DPA with the EU standard contractual clauses (Supabase is a US company) |
| Recommendation server host | Processor | Database access, Letterboxd feeds | EU, chosen in [server-structure.md](../architecture/server-structure.md) | Its DPA |
| Object storage | Processor | Models and training exports (seat ids) | EU | Its DPA |
| Sentry | Processor | Crash reports | EU data region, Frankfurt. Sentry says some data types may still be stored in the US | Its DPA |
| PostHog | Processor | Anonymous events | EU Cloud, Frankfurt (AWS `eu-central-1`) | Its DPA |
| Expo (EAS Update) | Processor | The OS and random tokens when the app checks for an update; no push tokens since we don't use Expo's push service | US | EU-US Data Privacy Framework and standard contractual clauses (Expo's policy of 21 October 2025) |
| Apple, Google | Independent controllers | The identity when a player saves an account; store data | | Their terms |
| Letterboxd | Independent controller | Sees our server fetch the member's public feed | | |
| TMDB | Not a processor | No personal data | | |

Later: RevenueCat with Pro, a push provider if push notifications arrive.

## Store privacy forms

**Apple App Privacy**, with no tracking:

| Data type | Linked to the player | Purposes |
| --- | --- | --- |
| Contact Info: Name (display name), Email Address (saved accounts) | Yes | App Functionality |
| User Content: Gameplay Content (votes, rooms), Other User Content (Letterboxd diary, film answers) | Yes | App Functionality, Product Personalization |
| Identifiers: User ID | Yes | App Functionality |
| Identifiers: Device ID (the anonymous analytics install id) | No | Analytics |
| Usage Data: Product Interaction | No | Analytics |
| Diagnostics: Crash Data, Performance Data | No | App Functionality |

**Google Play Data safety**:

| Category | Data type | Required or optional | Purposes |
| --- | --- | --- | --- |
| Personal info | Name (Google counts a nickname) | Required | App functionality |
| Personal info | Email address | Optional (saved accounts only) | Account management |
| App activity | Other actions (likes, gameplay) | Required | App functionality, Personalization |
| App activity | Other user-generated content (Letterboxd import) | Optional | Personalization |
| App activity | App interactions | Optional (opt-out switch) | Analytics |
| App info and performance | Crash logs, Diagnostics | Required | App functionality |
| Device or other IDs | The analytics install id | Optional | Analytics |

- **Shared with third parties**: none. Google doesn't count service providers as sharing.
- **Encrypted in transit**: yes, everything over TLS.
- **Deletion**: in the app and through the web page.

The final answers are filled in with [store-listing.md](store-listing.md).

## Privacy policy outline

In French and English, on the website, linked from the app's Settings and both store listings. Plain words, short sections:

1. **Who we are** and how to reach us: a privacy email address.
2. **What we collect**: the data map, summarised in one table.
3. **Why, and on what basis**: one line per use.
4. **Letterboxd**: what's read, what isn't, what others in your rooms can see, how to disconnect.
5. **What other players see** in rooms.
6. **Analytics and crash reports**: anonymous, how to switch analytics off.
7. **Training**: how your games improve the app, how to opt out.
8. **Who processes data for us, and where**: EU, except Expo in the US, with the transfer basis.
9. **How long we keep it**: the retention column.
10. **Your rights and how to use them**: the in-app buttons, the email address, the web deletion page, the one-month deadline, the right to complain to the CNIL.
11. **Children**: general audience; under 15, with a parent's agreement; no ads, no tracking.
12. **Changes to this policy** and its date.

## Terms of use outline

1. **Who can use it**: general audience; players under 15 with a parent's agreement.
2. **Guests and accounts**: what each keeps; that deleting the app loses a guest's history.
3. **Fair use**: no guessing room codes, no automation, no abuse; display names must not be offensive, and we may reset one.
4. **What the app does and doesn't promise**: recommendations and where-to-watch information from TMDB and JustWatch can be wrong or out of date; no guarantee a film is on a service tonight.
5. **Other services**: Letterboxd and the streaming services aren't ours; their terms apply.
6. **Intellectual property**: film data and posters from TMDB; the app itself.
7. **Paid plans** (later, with Pro): prices, renewals and cancellation through the stores.
8. **Liability**, within what consumer law allows. **Lawyer**.
9. **Ending use and deletion.**
10. **Changes, governing law, disputes.** **Lawyer**: consumer protections, and whether a consumer mediator must be named once paid plans exist.

## French specifics

- **The web join page** stores only the sign-in session, which is strictly necessary, so no banner is needed. If anything non-exempt is ever added there, it needs a consent banner first.
- **Record of processing** and **DPIA**: see [Who is responsible](#who-is-responsible).
- **Breach notification**: the process (72 hours to tell the CNIL) is in [security.md](../architecture/security.md).

## Questions for a lawyer

Bring this list, the data map and the draft policy and terms to one meeting:

1. **Analytics**: does our PostHog setup (EU Cloud, anonymous, opt-out) fit the CNIL's audience measurement exemption, so no consent prompt? Does PostHog being a US company change that?
2. **Crash reports**: can Sentry (EU region, no personal data) run without consent under article 82?
3. **Bases**: is contract right for personalised decks, and legitimate interest with an opt-out right for training across players? Please review the balancing test.
4. **Letterboxd**: can derived scores from a member's imported ratings feed a model trained across players, given Letterboxd's terms (6.8, 11) and the member's consent? Is reading the member's own public RSS feed at their request compatible with 6.11?
5. **Sensitive data**: given CJEU C-184/20, does watch history used only for recommendations, never inferred or labelled, stay outside article 9?
6. **Children**: is the general-audience design with guests sound for France? What do family profiles need (joint consent under 15, profiling a child)? What should the age screen and parental consent look like before the US launch? Is France's July 2026 under-15 social network law out of scope for us?
7. **Retention**: how long to keep proof of consent after an account is deleted, and is 24 months right for training exports?
8. **Who publishes**: individual or company, given the store accounts, the TMDB agreement and the privacy policy must match.
9. **Terms of use**: liability limits, governing law, a consumer mediator once paid plans exist.

## Changes this asks elsewhere

| Where | Change |
| --- | --- |
| [app-structure.md](../architecture/app-structure.md#analytics-and-crash-reports) | Analytics in anonymous mode (no `identify` with the player id, no person profiles, IP off, no replay), on by default with an opt-out, instead of off until consent. Settings switches for analytics, training and showing Letterboxd ratings. "Delete my data" and "Export" for guests too. Sign in with Apple token revocation on deletion |
| [data-model.md](../architecture/data-model.md) | `profiles.training_opt_out` and `profiles.show_letterboxd_ratings`, both read by the server. Retention: training exports 24 months, a minimal consent proof after deletion. `api.export_my_data` includes card memory. A deletion request path for the web page |
| [onboarding.md](onboarding.md#letterboxd) | The Letterboxd consent wording says what rooms see and, under option 2, that derived scores help everyone's recommendations. No analytics prompt anywhere |
| [decisions.md](../decisions.md) | The default "PostHog stays off until analytics consent" is replaced if Harry agrees |
| [analytics.md](analytics.md) | Events designed for anonymous mode; game metrics from the database |
| [security.md](../architecture/security.md) | Log retention, IP handling, breach process, how Apple tokens are obtained for revocation |
| [store-listing.md](store-listing.md) | The privacy forms above, the policy and deletion URLs, no "for kids" wording |
| [operations.md](../architecture/operations.md) | Supabase in Paris, Sentry and PostHog EU projects, retention settings |
| [monetization.md](monetization.md#kids-safety-and-privacy) | Family profiles wait on a lawyer's read and a DPIA update |

## Starting values

Placeholders, to confirm with a lawyer.

| Value | Start |
| --- | --- |
| Training exports kept | 24 months |
| Analytics install id lifetime | 13 months, then reset (CNIL recommendation) |
| Analytics events kept | 25 months (CNIL recommendation) |
| Minimal consent proof after account deletion | 5 years |
| Guests deleted after | 90 days without activity (data model) |
| Answer to a rights request | Within 1 month |

## Sources checked

All on 29 October 2026:

- CNIL, [audience measurement tools exempt from consent](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience) (page dated 4 July 2025): conditions, 13 and 25 months, mobile apps included
- CNIL, [minors' digital rights consultation](https://www.cnil.fr/fr/la-cnil-lance-une-consultation-publique-sur-les-droits-des-mineurs-dans-lenvironnement-numerique) and [results](https://www.cnil.fr/fr/droits-numeriques-des-mineurs-la-cnil-publie-les-resultats-du-sondage-et-de-la-consultation-publique): consent alone from 15 for consent-based processing, joint consent below
- CNIL, [DPIA criteria infographic](https://www.CNIL.fr/sites/cnil/files/atoms/files/infographie_aipd.pdf): profiling and vulnerable people among the criteria
- FTC, [COPPA rule page](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa); [Davis Polk on the amended rule](https://www.davispolk.com/insights/client-update/ftc-prioritizes-coppa-enforcement-new-compliance-obligations-take-effect) (in force 23 June 2025, compliance by 22 April 2026); [Hunton on the February 2026 age verification policy statement](https://www.hunton.com/privacy-and-cybersecurity-law-blog/tag/coppa)
- [Letterboxd terms of use](https://letterboxd.com/legal/terms-of-use/) (updated October 2026): sections 4, 6.4, 6.8, 6.11, 11
- [Supabase regions](https://supabase.com/docs/guides/platform/regions) and [data processing addendum](https://supabase.com/legal/customer-resources/data-processing-addendum)
- [Sentry data storage location](https://docs.sentry.io/organization/data-storage-location/): EU in Frankfurt, some data may be stored in the US
- [PostHog data storage](https://posthog.com/docs/privacy/data-storage) and [GDPR guide](https://posthog.com/docs/privacy/gdpr-compliance): EU Cloud in Frankfurt, IP capture controls
- [Expo privacy policy](https://expo.dev/privacy) (21 October 2025): EAS Update data, Data Privacy Framework; [subprocessors](https://expo.dev/privacy/subprocessors) (dated 7 August 2023)
- Apple: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (1.3, 2.3.8, 4.8, 5.1.1(v), 5.1.4); [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/); [account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) and [WWDC22 on token revocation](https://developer.apple.com/videos/play/wwdc2022/10122/)
- Google Play: [account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [Data safety data types](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), [Families policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)
- CJEU C-184/20, through commentary ([Inside Privacy](https://www.insideprivacy.com/eu-data-protection/special-category-data-by-inference-cjeu-significantly-expands-the-scope-of-article-9-gdpr/)); the judgment text itself wasn't read
- ICO Children's code, through commentary ([Inside Privacy](https://www.insideprivacy.com/childrens-privacy/uk-ico-provides-guidance-on-when-a-service-is-likely-to-be-accessed-by-children-and-needs-to-comply-with-its-age-appropriate-design-code/)); check the ICO's current guidance before the UK launch
- France's under-15 social network law, adopted 21 July 2026, through the press ([Médias24](https://medias24.com/2026/07/22/reseaux-sociaux-la-france-interdit-lacces-aux-moins-de-15-ans-1728491/)); the final text on Légifrance wasn't read
- Texas app store age law and Apple, through the press ([9to5Mac, 3 June 2026](https://9to5mac.com/2026/06/03/apple-says-texas-app-store-age-assurance-rules-start-tomorrow-after-court-ruling/))
- [TMDB API terms of use](https://www.themoviedb.org/api-terms-of-use) (last updated 20 October 2023): sections 1.C and 2.A

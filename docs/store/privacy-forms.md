# Store privacy forms

The answers for Apple's App Privacy questionnaire (App Store Connect) and Google's Data safety form (Google Play Console), for the first release, field by field in the order each console asks. Written on 6 November 2026 (roadmap task M11.6). Harry copies them into the consoles: App Store Connect now, Google Play once its app exists.

The answers come from the published privacy policy (`mobile/src/content/legal/privacy.en.ts` and `privacy.fr.ts`, sections 2, 3, 6, 8 and 9) and were checked against the code: the analytics wrapper (`mobile/src/lib/analytics.ts`, `analytics-core.ts`, `analytics-region.ts`), the crash reporter (`mobile/src/lib/sentry.ts`, `sentry-scrub.ts`), the app config (`mobile/app.config.ts`) and the database (`supabase/migrations/`). Where a doc and the code disagreed, the code won. The starting tables were in [privacy.md](../product/privacy.md#store-privacy-forms), which now points here. Decisions: [decisions.md](../decisions.md) ("The first release is the bare minimum", "Analytics by region", "Crash reports carry no user, profile or seat id", "The app's Sentry sends errors only", "M9.1 (Q1.3)", "M8.3: the legal pages"). Q6.1 to Q6.7 below are its "M11.6 App Privacy and Data safety" row; the choices this file made on top are its next row and [Defaults taken](#defaults-taken).

`mobile/privacy-forms.test.ts` keeps the facts these answers rest on: no package that reads location, contacts, photos, the camera or the advertising id; no Android permission behind an undeclared type; no tracking on iOS; PostHog with no lifecycle events, replay, surveys, crash capture or IP location. If the app starts collecting something new, this file and the privacy policy change first, in the same pull request.

## Contents

1. [What leaves the phone](#what-leaves-the-phone)
2. [App Store Connect · App Privacy](#app-store-connect--app-privacy)
3. [Google Play Console · App content · Data safety](#google-play-console--app-content--data-safety)
4. [Where each line of the policy goes](#where-each-line-of-the-policy-goes)
5. [Not declared, and why](#not-declared-and-why)
6. [Defaults taken](#defaults-taken)
7. [For Harry to check outside this file](#for-harry-to-check-outside-this-file)
8. [Sources checked](#sources-checked)

## What leaves the phone

| Where it goes | What | Linked to the profile? | Code |
| --- | --- | --- | --- |
| Supabase (our database and sign-in) | The profile (random id, name, colour, language, country), services, rooms, seats, answers, Final Cut votes, the card log, My films, the stats choice, reports, abuse counters. Sign-in sessions and Supabase Auth's audit log record the IP address and the app's user agent | Yes | `supabase/migrations/` (`profiles`, `profile_providers`, `room_members`, `votes`, `round_ballots`, `swipe_log`, `user_titles`, `consents`, `member_reports`, `rate_limits`) |
| PostHog (usage stats) | Screens, a few actions, timings (`game:first_card_view` carries `ms_since_swiping`), with language, country, a games-played range, device model, OS, app version, time zone. A random install id in the EEA, the UK and Switzerland; the profile id with "Detailed stats" or elsewhere. No IP location (`disableGeoip`) | Sometimes: with "Detailed stats" or outside Europe | `lib/analytics.ts`, `analytics-core.ts` |
| Sentry (crash reports) | Crashes and errors with a stack trace, the device model, OS and app version; app hang reports (iOS) and "not responding" reports (Android), and crash-free session counts, which are Sentry's defaults and not turned off; a random installation id Sentry makes on first launch. No user (`beforeSend` deletes it), `sendDefaultPii: false`, no tracing | No | `lib/sentry.ts`, `sentry-scrub.ts` |
| Expo (app updates) | When the app checks for an update: the OS, a random token and the IP address | No | `app.config.ts` (`updates.url`) |

Nothing reaches an advertising network or a data broker. The iOS privacy manifest says `NSPrivacyTracking: false` (tested in `app.config.test.ts`). No phone in a room capped under 13 sends any usage stats (decisions.md, "M9.1 (Q1.3)"); this changes no answer below, since the forms describe the app as a whole.

## App Store Connect · App Privacy

App Store Connect > Apps > Flimme > App Privacy (sidebar) > Get Started. Apple's terms: "collect" is "transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time", and third-party partners include "third-party SDKs" ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/), checked 6 November 2026). So PostHog, Sentry and Expo count as ours.

### Data collection

| Question | Answer | Why |
| --- | --- | --- |
| Do you or your third-party partners collect data from this app? | Yes, we collect data from this app | The profile, games and usage stats leave the phone (policy section 2) |

### Data types to tick

Tick these nine, and nothing else:

| Category | Data type |
| --- | --- |
| Contact Info | Name |
| User Content | Gameplay Content |
| Identifiers | User ID |
| Identifiers | Device ID |
| Usage Data | Product Interaction |
| Usage Data | Other Usage Data |
| Diagnostics | Crash Data |
| Diagnostics | Performance Data |
| Other Data | Other Data Types |

Then App Store Connect asks three questions for each ticked type: what it is used for (the purposes), whether it is linked to the user's identity, and whether it is used for tracking. App Store Connect needs a login, so the wording on screen wasn't checked; the three questions follow the sections "Data use", "Data linked to the user" and "Tracking" of Apple's guide.

### Every data type, in Apple's order

"Linked" means linked to the user's identity. Apple counts data as linked unless identifiers are stripped before collection and it is never tied back to the user.

| Category | Data type | Collected | Linked to you | Used for tracking | Purposes | Why |
| --- | --- | --- | --- | --- | --- | --- |
| Contact Info | Name | Yes | Yes | No | App Functionality | The name or nickname the player picks, on the profile and on each seat, shown to the room (policy sections 2 and 5). Never sent to PostHog or Sentry |
| Contact Info | Email Address | No | | | | No account, no email field (policy section 2). Support emails: see [Not declared](#not-declared-and-why) |
| Contact Info | Phone Number | No | | | | Never asked |
| Contact Info | Physical Address | No | | | | Never asked |
| Contact Info | Other User Contact Info | No | | | | Nothing that reaches the player outside the app |
| Health & Fitness | Health | No | | | | |
| Health & Fitness | Fitness | No | | | | |
| Financial Info | Payment Info | No | | | | Free, no purchases |
| Financial Info | Credit Info | No | | | | |
| Financial Info | Other Financial Info | No | | | | |
| Location | Precise Location | No | | | | No location permission (`mobile/privacy-forms.test.ts`) |
| Location | Coarse Location | No | | | | The country is the phone's region setting, and IP addresses are never used to locate anyone (Q6.4). Declared under Other Data Types |
| Sensitive Info | Sensitive Info | No | | | | The films a player likes say nothing the app asks about; the policy says we draw no conclusions about private life from them (section 3) |
| Contacts | Contacts | No | | | | No contacts permission; invites go through the share sheet |
| User Content | Emails or Text Messages | No | | | | No messaging between players (policy section 5) |
| User Content | Photos or Videos | No | | | | Avatars are colours from a list, never a photo |
| User Content | Audio Data | No | | | | The app plays sounds, never records (`app.config.test.ts`) |
| User Content | Gameplay Content | Yes | Yes | No | App Functionality, Analytics, Product Personalization | Rooms and their settings; each seat (name snapshot, colour, services that night, how the player arrived); answers (Like, Nope, Super like, Seen it) and when; Final Cut votes; tonight's pick; the card log (place, score, answer, undo, time looked); My films; the services a player has; reports (a reason from a list). Analytics: the card log compares ways of building the deck (policy sections 3 and 7). Personalization: My films keeps seen films out of the next decks, and solo decks skip liked films (section 3) |
| User Content | Customer Support | No | | | | Support is an email from the player's own mail app: see [Not declared](#not-declared-and-why) |
| User Content | Other User Content | No | | | | No free text anywhere: names are under Name, report reasons come from a list |
| Browsing History | Browsing History | No | | | | Trailers open on YouTube and "where to watch" in the system browser; the app sees nothing there |
| Search History | Search History | No | | | | The app has no search |
| Identifiers | User ID | Yes | Yes | No | App Functionality, Analytics | The profile's random id and the sign-in user id, used for sign-in, rooms and abuse counters. Analytics: with "Detailed stats", or outside Europe, usage stats carry the profile id (policy section 6, `analytics-core.ts` calls `identify`) |
| Identifiers | Device ID | Yes | No | No | Analytics, App Functionality | Three random ids, none joined to the profile: PostHog's anonymous install id, replaced every 13 months and "never linked to your profile" (policy section 6, Q6.2); Expo's update token, which Expo says is "used to determine if an installation of the app has requested an update" (policy section 8); Sentry's installation id, which groups crash sessions. Analytics for the first two (audience, installs), App Functionality for the last two (updates, crashes) |
| Purchases | Purchase History | No | | | | Free, nothing to buy |
| Usage Data | Product Interaction | Yes | Yes | No | Analytics | The screens opened and a few actions (creating a room, sharing an invite, joining), with language, country, a games-played range, model, OS, app version and time zone (policy section 6). Linked because "Detailed stats" and every player outside Europe send the profile id (Q6.1). No autocapture, no session replay, no lifecycle events (`lib/analytics.ts`, tested) |
| Usage Data | Advertising Data | No | | | | No ads |
| Usage Data | Other Usage Data | Yes | Yes | No | App Functionality | When the profile was created and last used, on the profile (policy section 2, "Your sign-in"). A profile unused for 90 days is deleted (section 9) |
| Diagnostics | Crash Data | Yes | No | No | App Functionality | Sentry's crash and error reports and its crash-free session counts: the error, where in the code, model, OS, app version, and Sentry's random installation id. No user, name, code, email or profile id (policy section 6, `sentry-scrub.ts`). Q6.6 |
| Diagnostics | Performance Data | Yes | Yes | No | Analytics, App Functionality | Two things. The usage stats carry timings: `game:first_card_view` measures how long the first card takes to appear (analytics.md's "Under 1 second" target), and these can be linked like Product Interaction. Sentry's defaults also report app hangs (iOS) and "not responding" (Android), not linked. Apple's example for this type is "launch time, hang rate". A default taken against Q6.6: see [Defaults taken](#defaults-taken) |
| Diagnostics | Other Diagnostic Data | No | | | | Sentry sends no performance tracing, logs, screenshots or view hierarchy (`lib/sentry.ts`, tested) |
| Surroundings | Environment Scanning | No | | | | |
| Body | Hands | No | | | | |
| Body | Head | No | | | | |
| Other Data | Other Data Types | Yes | Yes | No | App Functionality, Analytics, Other Purposes | The phone's country and language, saved on the profile and sent with usage stats; IP addresses and the app's user agent in sign-in sessions and Supabase Auth's audit log, in abuse counters as a hash, and in Supabase's request logs for 7 days; the stats choice, its date and the wording version. App Functionality: the catalog and the card language, security. Analytics: country and language on usage stats. Other Purposes: keeping proof of the stats choice, a legal duty Apple's list doesn't name (policy section 3) |

### Tracking

| Question | Answer | Why |
| --- | --- | --- |
| Used for tracking, for every type above | No | No ads, no data broker, nothing joined with other companies' data (policy, "The short version"). `NSPrivacyTracking: false` (`app.config.ts`, tested). So no App Tracking Transparency prompt |

### The label this produces

- **Data Used to Track You:** none.
- **Data Linked to You:** Contact Info (Name), User Content (Gameplay Content), Identifiers (User ID), Usage Data (Product Interaction, Other Usage Data), Diagnostics (Performance Data), Other Data.
- **Data Not Linked to You:** Identifiers (Device ID), Diagnostics (Crash Data).

Check the Product Page Preview shows this, then Publish. The privacy policy URL on the same page is in M11.9's walkthrough.

## Google Play Console · App content · Data safety

Google Play Console > Flimme > App content > Data safety > Start (Google's path in its [Data safety help](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), checked 6 November 2026). The form has five steps: Overview, Data collection and security, Data types, Data usage and handling, Store listing preview.

Google's terms: "'Collect' means transmitting data from your app off a user's device", including data sent by SDKs. "Sharing" is a transfer to a third party, but not to a service provider, an "entity that processes user data on behalf of the developer". Supabase, Fly.io, Tigris, GitHub, Sentry, PostHog and Expo are all service providers under a processing agreement (policy section 8), so **nothing is shared**.

### Data collection and security

| Question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | Yes | See the data types below |
| Is all of the user data collected by your app encrypted in transit? | Yes | Supabase, PostHog (`https://eu.i.posthog.com`), Sentry, Expo (`https://u.expo.dev`) and our server are all reached over HTTPS, and the game's live updates over secure WebSockets |
| Which of the following methods of account creation does your app support? | Other (pick the option for other methods; not username and password, not OAuth) | The app creates a guest profile on first launch, with no email or password (policy section 2). Q6.7: answered as an account, so the deletion rules apply. The option names weren't checkable without the console |
| Delete account URL | `https://flimme.com/en/delete-account` (below) | The deletion request page, live since M8.3. Google wants it to "reference the app or developer name" and to let users ask "without sending the user back to the app" ([account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), checked 6 November 2026). Checked on 6 November 2026: it loads (HTTP 200), and the live page's text ("If you deleted the app or lost your phone", "Ask to delete my account") is in its bundle |
| Can users ask to delete some of their data without deleting their account? (if the form asks) | No | My films can remove a film in the app (`api.remove_my_film`), but no web page describes a partial deletion, and a Yes asks for a link |
| Independent security review | No | None done |
| Committed to follow the Play Families Policy | No | The app isn't aimed at children: target audience 13 and over (M11.5) |

#### Delete account URL · all (URL)

```text
https://flimme.com/en/delete-account
```

### Every data type, in Google's order

For each collected type, the form asks: "Is this data collected, shared, or both?", "Is this data processed ephemerally?", "Is this data required for your app, or can users choose whether it's collected?" and "Why is this user data collected?". Google: "'Optional' includes the ability to opt into or opt out of data collection". A type with any part that can't be turned off is Required.

| Category | Data type | Collected | Shared | Processed ephemerally | Required or optional | Purposes | Why |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Location | Approximate location | No | | | | | Google: declare location when IP addresses "are used to infer location". Ours never are: PostHog has `disableGeoip` and the project discards IPs; the country is the phone's region setting (Q6.4) |
| Location | Precise location | No | | | | | No location permission (`mobile/privacy-forms.test.ts`) |
| Personal info | Name | Yes | No | No | Required | App functionality | Google counts a nickname ("How a user refers to themselves, such as their first or last name, or nickname"). The name is needed to play (policy section 2) |
| Personal info | Email address | No | | | | | No account, no email field. Support emails: see [Not declared](#not-declared-and-why) |
| Personal info | User IDs | Yes | No | No | Required | App functionality, Analytics, Account management | "Identifiers that relate to an identifiable person. For example, an account ID": the profile id and the sign-in user id. Analytics: usage stats with "Detailed stats" or outside Europe. Account management: the guest profile is the account (Q6.7) |
| Personal info | Address | No | | | | | |
| Personal info | Phone number | No | | | | | |
| Personal info | Race and ethnicity | No | | | | | |
| Personal info | Political or religious beliefs | No | | | | | |
| Personal info | Sexual orientation | No | | | | | |
| Personal info | Other info | Yes | No | No | Required | App functionality, Analytics | The phone's country and language, saved on the profile at first launch: they pick the catalog and the card language, and go with usage stats (policy sections 2 and 6) |
| Financial info | User payment info | No | | | | | Free, no purchases |
| Financial info | Purchase history | No | | | | | |
| Financial info | Credit score | No | | | | | |
| Financial info | Other financial info | No | | | | | |
| Health and fitness | Health info | No | | | | | |
| Health and fitness | Fitness info | No | | | | | |
| Messages | Emails | No | | | | | |
| Messages | SMS or MMS | No | | | | | |
| Messages | Other in-app messages | No | | | | | No messaging between players (policy section 5) |
| Photos and videos | Photos | No | | | | | Avatars are colours from a list |
| Photos and videos | Videos | No | | | | | |
| Audio files | Voice or sound recordings | No | | | | | The app never records (`app.config.test.ts`) |
| Audio files | Music files | No | | | | | |
| Audio files | Other audio files | No | | | | | |
| Files and docs | Files and docs | No | | | | | "Download my data" builds a file from the player's own data and hands it to the share sheet; nothing is uploaded |
| Calendar | Calendar events | No | | | | | |
| Contacts | Contacts | No | | | | | Invites go through the share sheet |
| App activity | App interactions | Yes | No | No | Optional | Analytics | The screens and a few actions sent to PostHog (policy section 6). Optional: Settings, "Help improve the app" turns it off (Q6.5) |
| App activity | In-app search history | No | | | | | The app has no search |
| App activity | Installed apps | No | | | | | |
| App activity | Other user-generated content | No | | | | | No free text: names are under Name, report reasons come from a list |
| App activity | Other actions | Yes | No | No | Required | App functionality, Analytics, Personalization, Fraud prevention, security, and compliance | "Any other user activity or actions in-app not listed here such as gameplay, likes, and dialog options": rooms, seats, answers, Final Cut votes, tonight's pick, the card log, My films, services, the colour, reports, the stats choice, when the profile was created and last used. Analytics: the card log compares decks. Personalization: seen films stay out of the next decks. Fraud prevention, security, and compliance: reports, and the proof of the stats choice (Q6.3) |
| Web browsing | Web browsing history | No | | | | | Trailers and "where to watch" open outside the app |
| App info and performance | Crash logs | Yes | No | No | Required | App functionality, Analytics | Sentry's crash and error reports and crash counts (policy section 6). Analytics, since Google's covers "how it performs" |
| App info and performance | Diagnostics | Yes | No | No | Required | App functionality, Analytics | "Information about the performance of your app. For example battery life, loading time, latency": Sentry's app hang and "not responding" reports with the device details, and the usage stats' timing to the first card. Required, since Sentry's part can't be turned off (Q6.6) |
| App info and performance | Other app performance data | No | | | | | Covered by the two above |
| Device or other IDs | Device or other IDs | Yes | No | No | Required | App functionality, Analytics, Fraud prevention, security, and compliance | "Identifiers that relate to an individual device, browser or app", Google's examples including a Firebase installation ID: PostHog's anonymous install id (Analytics, can be turned off), Expo's update token and Sentry's installation id (App functionality), and IP addresses in sign-in sessions, the audit log, abuse counters and request logs (Fraud prevention, security, and compliance, Q6.4). Required because Expo's token and the IP can't be turned off |

### Preview

The store listing preview should show: no data shared with third parties; data collected: Personal info, App activity, App info and performance, Device or other IDs; data encrypted in transit; you can request that data be deleted. Then Submit.

## Where each line of the policy goes

Every row of the policy's section 2 table and every provider in section 8, with where it lands on each form.

| Policy line | App Store Connect | Google Play |
| --- | --- | --- |
| Your profile: the random id | Identifiers > User ID | Personal info > User IDs |
| Your profile: the name | Contact Info > Name | Personal info > Name |
| Your profile: the colour | User Content > Gameplay Content | App activity > Other actions |
| Your profile: language and country | Other Data > Other Data Types | Personal info > Other info |
| Your sign-in: created and last used | Usage Data > Other Usage Data | App activity > Other actions |
| Your sign-in: IP address and the app's technical identification | Other Data > Other Data Types | Device or other IDs |
| Your services | User Content > Gameplay Content | App activity > Other actions |
| Your games (rooms, seats, answers, Final Cut votes, the pick, solo sessions) | User Content > Gameplay Content (the seat's name under Name) | App activity > Other actions |
| The card log | User Content > Gameplay Content | App activity > Other actions |
| My films | User Content > Gameplay Content | App activity > Other actions |
| Your stats choice | Other Data > Other Data Types | App activity > Other actions |
| Reports | User Content > Gameplay Content | App activity > Other actions |
| Abuse limits (profile id, hashed IP) | Identifiers > User ID; Other Data > Other Data Types | Personal info > User IDs; Device or other IDs |
| Usage stats | Usage Data > Product Interaction; Diagnostics > Performance Data (timings); Identifiers > Device ID (anonymous) or User ID (identified); Other Data (country, language) | App activity > App interactions; App info and performance > Diagnostics (timings); Device or other IDs; Personal info > User IDs; Personal info > Other info |
| Crash reports | Diagnostics > Crash Data and Performance Data (hangs); Identifiers > Device ID (Sentry's id) | App info and performance > Crash logs and Diagnostics; Device or other IDs |
| Technical logs (requests with the IP) | Other Data > Other Data Types | Device or other IDs |
| On your phone | Not collected | Not collected |
| Supabase | Processor: everything in the database rows above | Service provider: not sharing |
| Fly.io | Processor: account deletion, the catalog, game stats. No new type | Service provider: not sharing |
| Tigris | Processor: the encrypted weekly backup. No new type | Service provider: not sharing |
| GitHub | Processor: makes and encrypts the backup. No new type | Service provider: not sharing |
| Sentry | Third-party partner: Crash Data, Performance Data, Device ID | Service provider: Crash logs, Diagnostics, Device or other IDs |
| PostHog | Third-party partner: Product Interaction, Performance Data, Device ID, User ID, Other Data | Service provider: App interactions, Diagnostics, Device or other IDs, User IDs, Other info |
| Expo | Third-party partner: Device ID (the update token), Other Data (the IP) | Service provider: Device or other IDs |

## Not declared, and why

| What | Why it isn't a declared type |
| --- | --- |
| On your phone (the encrypted session, unsent votes, the next game's cards, settings, the anonymous stats id until it is sent) | Stays on the phone. Apple: data "processed only on device is not 'collected'"; Google: "only processed locally on the user's device" isn't collection. The stats id is declared when it goes out with an event |
| Support emails (what a player writes to support@flimme.com, and their address) | The app only opens the player's own mail app, with the subject, the app version and the OS filled in; the player writes and sends it, or not. Nothing leaves through the app, and Apple names "customer service requests that are unrelated to the primary purpose of the app" as data that may not need disclosing. Not covered by any form answer above (see [Defaults taken](#defaults-taken)) |
| The room code a player pastes | Read from the clipboard only when the player taps Paste, then sent as the code to join: part of Gameplay Content |
| TMDB's image servers | The phone downloads posters and logos from them, so they see its IP address "like any website" (policy section 8). No TMDB code is in the app and we send TMDB nothing: neither a third-party partner (Apple) nor a collection by the app (Google) |
| YouTube and TMDB's "where to watch" pages | Opened outside the app, by the player's choice; their own policies apply (policy section 8). No webview the app controls |
| Apple and Google | They distribute the app under their own terms; we send them no game data (policy section 8). Apple: "You are not responsible for disclosing data collected by Apple" |
| flimme.com | Measures no audience and keeps no visit log (policy section 8) |
| Letterboxd, accounts with Apple or Google, emails, notifications | Not in the first release (policy section 2). Added to both forms when they ship |

## Defaults taken

Choices no decision covered. Each takes the answer that declares more, unless said otherwise. Harry can reverse any of them before submitting.

1. **Apple Performance Data is declared, against Q6.6's "no Performance Data".** Q6.6 rested on "errors only, no performance tracing", which is true of Sentry's tracing. But the usage stats carry a load time (`game:first_card_view`'s `ms_since_swiping`, the policy's "timings"), and Sentry reports app hangs by default, and Apple's example for the type is "launch time, hang rate". Google's Diagnostics, which Q6.6 already declares, covers the same data, so both forms now agree. To follow Q6.6 as written, delete the Performance Data row and untick it.
2. **Google Device or other IDs is Required, not Optional (Q6.2 said Optional).** The PostHog install id can be turned off, but Expo's update token, Sentry's installation id and the IP addresses (Q6.4 puts them here) can't, and Google asks one answer per type.
3. **On Apple, IP addresses go under Other Data Types (linked), not Device ID.** Apple says to declare IP addresses by use, "such as precise location, coarse location, device ID, or diagnostics"; ours are for security. Putting them under Device ID would make that type linked, against Q6.2. Either way they are declared and linked.
4. **The country and language are declared** (Apple Other Data Types, Google Other info), not left out as phone settings.
5. **When the profile was created and last used is declared** (Apple Other Usage Data, Google Other actions).
6. **The stats choice is declared** (Apple Other Data Types with Other Purposes, since keeping proof isn't in Apple's purpose list; Google Other actions with "Fraud prevention, security, and compliance").
7. **Google User IDs adds Account management**, since Q6.7 treats the guest profile as an account. **Google Crash logs and Diagnostics add Analytics**, since Google's Analytics covers "how it performs".
8. **Support emails are not declared** (the one place this file doesn't declare more): nothing leaves through the app, and Apple's guide names customer service requests as data that may not need disclosing. To declare them anyway: Apple Contact Info > Email Address and User Content > Customer Support (linked, App Functionality); Google Personal info > Email address (Optional, App functionality).
9. **The deletion URL is the English page**, `https://flimme.com/en/delete-account`, which Play's reviewers read most easily. The form takes one URL; the French page `https://flimme.com/fr/suppression` says the same, and either works.
10. **"Delete some data without deleting the account" is No**, though My films can remove a film, because no web page describes it.

## For Harry to check outside this file

- **Sentry and IP addresses.** Sentry's docs say "By default, the user's IP address is inferred by the Sentry backend services based on the incoming request". The app deletes the user from every JavaScript event, but native crash reports don't pass through that code. For the policy's "no IP address" to hold, turn on "Prevent Storing of IP Addresses" in the Sentry project's Security & Privacy settings, if it isn't on.
- **The policy doesn't name Sentry's installation id, its hang reports or its session counts** (section 6, "Crash reports"). Its sentence "nothing that links it to your profile" stays true. A line could be added at the next policy update; this task doesn't edit the policy.
- **The deletion page mentions saved Apple or Google accounts and a taste profile**, which the first release doesn't have, and a guest without the app can only wait for the 90-day deletion. Google asks for a way to request deletion without the app; the page explains why a guest can't be found. A Play reviewer could still ask.
- **Google Play needs the Play app first** (H1); the answers wait for it. App Store Connect can be filled now.

## Sources checked

All on 6 November 2026.

- Apple, [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/): the definition of "collect", optional disclosure, every data type and purpose quoted above, "Data linked to the user", "Tracking", IP addresses, data processed only on device, Apple frameworks.
- Apple, [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy): the App Privacy page, Get Started, "Yes, we collect data from this app", Publish.
- Google, [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en): collection, sharing and service providers, processed ephemerally, every data type and purpose quoted above, "Optional", IP addresses, the form's steps and questions.
- Google, [Understanding Google Play's app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en): the deletion URL's requirements.
- Sentry, [Identify users (React Native)](https://docs.sentry.io/platforms/react-native/enriching-events/identify-user/): "we use the installation ID generated with the first use of the application". [Data collected (React Native)](https://docs.sentry.io/platforms/react-native/data-management/data-collected/): the IP address inferred by Sentry's backend. The installed SDK (`@sentry/react-native` 8.28.0) defaults `enableAppHangTracking` to true.
- Expo, [Privacy explained](https://expo.dev/privacy-explained): an update request carries "the end-user's operating system, the developer's project ID, and a random token".

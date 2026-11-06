# Age ratings: the answers

The answers for Apple's age rating questionnaire, Google Play's content rating questionnaire (IARC) and Play's target audience, one row per question, in the order each console shows them. Written 6 November 2026 for the first release (M11.5), from [store-listing.md, Age ratings](../product/store-listing.md#age-ratings), the row "M11.5 age ratings (Q5.1 to Q5.3)" in [decisions.md](../decisions.md) and the code on main. The questions were checked against Apple's and Google's help pages the same day ([sources](#sources-checked)).

Expected: **13+ on the App Store**. On Google Play, IARC computes the rating (most likely Teen and PEGI 12), and the target audience is **13 and over**.

Honest answers only: a rating found too low gets the app pulled. If a console asks something this file doesn't cover, answer with the facts in [The facts behind the answers](#the-facts-behind-the-answers), take the higher answer when unsure, and tell the main session so this file gets the row.

## App Store Connect · App Information · Age Rating

Where: Apps > Flimme > General > App Information > Age Ratings > **Set Up Age Ratings** (once set, **Edit** at the top of App Information). The dialog has a progress bar: first the in-app controls and capabilities, then one step per content section, then Age Categories and Override. Click **Next** after each step and **Save** at the end.

Content items take None, Infrequent or Frequent ("Peu fréquent" is Infrequent in French). Controls, capabilities and a few items are Yes or No (selected or not). The rows follow Apple's [values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions) page; if the dialog orders them differently, match by name. The last column is the rating each answer implies.

### Step 1: In-app controls and capabilities

| Item | Answer | Why | Implies |
| --- | --- | --- | --- |
| Parental Controls | No (leave unselected) | Apple means tools a parent uses to restrict a child's access. The host's "Youngest viewer" setting filters one room's films, but whoever hosts can change it and nothing locks it | |
| Age Assurance | No | The app never asks for or checks an age, and doesn't call the Declared Age Range API | |
| Unrestricted Web Access | No | Apple: "Users can navigate to any webpage within the app or freely browse the web." The app opens a few fixed pages in the system's browser sheet, with no address to type, and sends trailers to YouTube outside the app ([the list](#links-the-app-opens)). If App Review disagrees, the fix is to open those pages in the external browser ([store-listing.md](../product/store-listing.md#apple)) | 16+ if yes |
| User-Generated Content | Yes (select it) | Yes to be safe ([store-listing.md](../product/store-listing.md#apple)). The only text a player types that others see is a filtered display name, seen by the room ([what players can type](#what-players-can-type)). No reactions in the first release | 4+ |
| Social Media | No | No feed, no public profiles, no likes or shares of anyone's content, no search for people | |
| Social Media Disabled for Users Under 13 | No (it may only show when Social Media is selected) | There is no social media to turn off | |
| Messaging and Chat | No | No free text between players: no chat, no messages, no comments ([security.md](../architecture/security.md#keeping-kids-safe-on-screen), row "Contact") | |
| Advertising | No | No ads and no ad SDK. The terms say "It shows no ads and sells nothing" | |

### Step 2: Mature Themes

| Item | Answer | Why | Implies |
| --- | --- | --- | --- |
| Profanity or Crude Humor | Infrequent | Some titles and synopses carry a crude word or joke ([store-listing.md](../product/store-listing.md#apple)) | 9+ |
| Horror/Fear Themes | Infrequent | Horror posters and synopses can show in any room, among mostly other genres: the first release's deck doesn't learn tastes | 9+ |
| Alcohol, Tobacco, or Drug Use or References | Infrequent | Synopses mention drinking or drugs, and posters can show smoking (Q5.1). IMDb and Netflix declare the same | 13+ |

### Step 3: Medical or Wellness

| Item | Answer | Why | Implies |
| --- | --- | --- | --- |
| Medical or Treatment Information | None | Apple means diagnoses or guidance on managing a condition. A synopsis tells a story and never gives medical guidance (Q5.1: "None" otherwise) | |
| Health or Wellness Topics | No | No self-care, diet or exercise content | |

### Step 4: Sexuality or Nudity

| Item | Answer | Why | Implies |
| --- | --- | --- | --- |
| Mature or Suggestive Themes | Infrequent | Apple counts suggestive images, crimes, trauma and war. Posters and synopses touch these briefly and mildly, as JustWatch, IMDb and Netflix declare. Frequent would mean 16+ | 9+ |
| Sexual Content or Nudity | Infrequent | Suggestive posters and synopses of some films rated for adults ([store-listing.md](../product/store-listing.md#apple)) | 13+ |
| Graphic Sexual Content and Nudity | None | Adult titles are never stored or dealt ([adult titles](#adult-titles-are-never-shown)), and a mainstream film's official poster is made for public display. Any other answer keeps the app off the App Store | |

### Step 5: Violence

| Item | Answer | Why | Implies |
| --- | --- | --- | --- |
| Cartoon or Fantasy Violence | Infrequent | Animation and fantasy posters and synopses ([store-listing.md](../product/store-listing.md#apple)) | 9+ |
| Realistic Violence | Infrequent | Action, war and crime posters and synopses ([store-listing.md](../product/store-listing.md#apple)) | 13+ |
| Prolonged Graphic or Sadistic Realistic Violence | None | A poster is a still image and a synopsis a few sentences: nothing prolonged or detailed. Any other answer keeps the app off the App Store | |
| Guns or Other Weapons | Infrequent | Action posters show guns and knives (Q5.1). Frequent would still give 13+ | 9+ |

### Step 6: Chance-Based Activities

| Item | Answer | Why | Implies |
| --- | --- | --- | --- |
| Gambling | No | No betting of any kind | |
| Simulated Gambling | None | No betting, even without money | |
| Contests | None | No rankings, scores or rewards: the group picks one film together, and the recap shows only the film, the time, and how many people and swipes | |
| Loot Boxes | No | Nothing to buy | |

### Step 7: Age Categories and Override

| Field | Answer | Why |
| --- | --- | --- |
| Age Categories and Override | Not Applicable | Made for Kids stays off: the Kids Category isn't chosen ([store-listing.md, Passing review](../product/store-listing.md#passing-review), row "Kids Category"), and it needs 4+ or 9+. No override: Apple asks for one only when the terms set a minimum age above the rating, and ours set none (under 15 needs a parent's permission) |
| Age Suitability URL (Optional) | Leave empty | There is no page dedicated to age suitability |

### Expected result

**13+.** Three answers set it (alcohol, tobacco or drugs; sexual content or nudity; realistic violence, each Infrequent). Every other answer implies 9+ or less, and none reaches 16+. App Information then shows the rating per region. Devices before iOS 26 show the older scale, under "Operating Systems Earlier than Version 26": JustWatch, 13+ today, shows 12+ there. For comparison (App Store France, 6 November 2026), JustWatch is 13+ with infrequent descriptors much like these, and Letterboxd is 16+.

If the result isn't 13+, stop and tell the main session: the terms say "the App Store rates it 13+", so the rating and the terms must agree.

## Google Play Console · App content · Content rating (IARC)

This waits for the Play app (H1). Where: Policy > App content > Content rating > **Start**: the email, then the category, then the questionnaire, then the Summary page and **Submit**. Google doesn't publish the questions, and they change with the category, so the rows below go by topic, named after Google's [ratings questionnaire help](https://support.google.com/googleplay/android-developer/topic/6181287) articles. Answer with the same facts as Apple's. Google counts what users can reach through the app, links included (its "Violent Material" article), so the trailers on YouTube count here.

### Email address · all

```text
support@flimme.com
```

IARC writes to this address, the rating certificate included.

### Category

| Field | Answer | Why |
| --- | --- | --- |
| Category | Consumer Store or Commercial Streaming Service | Google's article for it: apps that give access to "professionally created content", with "TV media libraries" as an example. Flimme shows professionally made films' posters, synopses and trailers, so the content questions that follow fit (Q5.2). Not Game: IARC asks a game about what it depicts itself, and Flimme depicts nothing of its own. Not Social Networking, Forums, and UGC Sharing: Google keeps that for apps whose main purpose is sharing user content. If the console doesn't offer this category, choose its catch-all for apps that are neither games nor social or communication apps, and tell the main session the label |

### Content

| Topic (Google's article) | Answer | Facts to give |
| --- | --- | --- |
| Violence ("Violent Material") | Yes | Realistic violence from live-action films: in posters (still images), synopses (text) and trailers behind a button. The player never causes it. Mild and infrequent, as on Apple |
| How violence is shown ("Presentation", "Reactions") | Close-up, Realistic (if asked) | Trailers can show both. These questions are written for games and may not appear |
| Sexual content ("Sexual Material", "Depictions of Sexual Activity") | Yes, suggestive only | Suggestive posters, partial nudity on some posters, synopses that mention sex. No explicit sexual activity and no full nudity ([adult titles](#adult-titles-are-never-shown)) |
| Provocative outfits | Yes | Some posters show them |
| Under 18 sexual situations | No | Nothing in the app depicts sexual situations involving minors |
| Language | Yes, mild | A crude word in some titles and synopses |
| Crude humour | Yes, mild | Comedies' titles and synopses |
| Horror and fear | Yes, mild | Horror posters and synopses |
| Alcohol and tobacco ("Alcohol") | Yes, references | Synopses mention drinking, posters can show smoking. Nothing is sold or encouraged |
| Drugs ("Illegal or recreational drugs") | Yes, references | Synopses mention drugs |
| Drugs as the app's focus ("Focus of the App"), incentives for illegal drugs | No | The app is about picking a film |
| Gambling ("Casinos, Gambling Halls, or Racetracks") | No gambling; yes if the question is about references | No real or simulated betting. A synopsis can mention a casino |
| Nazi symbols ("Nazi Symbols or References") | Yes | Google says yes for the swastika as the Nazi regime used it, and posters of Second World War films can show one. It mostly matters in Germany (USK), where the app isn't listed at launch |
| Criminal instruction | No | Nothing teaches a crime |

### Interactive elements and other questions

| Question | Answer | Why |
| --- | --- | --- |
| Users interact ("Online Interaction or Content Exchange") | Yes | Players see each other's display names in a room (Q5.2). Google says multiplayer without communication needs no yes, but a name is content a player made |
| Social networking or UGC sharing as the app's purpose | No | Names are seen by one room only |
| Shares location ("Displays User's Location to Others") | No | The app reads the phone's region once, to choose a country's catalog. No precise location is collected or shown to anyone; Google says location used without sharing doesn't count |
| Digital purchases | No | Free, sells nothing |
| Unrestricted internet, or a web browser or search engine | No | The same facts as Apple's Unrestricted Web Access ([the list](#links-the-app-opens)) |
| Ads (if asked here) | No | No ads and no ad SDK |

### Expected result

It can't be known before filling it in: IARC computes it per region. PEGI rates Europe (France included), ESRB the Americas, USK Germany, ClassInd Brazil, and IARC's generic ages the rest ([rating authorities](https://support.google.com/googleplay/android-developer/answer/188189)). For comparison (Google Play, 6 November 2026): JustWatch is PEGI 12 in France and Teen in the US; IMDb, Letterboxd and Netflix show "Parental guidance" in France and Teen in the US. **Most likely PEGI 12 and Teen.** A higher result from honest answers stands: tell the main session so [store-listing.md](../product/store-listing.md#google-play) records it. To disagree, the certificate email has IARC's appeal link.

## Google Play Console · App content · Target audience and content

This waits for the Play app (H1). Where: Policy > App content > Target audience and content > **Start** (**Manage** once set). Google asks for the Ads declaration, App access and the privacy policy first; their answers come with M11.8 and M11.9.

### Target age

| Age group | Answer |
| --- | --- |
| Age 5 and under | Leave unticked |
| Ages 6-8 | Leave unticked |
| Ages 9-12 | Leave unticked |
| Ages 13-15 | Tick |
| Ages 16-17 | Tick |
| Ages 18 and over | Tick |

Why: decisions.md, "Store assets use fictional posters": "a 13+ target audience on Google Play until family profiles exist". Any group under 13 brings in Google's Families policy ([store-listing.md](../product/store-listing.md#google-play)). Not 18 and over alone: the 13+ rating on Apple and the terms leave the app open to teenagers.

### App details and store presence

| Question | Answer | Why |
| --- | --- | --- |
| Could your store listing unintentionally appeal to children? (if asked) | No | Fictional posters, no cartoon characters or youthful imagery, and never "for kids" in the copy (decisions.md, "Store assets use fictional posters"). Before answering, look at the [listing](listing.md) and M11.3's screenshots: if an image looks made for children, fix the image, not this answer |
| Questions about ads shown to children | They don't appear | They come only with an age group under 13 |
| Teacher Approved | Not applicable | Only for apps that target children |

Then **Save**. Google reviews the declared audience, which can take up to 7 days.

## The facts behind the answers

### Adult titles are never shown

- The catalog never takes them in: the sweep asks TMDB with `include_adult` false ([sweep.py](../../server/src/server/catalog/sweep.py)), the popular films list leaves adult entries out ([popularity.py](../../server/src/server/catalog/popularity.py)), and a film TMDB flags adult later is deactivated ([tmdb.md](../integrations/tmdb.md#which-films-are-in-the-catalog)).
- Every deal filters `not t.is_adult`: rooms ([deck_candidates_first_release.sql](../../supabase/migrations/20261103164752_deck_candidates_first_release.sql)), Play alone ([solo_mode.sql](../../supabase/migrations/20261105160000_solo_mode.sql)) and My films ([my_films.sql](../../supabase/migrations/20261105180100_my_films.sql)).
- Films rated for adults that aren't adult titles stay, unless the host's age cap keeps them out: that is why the answers say Infrequent and not None.

### Links the app opens

| What | Code | How it opens |
| --- | --- | --- |
| TMDB's watch page ("More details"), on the winner screen, a runner-up and a film in My films | [where-to-watch.tsx](../../mobile/src/components/shared/where-to-watch.tsx) | The system's browser sheet (`WebBrowser.openBrowserAsync`: Safari's sheet on iOS, a Custom Tab on Android), with no address to type. The page's own links can be followed inside the sheet |
| The privacy policy and the terms, on flimme.com | [use-settings-links.ts](../../mobile/src/features/account/use-settings-links.ts) | The same sheet |
| Trailers (`https://www.youtube.com/watch?v=` and the key) | [trailer.ts](../../mobile/src/features/swipe/trailer.ts) | `Linking.openURL`: the YouTube app or the browser, outside Flimme. No trailer in rooms capped under 13 ([card_payloads_for_the_room.sql](../../supabase/migrations/20261103193809_card_payloads_for_the_room.sql); decisions.md, "Age caps also apply to the taste check, reason labels and trailers") |
| Contact support | [use-settings-links.ts](../../mobile/src/features/account/use-settings-links.ts) | The mail app, or the address is copied |
| Language | [use-settings-links.ts](../../mobile/src/features/account/use-settings-links.ts) | The phone's settings for the app |
| The store page, from the update screen | [open-store.ts](../../mobile/src/features/app-config/open-store.ts) | The App Store or the Play Store |
| Sharing an invite | [invite-link.ts](../../mobile/src/features/invite/invite-link.ts) | The system's share sheet; nothing opens |
| Sharing the recap image, and the data export from Settings | [use-recap-share.ts](../../mobile/src/features/recap/use-recap-share.ts), [use-export-data.ts](../../mobile/src/features/account/use-export-data.ts) | The system's share sheet; nothing opens |

The invite page's links and store badges and the legal pages' links run on flimme.com in a browser, not in the app. Letterboxd's export page isn't in the first release.

### What players can type

- **A display name** (1 to 24 characters), the only text others see, in the rooms they play in. `api.update_profile` normalises it and refuses blocked words in English and French, ignoring case and accents, reading look-alike digits as letters, refusing impersonation words and removing invisible characters (decisions.md, the four "Names and avatars (M4.3)" rows; [display_names_and_avatar_presets.sql](../../supabase/migrations/20261103102219_display_names_and_avatar_presets.sql)).
- **A room code**, to join; nobody else sees it.
- No free text otherwise: avatars are six presets, there is no chat, and reactions wait (decisions.md, "The recap card and Play again join the first release; reactions wait").
- **Report** (M7.1): any player can report another from the lobby, with a fixed reason (offensive name, spam or trolling, something else) and no free text ([member_reports.sql](../../supabase/migrations/20261103181958_member_reports.sql)). The host can remove a player ([remove_member.sql](../../supabase/migrations/20261103173711_remove_member.sql)).

## Defaults taken

Choices no doc or decision covered. Each takes the higher or the safer answer.

1. Apple, Age Suitability URL: left empty, since no page is dedicated to it.
2. IARC email: support@flimme.com, the only address the repo may hold.
3. IARC category: Consumer Store or Commercial Streaming Service, the label in Google's help closest to Q5.2's "apps that show third-party media".
4. IARC violence: realistic, and close-up if asked, because trailers can show it. This can raise the Play rating above the comparison apps'.
5. IARC sexual content: partial nudity and provocative outfits answered yes.
6. IARC Nazi symbols: yes, for Second World War posters.
7. IARC gambling: yes if the question is about references.

## Sources checked

All on 6 November 2026.

- Apple: [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating), [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions), the API's [age rating fields](https://developer.apple.com/documentation/appstoreconnectapi/ageratingdeclaration/attributes-data.dictionary) (which items are Yes or No and which take a frequency), and [Updated age ratings in App Store Connect](https://developer.apple.com/news/?id=ks775ehf) (24 July 2025).
- Google: [content rating requirements](https://support.google.com/googleplay/android-developer/answer/9859655), [content ratings](https://support.google.com/googleplay/android-developer/answer/9898843), [rating authorities](https://support.google.com/googleplay/android-developer/answer/188189), the [questionnaire help](https://support.google.com/googleplay/android-developer/topic/6181287) and its articles ([Violent Material](https://support.google.com/googleplay/android-developer/answer/6159961), [Online Interaction or Content Exchange](https://support.google.com/googleplay/android-developer/answer/6161115), [Social Networking, Forums, and UGC Sharing](https://support.google.com/googleplay/android-developer/answer/6159973), [Displays User's Location to Others](https://support.google.com/googleplay/android-developer/answer/6161128), [Digital Purchases](https://support.google.com/googleplay/android-developer/answer/6161125), [Nazi Symbols or References](https://support.google.com/googleplay/android-developer/answer/7022576), [Consumer Store or Commercial Streaming Service](https://support.google.com/googleplay/android-developer/answer/6159975)), and [target audience and content](https://support.google.com/googleplay/android-developer/answer/9867159).
- Comparisons: the App Store France pages of JustWatch and Letterboxd, and the Google Play pages (France and US) of JustWatch, IMDb, Letterboxd and Netflix.

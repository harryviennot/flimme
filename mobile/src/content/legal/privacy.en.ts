// The privacy policy, in English. It says what privacy.fr.ts says (French is the primary text),
// written for English readers rather than translated word for word. Same Markdown subset, checked
// by legal.test.ts.

export const updated = '2026-11-06';

export default `# Flimme privacy policy

Flimme helps you pick a film with friends, or on your own. This page explains what data the app uses, why, and how you stay in control of it. It describes the app as it is today, not what may come later.

## The short version

- No account: you play with a name and a colour, with no email and no password.
- No ads, no tracking across apps, no data sold.
- Your profile and your games are stored in the European Union, in Frankfurt.
- Usage stats are anonymous in Europe, and you can turn them off in Settings.
- You can download or delete your data from the app, at any time.

## 1. Who we are

Flimme is published by Harry Viennot, an independent developer, as an individual. He is the controller of your data.

For any question about your data, or to use your rights, write to [support@flimme.com](mailto:support@flimme.com).

## 2. What we collect

There is no account to create. The first time you open the app, it creates a profile on our servers, with no email. Here is what we keep.

| Data | What it is |
| --- | --- |
| Your profile | A random id, the name or nickname you choose, your colour (picked from a list, never a photo), your language and the country set on your phone |
| Your sign-in | When your profile was created and when you last used the app. For each session, our database also records your phone's IP address and the app's technical identification |
| The sign-in log | For security, Supabase, which runs sign-in, records sign-ins, each renewal of your session and the deletion of your profile: the action, your id and the time. Depending on the action, it may also record your phone's IP address |
| Your services | The streaming services you have |
| Your games | The rooms you create or join and their settings. Your seat in each room: your name, your colour and your services that night, and how you arrived (link, code, QR code). Your answer to each film (Like, Nope, Super like, Seen it) and when, your Final Cut votes and tonight's pick. A solo session is a room with one seat |
| The card log | For each card: the film, how it got into your deck, its place, its score and what was used to pick it, your answer and when, any undo, whether you flipped the card and how long you looked at it. It is linked to your seat in the room, never to your name |
| My films | The films you liked and when, your super likes, the films your group picked with you, and the ones you marked as seen |
| Your stats choice | Your answer to the "Help improve the app" setting (on, off or detailed stats), its date and the version of the text you saw |
| Reports | If you report a player: which seat reported which seat, in which room, the reason picked from a list (offensive name, spam or sabotage, something else) and the date. Never free text |
| Abuse limits | Counters per action, tied to your profile, that limit repeated calls: joining a room, previewing a room, starting a solo session, showing a film's card outside the deck (for example a match or a film in My films), changing My films, changing your stats choice, reporting a player and downloading your data. For joining a room and previewing it, other counters are tied to your IP address, stored as a fingerprint (a hash), to stop people guessing room codes |
| Usage stats | See section 6 |
| Crash reports | See section 6 |
| Technical logs | Requests to our database, with the IP address, for security and to keep things running. Our server's logs hold ids only, never your name, a room code or your IP address |
| On your phone | Your session (encrypted), votes not sent yet, the cards for the next game, your settings and the anonymous stats id. These stay on your phone |

The app never asks for an email, a password or a birth date. It has no access to your location, your contacts, your camera, your microphone or your photos.

This version has no Apple or Google account, no Letterboxd connection and no notifications. If they arrive, this policy will be updated first.

## 3. Why, and on what legal basis

| Why | Legal basis |
| --- | --- |
| Running the game: creating rooms, dealing films on your group's services, counting votes, finding tonight's pick, playing alone | Providing the service you ask for (contract) |
| My films, and keeping films you have seen out of your next decks | Contract |
| Making decks better: seeing which cards people like, comparing ways of building the deck, and capping solo play at 100 cards a day | Our legitimate interest |
| Protecting players and the service: reports, abuse limits, the sign-in log, technical logs | Our legitimate interest (security, app store rules) |
| Fixing crashes | Our legitimate interest |
| Measuring the app's audience, anonymously | Audience measurement exempt from consent under the CNIL's conditions, which you can refuse |
| Detailed stats, if you turn them on | Your consent |
| Stats linked to your profile, outside Europe | Our legitimate interest, which you can refuse |
| Keeping a record of your stats choice | Our duty to prove what you agreed to |

What the app keeps on your phone (your session, votes waiting to be sent) is strictly necessary for the service.

The films people watch can say a lot about them. We draw no conclusions about your private life from them, we show them to nobody beyond what section 5 describes, and we never use them for advertising.

## 4. Letterboxd

This version doesn't offer a Letterboxd connection. The app reads no Letterboxd data.

## 5. What other players see

In a room, the other players see:

- your name and your colour;
- your services;
- how far along you are during the game (for example "Sam is done");
- whether you have locked in your Final Cut vote, but not what you voted;
- during the game, counts for the room, for example "2 of 3 of you liked this", never who liked it;
- after tonight's pick, who liked the other films in the running.

They never see who said Nope to a film, your answers during the game, My films, your solo sessions or your games with other people. Only you can see a solo session. There is no messaging between players.

If you report a player, they never find out who reported them. Only Harry reads reports. The host can also remove a player from the room.

## 6. Usage stats and crash reports

### Usage stats

To see what gets in the way, we measure the screens you open, a few actions (creating a room, sharing an invite, joining a room), timings and error screens. Along with these go your language, your country, a range for how many games you have played (0, 1, 2 to 4, 5 or more), your phone's model and operating system, the app version and your time zone. Never your votes, your films, your name, a room code or your IP address.

- **In the European Economic Area, the UK and Switzerland**, stats are anonymous: they carry a random id kept on your phone, replaced every 13 months and never linked to your profile. This is the audience measurement the CNIL (France's data protection authority) exempts from consent.
- **If you turn on "Detailed stats"**, stats are linked to your profile id from then on. You can turn them off at any time.
- **Everywhere else**, they are linked to your profile id unless you turn them off.
- **To know where you are**, the app looks at the region set on your phone and your profile's country. If either one is in Europe or unknown, the European rule applies.
- **In a room limited to films for under-13s**, no phone sends any stats.
- **To turn everything off**, go to Settings and switch off "Help improve the app".

### Crash reports

When the app or our server crashes, a technical report goes out: the error, where in the code it happened, the phone's model and operating system, and the app version. It holds no name, room code, email or IP address, and nothing that links it to your profile.

## 7. How your games improve the app

This version trains no artificial intelligence model on your games.

We use the card log (section 2) to see which cards people like and to compare ways of building the deck, so the next ones are better. It is linked to your seat in the room, never to your name, and it is shown to nobody.

You can object by writing to [support@flimme.com](mailto:support@flimme.com), or by deleting your data in Settings: the log is then no longer linked to anyone.

## 8. Who processes your data for us, and where

These providers process your data on our behalf, following our instructions and a data processing agreement.

| Provider | What it does | Where |
| --- | --- | --- |
| Supabase | Database, sign-in and live updates during games | Frankfurt (European Union) |
| Fly.io | Our server: data deletion, the film catalog, game stats | Frankfurt (European Union) |
| Tigris | Storage for the weekly backup, encrypted | Frankfurt (European Union) |
| GitHub | Makes the weekly backup and encrypts it before sending it to storage | United States |
| Sentry | Crash reports | Frankfurt (European Union). Sentry says some types of data may be stored in the United States |
| PostHog | Usage stats | Frankfurt (European Union) |
| Expo | App updates. When the app checks for one, Expo receives your phone's operating system, a random id and your IP address | United States |
| OVH | The server behind our website, flimme.com, and the mailbox for support@flimme.com: OVH receives and keeps the emails you send us | France (the website's server is in Gravelines) |

Apart from OVH, a French company, these providers are American companies. When data is sent to the United States or can be accessed from there, the transfer is covered by the European Commission's standard contractual clauses and, for the companies that have joined it, by the EU-US Data Privacy Framework.

Some test versions, not the ones published in the app stores, use separate servers: the database in Ireland (European Union) and the server in London (United Kingdom, which the European Commission recognises as offering adequate protection).

Posters and service logos come from TMDB's image servers. Like any website, they see your phone's IP address when it downloads an image. We send TMDB no data about you.

Trailers open on YouTube, and "where to watch" opens a TMDB page (with data from JustWatch). Once you are there, their privacy policies apply. Apple and Google distribute the app under their own rules; we send them no game data.

Our website, flimme.com, doesn't measure its audience and keeps no log of visits.

## 9. How long we keep your data

| Data | How long |
| --- | --- |
| Profile, services, My films, stats choice | As long as you keep your profile. It is deleted when you delete your data, or after 90 days without activity. In that second case, any stats linked to your profile are not erased straight away: they go within 25 months at most |
| Sign-in session, IP address included | Until the session ends, and at the latest until your profile is deleted |
| Your games (seats, answers, votes) | As long as your profile exists. After that, your seats stay in their rooms without your name or colour, and are no longer linked to you: they count in other people's games. A room whose game never started is cleared a week later |
| Card log | 13 months |
| Reports | 12 months, even if one of the players deletes their data |
| Abuse limits | 1 day |
| Sign-in log | 90 days at most, even after your profile is deleted |
| Technical logs | 7 days at most |
| Crash reports | 90 days at most |
| Usage stats | 25 months at most. The anonymous id is replaced every 13 months |
| Emails you send us | As long as it takes to answer you, then 12 months at most after the last message |
| Backups | Daily copies, 7 days at most. The encrypted weekly copy, 4 weeks. Deleted data leaves the backups when they expire |
| On your phone | Until you delete your data or the app |

## 10. Your rights

You can access your data, correct it, delete it, take a copy, object to or restrict its use, and withdraw your consent. Most of this happens right in the app.

- **Download your data**: Settings, "Download my data". You get a JSON file with your profile, your services, your stats choice, My films and, for each game, your seat, your answers, your votes and tonight's pick. Never other players' data. Once an hour at most.
- **Delete your data**: Settings, "Delete my data". Your profile, your services, My films, your stats choice and any stats linked to your profile are erased. Your past votes stay in their rooms, without your name. The sign-in log is erased within 90 days at most. Without the app, the page [flimme.com/en/delete-account](https://flimme.com/en/delete-account) explains how.
- **Correct it**: change your name and colour from the home screen, and your services when you set up a game. In My films, remove a film or mark it as seen or not seen.
- **Object**: switch off "Help improve the app". For the card log, write to us.
- **Withdraw your consent**: switch off "Detailed stats".
- **Anything else**, including restricting the use of your data or telling us what you want done with it after your death: write to [support@flimme.com](mailto:support@flimme.com).

We answer within one month. Since you have no account, we can't find you from your email address: the buttons in the app are the surest and fastest way.

You can also complain to the CNIL, France's data protection authority, at [cnil.fr](https://www.cnil.fr/fr/plaintes) or by post: CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France.

## 11. Children

Flimme is a general audience app. It asks for no birth date or email, and shows no ads. If you are under 15, use Flimme with a parent's agreement, and ask them before you turn on detailed stats.

When the host limits a room to films for under-13s, no phone in the room sends any stats and cards have no trailer button.

A profile with no activity for 90 days is deleted, as when you delete your data (see sections 9 and 10).

## 12. Changes

This policy is dated 6 November 2026. If we change it, this date changes. If a change affects what we collect or what we do with it, we will say so in the app before it applies.

See also our [terms of use](https://flimme.com/en/terms).
`;

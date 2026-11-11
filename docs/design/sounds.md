# Sounds

Every sound the app plays: the file, the moment it plays, on which phones, with which haptic, and how to wire it. Written on 6 November 2026 from Harry's picks in the sound lab, for the task that wires them (M6.24) and for M15.5 (the reminder) and M11.4 (the preview video). It replaces the decision of 29 October 2026 ("sound for the match and the reveal only"); the new rows are in [decisions.md](../decisions.md). Updated the same evening from Harry's new yes list: joining a room, the shortlisted beat, the veto, Lock in, the winner screen and the solo pick have sounds too. It builds on [the moments](moments.md), the screen specs linked from each section, and [motion, haptics and sound](../architecture/groundwork.md#motion-haptics-and-sound).

## At a glance

All files are in `mobile/assets/sounds/`. Levels are in dB under the match, and they are already in the files.

| Moment | File | Plays | Phones | Haptic with it | Length | Level |
| --- | --- | --- | --- | --- | --- | --- |
| [The match](#the-match) | `match.wav` | The match overlay, at 0 | Every phone | `haptics.match()` | 1.40 s | 0 |
| [The reveal](#the-reveal) | `reveal.wav` | The Final Cut's reveal, timed so its ta-dum lands on the winner's lift | Every phone | `haptics.match()`, with the ta-dum | 1.48 s | 0 |
| [Joining a room](#joining-a-room) | `join.wav` | `join_room` answers `ok` | The phone that joined | None | 0.41 s | -8 |
| [The game starts](#the-game-starts) | `start.wav` | The shuffling overlay appears | Every phone in the lobby | None | 1.17 s | -4 |
| [A friend arrives](#a-friend-arrives) | `arrive-2.wav` to `arrive-10.wav` | A new seat in the lobby | Every phone already in the lobby | None | 0.64 s | -9 |
| [A match joins the shortlist](#a-match-joins-the-shortlist) | `shortlist.wav` | The shortlisted beat, at 0 | Every phone that sees the beat | `haptics.shortlist()` | 0.96 s | -6 |
| [The veto](#the-veto) | `veto.wav` | The VETO stamp lands | The phone that vetoed | `haptics.veto()` | 0.36 s | -8 |
| [Locking in](#locking-in) | `lock-in.wav` | Lock in, on press-in | The phone pressed | `haptics.press()` | 0.34 s | -8 |
| [The last 5 seconds](#the-final-cuts-last-5-seconds) | `countdown.wav`, `countdown-last.wav` | Each of the Final Cut's last 5 seconds | Phones not locked in | `haptics.countdown()` | 0.28 s | -10 |
| [The winner screen](#the-winner-screen) | `winner.wav` | The film shows, after a group's pick seen live | Every phone that saw it live | None | 0.75 s | -10 |
| [The solo pick](#the-solo-pick) | `solo-pick.wav` | The picked poster lands | The solo player's phone | `haptics.match()` | 1.14 s | -3 |
| [Errors](#errors-and-refusals) | `error.wav` | Every refusal | The phone refused | `haptics.error()` | 0.42 s | -10 |
| [Buttons](#key-buttons) | `tap.wav` | Every button press (Lock in plays its latch) | The phone pressed | `haptics.press()` | 0.01 s | -20 |
| [The reminder](#the-did-you-watch-it-reminder) | `notify.wav` | The "Did you watch it?" notification | The phone notified | The system's | 0.96 s | 0 |
| [The sonic logo](#the-sonic-logo) | `sonic-logo.wav` | The end of the preview video and ads. Never in the app | | | 2.97 s | 0 |

In a 4-player night that ends with the Final Cut, a phone plays about 15 sounds: its join, two or three arrivals, the start, a bell for each shortlisted match, maybe a veto, the latch, up to five countdown ticks (fewer once it locks in), the reveal, the winner's chime, a button tick and, rarely, an error. Swipes stay silent, so between two bells a phone is quiet for minutes.

## Rules for every sound

- **One file, one meaning.** A file plays only at its moment. Nothing reuses `match.wav` or `reveal.wav`; they stay the night's two big beats.
- **Volume 1, always.** The files carry their levels (the frequent ones sit far under the match). Never set a volume per sound in code.
- **The existing audio mode applies to all of them:** mixed with other audio so the TV or music never pauses, played even when the phone is on silent (`playsInSilentMode: true`, Harry, 6 November 2026), nothing in the background. The Sound switch in Settings turns every in-app sound off.
- **Only live moments.** A sound plays when the phone sees the moment happen. A re-read, a reconnect or a cold start that finds the moment already past plays nothing. The one exception stays the match's "Missed it" ([match.md](screens/match.md#when-it-shows)).
- **No sound tells the couch a private answer** (rule 6), with one exception Harry chose: the veto. None depends on a swipe, a like, a vote or a rank. The countdown plays only on phones that haven't locked in, and the latch on the phone that locks in, which every phone already shows. The veto's stamp plays only on the phone that vetoed, quietly, but the couch may hear that someone vetoed; Harry heard that risk in the sound lab and said yes ([the veto](#the-veto)).
- **With its haptic, at the same instant,** when it has one. A sound never waits for an animation to end.
- **Reduce Motion changes nothing;** the times stay the same. A sound never replaces a screen reader announcement.
- **The files are original:** made for Flimme by synthesis in the sound lab, with no samples or recordings, so they need no licence ([LICENSE.txt](../../mobile/assets/sounds/LICENSE.txt) next to them).

## Each sound

### The match

`match.wav`: a knock, then a warm brass chord with a bell on top ("ta-dum"). The knock is at 0, the chord at about 0.14 s.

- Plays once at 0 of [the match sequence](screens/match.md#the-sequence), with `haptics.match()`, on every phone, including "Missed it". Unchanged from the spec: today's `playSound('match')` calls only need the file.

### The reveal

`reveal.wav`: a reversed chord swells like a curtain going up, a knock at about 0.73 s, then the same ta-dum as the match at about 0.89 s. The reveal quotes the match on purpose, so players learn one motif.

- Plays once on every phone during [the reveal](screens/final-cut.md#the-sequence), starting late enough that its ta-dum lands with the winner's lift and `haptics.match()` (Harry, 6 November 2026). It starts at the winner's time minus 894 ms, or at the Clear step (0) when that would be earlier.
- The winner's time comes from the reveal's own step times (`features/finale/reveal.ts`), since a step with nothing to show is skipped:

| Case | The winner lifts | The sound starts | Its ta-dum |
| --- | --- | --- | --- |
| Knock-outs and points | 1.8 s | 0.906 s | 1.8 s, with the lift |
| Points, no knock-outs | 1.3 s | 0.406 s | 1.3 s, with the lift |
| Knock-outs, no points | 0.8 s | 0 (Clear) | 0.894 s, just after the lift |

- The swell fills the knock-outs and the points, so the room hears the build and then the release with the winner. From Clear until the sound starts, the reveal is silent.
- Reduce Motion keeps the same times, so the ta-dum still lands with the lift.

### Joining a room

`join.wav`: a paper ticket torn along its perforation. You're in.

- Plays when `join_room` answers `ok` to this phone, as the room comes in: from the code screen ([join-code.md](screens/join-code.md)), the join sheet ([join-sheet.md](screens/join-sheet.md)) and the winner's Join offer ([winner.md](screens/winner.md#the-join-offer)). Only on this phone; the others hear [the arrival note](#a-friend-arrives).
- Never on press: a refusal plays the [error sound](#errors-and-refusals) instead, so the tear always means "in". Join's press still has its [tick](#key-buttons). `name_required`, the wait while the game starts, and every refusal play no tear.
- The host makes the room and never joins it, so the host hears no tear. No haptic: the join sheet keeps the celebration for the room.

### The game starts

`start.wav`: a soft swell, then the ta-dum's knock at about 0.69 s. "Lights down": the film is about to start.

- Plays when this phone first sees the room go from `lobby` to `dealing` live (the `state_changed` event, or the host's own Start answer `dealing`), as the [shuffling overlay](screens/lobby.md#starting) fades in. Every phone in the lobby plays it at once.
- If the deal goes back to the lobby (`too_few_films`) and the host starts again, it plays again.
- A phone that only sees `swiping` (it missed `dealing`, or it joins mid-game) plays nothing.
- No haptic, as the lobby spec says. The host also hears the [button tick](#key-buttons) on Start, a moment earlier.

### A friend arrives

`arrive-N.wav`: one marimba note, a step higher with each player, so the room hears the group grow. N is the number of seats the lobby lists after the arrival (seats with `left_at` null), from 2 to 10:

| Seats after the arrival | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| File | `arrive-2` | `arrive-3` | `arrive-4` | `arrive-5` | `arrive-6` | `arrive-7` | `arrive-8` | `arrive-9` | `arrive-10` |
| Note | C5 | D5 | E5 | G5 | A5 | C6 | D6 | E6 | G6 |

- Plays on `member_joined` ([live changes](screens/lobby.md#live-changes-from-the-room-layout)), once the seats are re-read and the new row comes in, on every phone already in the lobby, the host's included. Every phone reads the same count, so they play the same note.
- The phone that just joined plays no arrival note for itself: it heard [its own tear](#joining-a-room).
- Two arrivals in one re-read play one note, for the final count. A departure plays nothing; the next arrival plays the note for the new count, even one already heard.
- Only while the room is in `lobby`. No haptic, as the lobby spec says.

### A match joins the shortlist

`shortlist.wav`: the bell on top of the ta-dum, alone. Yes, together, without the big hit.

- Plays at 0 of [the shortlisted beat](moments.md#the-shortlisted-beat), with `haptics.shortlist()`, on every phone that sees the beat live (its own answer or the `match` event). The read-back that fills the top bar after a cold start or a reconnect plays nothing.
- 1 to 3 times a game. It sits 6 dB under the match and has no knock or chord, so the match and the reveal keep their weight.

### The veto

`veto.wav`: a rubber stamp's thunk as VETO lands.

- Plays with `haptics.veto()`, when a veto lands on a poster while no other poster had one ([final-cut.md](screens/final-cut.md#the-veto)). Moving the veto to another poster and lifting it stay silent, as their haptics do.
- Only on the phone that vetoed. Ballots are secret, and a phone near yours may hear that you vetoed: Harry chose the sound knowing it (6 November 2026). It never plays on another phone, and the reveal's knock-outs don't replay it.
- 0 or 1 a game.

### Locking in

`lock-in.wav`: a metal latch closing, click, clack. Done, I'm in.

- Plays on press-in of **Lock in** (`finale:lockIn`, [final-cut.md](screens/final-cut.md)) with `haptics.press()`, in place of the tick. Not when the button is disabled. Everyone already sees who has locked in, so it leaks nothing.
- It must start with the haptic, as the tick does ([wiring](#wiring-it)). A refused ballot then plays the error sound.

### The Final Cut's last 5 seconds

`countdown.wav` and `countdown-last.wav`: a wooden tick, on C for 5, 4 and 3 seconds left, then on E for 2 and 1 (in the ta-dum's key, so the countdown leads into the reveal).

- Plays exactly where `Countdown` fires `haptics.countdown()` today (`components/ui/countdown.tsx`): once per second from 5 to 1, only while `tick` is true, so only before this phone locks in. `countdown.wav` for 5, 4 and 3, `countdown-last.wav` for 2 and 1.
- Locking in stops the ticks at once. Nothing plays at 0: the reveal follows.
- Each phone counts against the server's deadline, so the phones still voting tick together.

### The winner screen

`winner.wav`: two soft notes, as the film and where to watch it appear.

- Plays once on [the winner screen](screens/winner.md#how-it-arrives), when its film first shows (the `ready` view), on a phone that came from the swipe or Final Cut screen: after the match overlay's hand-over, after the reveal, or after the single-film pick. Every phone that saw the pick live plays it.
- A cold start, a return to a `done` room and Nothing fits tonight play nothing. A solo pick never plays it: it has [its own sound](#the-solo-pick).
- No haptic. It sits 10 dB under the match, so the overlay's or the reveal's ta-dum stays the moment and this is the room settling.

### The solo pick

`solo-pick.wav`: the ta-dum at half size, with no knock and a smaller chord. Yours, without the suspense.

- Plays with `haptics.match()` when the picked poster lands on the winner screen ([the solo pick](moments.md#the-solo-pick)), only on a pick made on this phone just now. Seeing the pick again plays nothing.
- `match.wav` and `reveal.wav` stay a group's; the solo checkpoint stays silent.

### Errors and refusals

`error.wav`: two muted marimba notes going down, "try again".

- Plays with every `haptics.error()`, at the same instant: a wrong code (the shake), a full room, a refused join, Start refused (`not_enough_players`, `too_few_films`), a failed share, and every other refusal of the player's own action. It follows the haptic's meaning in `lib/haptics.ts`, so a screen that has no `haptics.error()` (the closed room, reconnecting) has no error sound either.
- This reverses the old line "bad news never gets a sound": Harry chose it, and it's rare (about one in five games).

### Key buttons

`tap.wav`: a tiny, barely there click.

- **Every press ticks** (Harry, 6 November 2026): `Button`, icon buttons, chips, toggles, plain list rows, and the swipe screen's answer buttons (Like, Nope, Undo, Super, Seen). One tick for every press, the same for every answer, tells the couch nothing about what was answered. Swiping the card itself stays silent. **Lock in** plays [its latch](#locking-in) instead.
- **Buttons inside scrolling lists wait 130 ms before they press in** (family playtest, 11 November 2026): the service tiles and the genre chips, so a scroll or a sheet drag that starts on one never ticks. A quick tap presses in on release, right with the selection. Every other button ticks the moment the finger lands.
- **No tick** when the button is disabled or loading, and on touch surfaces that aren't buttons and have no haptic (`haptic={false}`): the card's flip, an overlay's "tap anywhere", a finalist tile, the player pill, the long press on the code, a store badge. A screen can also pass `sound={false}`.
- It is the default of `Pressable` (and so `Button`); no screen asks for it.
- Plays on press-in with `haptics.press()`, as `Pressable` does, never on release.
- It must start with the haptic: a late click feels detached. Check it on a low-end Android ([wiring](#wiring-it)).

### The "Did you watch it?" reminder

`notify.wav`: the match's knock and bell, small.

- The sound of the "Did you watch it?" local notification (M15.5, [onboarding](../product/onboarding.md#after-the-first-game)). Nothing else in the app plays it.
- **The setup is fixed at the start, so it must ship with M15.5's first build.** Add the file to the `expo-notifications` config plugin (`sounds: ['./assets/sounds/notify.wav']`). iOS: `sound: 'notify.wav'` in the notification's content (a bundled file under 30 seconds; the silent switch and Focus apply). Android: the channel is created with `sound: 'notify.wav'` when it's made, just before the permission ask; Android never lets an app change a channel's sound afterwards, so a new sound later means a new channel.
- The in-app Sound switch doesn't touch it: players control it in the phone's notification settings (a default, in [decisions.md](../decisions.md#defaults-not-yet-confirmed)).

### The sonic logo

`sonic-logo.wav`: the curtain rise into the ta-dum, with a long bloom, in stereo. The knock is at about 0.91 s, the ta-dum at about 1.09 s.

- Ends the store preview video (M11.4), ads and social clips: cut to the logo card on the ta-dum. The same two beats as the match, so people hear the app before they open it.
- Never in the app: nothing requires it, so it never reaches the bundle.

## Silent on purpose

Harry heard options for each of these and kept them silent.

| Moment | Why |
| --- | --- |
| Swipes | 30 to 50 a game, and like and nope would have to sound the same or the couch hears every answer |
| The near miss | The sound would tell the couch which phones got the card and that the others liked it |
| The recap, opening the app, reconnecting, the closed room | Not shared moments, or noise |
| Solo: the checkpoint | Every 20 cards: a sound there would wear out |

## Wiring it

The shape below is a suggestion; the rules above are not.

- **`lib/sound.ts`** keeps one audio mode and one player per file. The fixed names: `match`, `reveal`, `start`, `error`, `tap`, `join`, `lock-in`, `shortlist`, `veto`, `winner`, `solo-pick`. Two helpers pick the file: one for an arrival from the seat count (clamped to 2..10), one for the countdown from the seconds left. `require('@/assets/sounds/match.wav')` and so on.
- **Preloading.** Create `tap`, `error` and `join` once the settings are read at launch: they must play without a delay, and the join plays before any room layout is up. Create `match`, `reveal`, `start`, the arrivals, `shortlist`, `winner` and `solo-pick` when the room layout mounts, the countdown ticks, `lock-in` and `veto` when the Final Cut mounts, and release them when the room ends. A player made at play time is too slow for the tick.
- **Replaying.** A sound that plays again (two taps, two errors) restarts from the start. Don't queue.
- **The button sounds:** the tick is the default of `Pressable` (and so `Button`), `lock-in` is set by Lock in, both played next to the haptic in `onPressIn` when not disabled; `sound={false}` or `haptic={false}` turns the tick off.
- **The error sound:** a single function that fires `haptics.error()` and the error sound together, used everywhere `haptics.error()` is called today (about 30 places), with a test that nothing outside `lib/` calls `haptics.error()` alone. The haptics switch and the Sound switch stay separate: either one off still lets the other through.
- **Settings' helper** under the Sound switch (`settings:preferences.helper`) says today that sounds only play at the match and the reveal. It changes to the new text in [settings.md](screens/settings.md#copy-settings-namespace-new) in the same pull request, and so does the comment at the top of `lib/sound.ts`.
- **Latency.** The tick and the latch must start within about 20 ms of the press haptic, and every other sound within about 100 ms of its moment. If the tick lands late on a low-end Android, don't ship it on that phone: tell Harry.
- **Tests** (one per rule, rule 4): the reveal sound's start time in each of the three cases, the seat count to the arrival file, the seconds left to the countdown file and no tick after lock-in, nothing plays with the Sound switch off, every button plays the tick (Lock in the latch) on press-in and a disabled one plays nothing, every refusal plays the error sound, the join tear on `ok` only and on every join path, the bell with the shortlisted beat, the stamp when a veto lands and not when it moves, the winner chime once on a live group pick and never on a cold start or a solo pick, the solo pick's sound on landing, a re-read or a cold start plays no start or arrival sound, every app file in `assets/sounds` is required, and `sonic-logo.wav` is never required. The feel check covers hearing them on a couch.

## Making or changing a sound

The sounds come from the [sound lab](https://claude.ai/artifact/4XjyPFbnRtF9C7GhSgL2Vy) (private to Harry), where each one is a recipe: `tadum-match`, `tadum-reveal`, `s-lights`, `a-scale`, `cd-clock`, `e-bonk`, `t-tick`, `n-tadum`, `l-full`, and since the evening of 6 November `j-ticket` (join), `sl-bell` (shortlist), `v-stamp` (veto), `li-latch` (lock-in), `wi-chime` (winner) and `so-tadum` (solo-pick). The export renders each at 48 kHz, mixes it to mono (the logo stays stereo), and cuts the 6 ms of silence the lab's compressor adds at the start. Change a sound in the lab and export them all again, so the levels stay matched.

## Open questions

None. Q1 (the reveal's timing) was answered on 6 November 2026: the ta-dum lands on the winner's lift ([the reveal](#the-reveal)).

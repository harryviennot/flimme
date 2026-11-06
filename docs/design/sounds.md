# Sounds

Every sound the app plays: the file, the moment it plays, on which phones, with which haptic, and how to wire it. Written on 6 November 2026 from Harry's picks in the sound lab, for the task that wires them (M6.24) and for M15.5 (the reminder) and M11.4 (the preview video). It replaces the decision of 29 October 2026 ("sound for the match and the reveal only"); the new rows are in [decisions.md](../decisions.md). It builds on [the moments](moments.md), the screen specs linked from each section, and [motion, haptics and sound](../architecture/groundwork.md#motion-haptics-and-sound).

## At a glance

All files are in `mobile/assets/sounds/`. Levels are in dB under the match, and they are already in the files.

| Moment | File | Plays | Phones | Haptic with it | Length | Level |
| --- | --- | --- | --- | --- | --- | --- |
| [The match](#the-match) | `match.wav` | The match overlay, at 0 | Every phone | `haptics.match()` | 1.40 s | 0 |
| [The reveal](#the-reveal) | `reveal.wav` | The Final Cut's reveal, timed so its ta-dum lands on the winner's lift | Every phone | `haptics.match()`, with the ta-dum | 1.48 s | 0 |
| [The game starts](#the-game-starts) | `start.wav` | The shuffling overlay appears | Every phone in the lobby | None | 1.17 s | -4 |
| [A friend arrives](#a-friend-arrives) | `arrive-2.wav` to `arrive-10.wav` | A new seat in the lobby | Every phone already in the lobby | None | 0.64 s | -9 |
| [The last 5 seconds](#the-final-cuts-last-5-seconds) | `countdown.wav`, `countdown-last.wav` | Each of the Final Cut's last 5 seconds | Phones not locked in | `haptics.countdown()` | 0.28 s | -10 |
| [Errors](#errors-and-refusals) | `error.wav` | Every refusal | The phone refused | `haptics.error()` | 0.42 s | -10 |
| [Key buttons](#key-buttons) | `tap.wav` | Join, Start swiping, Lock in | The phone pressed | `haptics.press()` | 0.01 s | -20 |
| [The reminder](#the-did-you-watch-it-reminder) | `notify.wav` | The "Did you watch it?" notification | The phone notified | The system's | 0.96 s | 0 |
| [The sonic logo](#the-sonic-logo) | `sonic-logo.wav` | The end of the preview video and ads. Never in the app | | | 2.97 s | 0 |

In a 4-player night that ends with the Final Cut, a phone plays about 10 sounds: one match or reveal, the start, two or three arrivals, up to five countdown ticks (fewer once it locks in), one or two button ticks and, rarely, an error. Swipes stay silent, so between the start and the Final Cut a phone is quiet for minutes.

## Rules for every sound

- **One file, one meaning.** A file plays only at its moment. Nothing reuses `match.wav` or `reveal.wav`; they stay the night's two big beats.
- **Volume 1, always.** The files carry their levels (the frequent ones sit far under the match). Never set a volume per sound in code.
- **The existing audio mode applies to all of them:** mixed with other audio so the TV or music never pauses, quiet when the phone is set to silent, nothing in the background. The Sound switch in Settings turns every in-app sound off.
- **Only live moments.** A sound plays when the phone sees the moment happen. A re-read, a reconnect or a cold start that finds the moment already past plays nothing. The one exception stays the match's "Missed it" ([match.md](screens/match.md#when-it-shows)).
- **No sound tells the couch a private answer** (rule 6). None depends on a swipe, a vote, a rank or a veto. The countdown plays only on phones that haven't locked in, which every phone already shows.
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
- The phone that just joined plays nothing for its own arrival (joining stays silent).
- Two arrivals in one re-read play one note, for the final count. A departure plays nothing; the next arrival plays the note for the new count, even one already heard.
- Only while the room is in `lobby`. No haptic, as the lobby spec says.

### The Final Cut's last 5 seconds

`countdown.wav` and `countdown-last.wav`: a wooden tick, on C for 5, 4 and 3 seconds left, then on E for 2 and 1 (in the ta-dum's key, so the countdown leads into the reveal).

- Plays exactly where `Countdown` fires `haptics.countdown()` today (`components/ui/countdown.tsx`): once per second from 5 to 1, only while `tick` is true, so only before this phone locks in. `countdown.wav` for 5, 4 and 3, `countdown-last.wav` for 2 and 1.
- Locking in stops the ticks at once. Nothing plays at 0: the reveal follows.
- Each phone counts against the server's deadline, so the phones still voting tick together.

### Errors and refusals

`error.wav`: two muted marimba notes going down, "try again".

- Plays with every `haptics.error()`, at the same instant: a wrong code (the shake), a full room, a refused join, Start refused (`not_enough_players`, `too_few_films`), a failed share, and every other refusal of the player's own action. It follows the haptic's meaning in `lib/haptics.ts`, so a screen that has no `haptics.error()` (the closed room, reconnecting) has no error sound either.
- This reverses the old line "bad news never gets a sound": Harry chose it, and it's rare (about one in five games).

### Key buttons

`tap.wav`: a tiny, barely there click.

- Only on the three buttons that commit the player: **Join** on the join sheet (`join:link.join`, both the sheet and its name step, [join-sheet.md](screens/join-sheet.md)), **Start swiping** (`lobby:start.cta`, the host, [lobby.md](screens/lobby.md)) and **Lock in** (`finale:lockIn`, [final-cut.md](screens/final-cut.md)). About 3 a night. Every other button stays silent.
- Plays on press-in with `haptics.press()`, as `Pressable` does today, never on release. Not when the button is disabled.
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
| A match joins the shortlist | The night's most frequent shared beat; its double-tap haptic is enough |
| The veto | Ballots are secret |
| Locking in, beyond the button's tick | The Locked in look carries it |
| The winner screen | The match or the reveal played seconds before |
| The recap, opening the app, joining, reconnecting, the closed room | Not shared moments, or noise |
| Solo: the checkpoint and the pick | No vote yet: they stay silent as their specs say |

## Wiring it

The shape below is a suggestion; the rules above are not.

- **`lib/sound.ts`** keeps one audio mode and one player per file. The fixed names: `match`, `reveal`, `start`, `error`, `tap`. Two helpers pick the file: one for an arrival from the seat count (clamped to 2..10), one for the countdown from the seconds left. `require('@/assets/sounds/match.wav')` and so on.
- **Preloading.** Create `tap` and `error` once the settings are read at launch: they must play without a delay. Create `match`, `reveal`, `start` and the arrivals when the room layout mounts, the countdown ticks when the Final Cut mounts, and release them when the room ends. A player made at play time is too slow for the tick.
- **Replaying.** A sound that plays again (two taps, two errors) restarts from the start. Don't queue.
- **The button tick:** a `sound` option on `Pressable` (and so `Button`), played next to the haptic in `onPressIn` when not disabled. Only the three buttons set it.
- **The error sound:** a single function that fires `haptics.error()` and the error sound together, used everywhere `haptics.error()` is called today (about 30 places), with a test that nothing outside `lib/` calls `haptics.error()` alone. The haptics switch and the Sound switch stay separate: either one off still lets the other through.
- **Settings' helper** under the Sound switch (`settings:preferences.helper`) says today that sounds only play at the match and the reveal. It changes to the new text in [settings.md](screens/settings.md#copy-settings-namespace-new) in the same pull request, and so does the comment at the top of `lib/sound.ts`.
- **Latency.** The tick must start within about 20 ms of the press haptic, and every other sound within about 100 ms of its moment. If the tick lands late on a low-end Android, don't ship it on that phone: tell Harry.
- **Tests** (one per rule, rule 4): the reveal sound's start time in each of the three cases, the seat count to the arrival file, the seconds left to the countdown file and no tick after lock-in, nothing plays with the Sound switch off, the three buttons play the tick on press-in and a disabled one doesn't, every refusal plays the error sound, a re-read or a cold start plays no start or arrival sound, and `sonic-logo.wav` is never required. The feel check covers hearing them on a couch.

## Making or changing a sound

The sounds come from the [sound lab](https://claude.ai/artifact/4XjyPFbnRtF9C7GhSgL2Vy) (private to Harry), where each one is a recipe: `tadum-match`, `tadum-reveal`, `s-lights`, `a-scale`, `cd-clock`, `e-bonk`, `t-tick`, `n-tadum` and `l-full`. The export renders each at 48 kHz, mixes it to mono (the logo stays stereo), and cuts the 6 ms of silence the lab's compressor adds at the start. Change a sound in the lab and export them all again, so the levels stay matched.

## Open questions

None. Q1 (the reveal's timing) was answered on 6 November 2026: the ta-dum lands on the winner's lift ([the reveal](#the-reveal)).

# Solo mode and My films

Harry asked on 5 November 2026 for a way to play alone at launch, a list of every film you liked, and the films you've seen. This doc turns that into options with a recommended default for each, so he can answer in one go. Written by the game designer agent on 5 November 2026, with the designer's skills for the screens. It builds on [the modes](game-modes.md#the-modes), "Pick for me" in [later modes](game-modes.md#later-modes), [free vs Host Pro](monetization.md#free-vs-host-pro), the film history row in [what we store](privacy.md#what-we-store-and-why), [film history and taste](../architecture/data-model.md#4-film-history-and-taste), [retention](../architecture/data-model.md#retention), the deck engine's [signals](../architecture/deck-engine.md#signals) and [labels](../architecture/deck-engine.md#reason-labels), [passing review](store-listing.md#passing-review) and the [Home spec](../design/screens/home.md). Harry answered the same day and took every default: see [Decided](#decided). The options below are the reasoning behind the answers.

Every number below comes from one bot with made-up tastes ([tools/sim/solo.mjs](../../tools/sim/solo.mjs), in the spirit of the model in [simulations.md](simulations.md#the-model)). It tests mechanics, not fun.

## Contents

- [What Harry asked](#what-harry-asked)
- [Decided](#decided)
- [1. Solo at launch](#1-solo-at-launch)
- [2. The tab bar](#2-the-tab-bar)
- [3. What solo ends with](#3-what-solo-ends-with)
- [4. A room with one seat, or a separate flow](#4-a-room-with-one-seat-or-a-separate-flow)
- [5. Solo and the decks](#5-solo-and-the-decks)
- [6. My films: grouping and tiles](#6-my-films-grouping-and-tiles)
- [7. What Seen records](#7-what-seen-records)
- [8. The cap](#8-the-cap)
- [9. The store review](#9-the-store-review)
- [10. Storage, privacy, retention, export and deletion](#10-storage-privacy-retention-export-and-deletion)
- [11. Accounts](#11-accounts)
- [12. The M6.20 playtest and the launch timeline](#12-the-m620-playtest-and-the-launch-timeline)
- [The screens to spec](#the-screens-to-spec)
- [The simulation](#the-simulation)

## What Harry asked

In his words, condensed: "Can we ship a solo game mode at launch... people could still play when alone, and every yes swipe is added to a list, and it would also allow us to record movies that have been watched by the user... useful at launch when people try the app without friends... maybe limited amounts of swipes per day or week unless on pro?" And: "Would we have to include bottom tabs on the main page, so they can see their list? The list page could have two tabs, one for shared rooms likes, and one for solo likes? Maybe an all one? I think it should be a grid of movies."

Two things this has to respect:

- **The promise.** A group agrees on a film within about 5 minutes. Solo must not slow group play, and a person alone should also reach a film fast if they want one.
- **The limits.** Nobody ever sees who liked or noped what (repo rule 6, and the deck engine's [label rule](../architecture/deck-engine.md#reason-labels)). No streaks, no guilt, no pressure: families and kids use this app.

## Decided

Harry answered on 5 November 2026: every question takes the recommended default. All twelve are in [decisions.md](../decisions.md#decided). game-modes.md, monetization.md, privacy.md and store-listing.md follow them now; the screen specs wait for the design task (M6.39), and data-model.md changes with M6.41, when the columns exist. The other options in the numbered sections are kept for the record.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Do solo mode and My films ship in the first release? | **Yes (Harry),** as below. They give a lone first-time player something to do, a reason to open the app between nights, and a way for a lone reviewer to reach a film |
| 2 | Is the home screen two bottom tabs, Play and My films, with Settings still behind its button? | **Yes (Harry).** No third tab until there's a profile to put in it (M15, M20). Rooms cover the tab bar |
| 3 | Does solo never end on its own, with a card every 20 cards that says how many films you liked and offers "Pick one" or "Keep going"? | **Yes (Harry).** "Pick one" shows that session's likes; tapping one gives tonight's pick with where to watch. The player can stop at any time; their likes are already saved |
| 4 | Is a solo session a room with one seat (a `solo` game mode), reusing the deck, votes, undo and the swipe screen? | **Yes (Harry).** No lobby, no code anyone can join, no shortlist, no finale, no card count or time limit |
| 5 | Do solo decks skip films you already answered in solo, and do solo likes leave group decks alone at launch? | **Yes to both (Harry).** From M19, solo swipes count as taste at a game swipe's weight; a silent "My films bonus" is tested there. Never a label, never a watchlist |
| 6 | Is My films a 3-column poster grid with two segments, Liked and Seen, and chips All, With friends and Solo under Liked? | **Yes (Harry).** Newest first, poster only, a "Picked" badge on a group's pick, a star on a super like. A group pick you sat for shows under With friends even if you didn't like it |
| 7 | Does Seen list only marks made in the app (Seen it in any game, Mark as seen, later the after-game yes), and does removing one bring the film back to your decks? | **Yes (Harry).** Letterboxd's seen films keep filtering decks but aren't listed until M20 decides |
| 8 | Is there a solo cap of 100 cards a day at launch, with group play never capped? | **Yes (Harry).** At the cap a calm card: "That's today's solo deck. New cards tomorrow." No counter on screen, no Pro mention until M21. The number lives in `app_config` |
| 9 | Does solo replace the reviewers' demo room? | **Yes (Harry).** M11.7 moves into reserve, built only if a review is rejected. M11.8's notes say "Play alone" for one device and two devices for a group |
| 10 | Does My films live in `user_titles` (the film history table that exists), with new columns and a `solo` source, exported and deleted with the rest? | **Yes (Harry).** Retention keeps it while the account exists, as today. privacy.md says your likes are never shown to anyone |
| 11 | Does the first release stay without accounts, with My films saying plainly that it's kept with this phone? | **Yes (Harry).** Saving an account stays in M15 |
| 12 | Do the new tasks land before the first store builds (M10.2), without blocking the M6.20 playtest? | **Yes (Harry).** M6.20 asks one question about playing alone; the alpha nights (M10.3) test solo and My films. The closed beta date doesn't move |

### New tasks

For the planner to write briefs. Numbers follow the last M6 task (M6.38); the planner may renumber.

| Task | Type | Size | Needs | What |
| --- | --- | --- | --- | --- |
| **M6.39** Solo and My films: specs and beats | design | L | | Screen specs for the tab bar, Play, Play alone setup, the solo swipe variant (top bar, checkpoint card, cap card, pick sheet), the solo pick, My films and the film sheet ([The screens to spec](#the-screens-to-spec)); the checkpoint and solo pick beats in [moments.md](../design/moments.md) (from the drafts in [section 3](#3-what-solo-ends-with)); French and English copy; the new Figma frames on the First release page |
| **M6.40** The solo game mode | backend | L | M6.29, M6.34 | A `solo` row in `game_modes` (1 player; no card count, time limit, finale or shortlist; `hide_seen`; super likes without a limit). `api.start_solo(settings)` creates and starts the room in one call; `api.join_room` answers `not_found` for a solo room; the minute sweeper ends a solo room as `done` after 30 minutes without a vote and never abandons it for "fewer than 2 players"; `api.leave_room` ends it. The SQL deal skips films the player answered in earlier solo rooms and films in their My films. `api.solo_pick(room, title)` records the pick. pgTAP for each rule |
| **M6.41** My films in `user_titles` | backend | M | M6.40 | The `solo` source, `liked_at`, `super_liked` and `picked_at`. `api.cast_vote` writes likes (group rooms to `app`, solo to `solo`) and undo takes them back; a pick sets `picked_at` for every seated profile. `api.my_films(segment, filter, cursor)`, `api.set_film_seen(title, seen)`, `api.remove_my_film(title)`. `api.export_my_data` carries the new columns. pgTAP: undo, both sources, deletion cascades, `internal.run_retention` leaves the rows, no label or card back reads `liked_at`. Updates data-model.md and privacy.md |
| **M6.42** The solo daily cap | backend | S | M6.40 | Solo cards answered per profile per Paris day; `app_config.solo_daily_cards` (100). The deal stops at the cap and `api.start_solo` answers `daily_limit`; undo gives nothing back; group rooms never count. pgTAP |
| **M6.43** The tab bar | app | M | M6.39 | Expo Router tabs: Play (today's Home) and My films. Host setup, join, rooms and Settings stack over the tabs, with no tab bar. Deep links and the redirects from `/` keep working. Maestro run on the simulator |
| **M6.44** Play alone | app | L | M6.39, M6.40, M6.42, M6.43 | The Play alone card on Play; Play alone setup (host setup without inviting); the solo swipe variant (no pills, shortlist, near miss or match overlay); the checkpoint card every 20 cards; the pick sheet and the solo pick; the cap card. Strings in French and English. Maestro run on the simulator |
| **M6.45** My films and the film sheet | app | L | M6.39, M6.41, M6.43 | The grid, segments, chips, badges, empty and offline states; the film sheet with the card back, where to watch on the player's services, Remove and Mark as seen. Strings in French and English. Maestro run on the simulator |
| **M6.46** Analytics for solo and My films | app | S | M9.2, M6.44, M6.45 | Five events ([section 10](#10-storage-privacy-retention-export-and-deletion)). No film ids in PostHog |

Roadmap changes that go with them:

- **M9.3** (the headline metric views) leaves solo rooms out of time to a pick, rooms ending with a pick and second game, and adds solo sessions, cards per session and solo picks.
- **M11.7** (the demo room) moves out of M11 into reserve: built only if a store review is rejected.
- **M11.8** (review notes) needs M6.44 instead of M11.7, and says how to play alone.
- **M6.20** (the playtest) asks every player "would you use it on your own?". Its needs don't change.
- **monetization.md**: "Pick for me (solo)" becomes the free solo mode with a daily cap, and Pro lifts the cap (M21). Applied with the decision.
- **game-modes.md**: "At least 2 voters" stays for group modes; solo has no match check at all. Applied with the decision.
- **store-listing.md**: solo replaces the demo room in the review notes. Applied with the decision.
- **privacy.md**: the film history row and what rooms reveal. Applied with the decision; data-model.md's `user_titles` table follows with M6.41.

## 1. Solo at launch

**Why yes.** The first release's only path is a group. Someone who installs the app alone to try it, or a reviewer, meets a host card that asks them to invite friends, and nothing else to do. Solo gives them the swipe (the best part) in two taps. My films gives everyone a reason to open the app between nights, and it turns "Seen it" from a mark that disappears into something you can see and undo. And it's a better cold start than the taste check: 30 solo cards tell the deck more than 8 taste check answers ([section 5](#5-solo-and-the-decks)).

**The risk.** Solo could pull people away from group nights, which are the growth loop. It shouldn't: solo ends with "Pick one" from your own likes, a quieter result than a group's reveal, and Play keeps hosting first. The closed beta can watch whether solo players go on to host.

**What it costs.** Eight tasks, three of them large ([New tasks](#new-tasks)), and one large task saved (the demo room, [section 9](#9-the-store-review)).

**Options.** A: solo and My films at launch (recommended). B: My films only at launch (group likes, picks and Seen), solo after launch. It's cheaper by about three tasks, but leaves a lone player and the reviewer with nothing to play. C: both after launch, in M15 or M18. Keeps the first release as decided on 29 October, and the demo room stays.

## 2. The tab bar

Today Home is one screen with the host card and the join card, and a settings button ([home.md](../design/screens/home.md)). The Figma has no tab bar, no grid and no list frame: the [Figma map](../design/figma-map.md) lists none on either page. The original Profile screen (18 Profile, `26:1214`) is the closest. I couldn't open the Figma from this session; the designer opens that frame once for reference and draws the new frames in M6.39.

### Option 2A: two tabs, Play and My films (recommended)

- **Play** is today's Home with a third card, Play alone, under the join card. The header (avatar, greeting, settings button) stays.
- **My films** is the grid ([section 6](#6-my-films-grouping-and-tiles)).
- **Rooms cover the tabs.** Host setup, join, every room screen and Settings are full-screen stacks over the tab bar, so the game never shows tabs, and the swipe screen keeps all its height.
- **Copy, proposed:** « Jouer » and « Mes films »; "Play" and "My films".
- **What changes in code:** an Expo Router `(tabs)` group holding Play and My films; `/home` becomes the Play tab, and the redirects from `/` and from a room's exit (`useExitRoomToHome`) go there. Deep links (`/join/[code]`) are unchanged. A `TabBar` component in `ui/` with its gallery entry.

### Option 2B: no tab bar, a My films row on Home

A row under the cards on Home ("My films", a strip of the last 5 posters and a count), opening a pushed screen. Cheapest (no route change), but a list you open from a row feels like a setting, and Home gets longer on a 375-point phone.

### Option 2C: three tabs, Play, My films and Profile

Profile holds Settings now, and the account and Letterboxd later. Right once there is something to put in it (M15, M20); at launch it would be Settings with a new name.

## 3. What solo ends with

The revival plan's "Pick for me" ([later modes](game-modes.md#later-modes)) ended after 20 cards with a vote between your likes, and a super like was the pick. Harry's sketch has no end at all. A person alone may want either: a film for tonight, or a few minutes of swiping that fills their list.

### Option 3A: no end, a checkpoint every 20 cards, an optional pick (recommended)

- **The checkpoint.** After 20 cards, then every 20 more, a card in the stack says "You liked 5 films. They're in My films." with two buttons, Pick one and Keep going. It's answered like a card: Keep going (or a swipe) goes back to the deck.
- **Pick one** opens a sheet with this session's likes, super likes first, then newest first. Tapping one is tonight's pick: the solo pick screen (the winner screen's layout: the poster, the title, where to watch on the player's services, the JustWatch credit), with Done to go back to Play. The room ends `done` with the pick.
- **Stopping.** Leave in the top bar ends the session at any time, with no alert: every like is already in My films.
- **No likes at card 20** (no session in the simulation, but a person can nope everything): "Nothing yet. Keep going?" with Keep going only.
- **Why 20.** With the launch deck, a bot has a median of 5 likes after 20 cards (1:18), and 89% of sessions have 3 or more: enough to choose from, quickly. The 5-minute promise holds alone: the 10th like comes at a median of 2:29 ([The simulation](#the-simulation)).
- **Super like** stays, with no limit in solo (there's nobody to outweigh). It puts a star on the tile and puts the film first in Pick one.

**The checkpoint beat** (a draft for [moments.md](../design/moments.md); the designer turns it into motion once Harry agrees):

| | |
| --- | --- |
| When | After card 20 of a solo session, then every 20 cards |
| What it tells the player | "Here's what you've got. Pick one for tonight, or keep going." |
| How long | Until the player answers. It never moves on by itself |
| What the player sees | The card slides in as the next card. Up to 5 liked posters fanned on it, the count in display type, the two buttons. One light haptic |
| Never shown | Nopes, a streak, "you're on a roll", a timer, a target ("5 more to go"), a nudge to keep swiping |

**The solo pick beat** (draft): the poster lifts out of the sheet and settles where the winner screen shows it, the bulbs light, one success haptic, no sound. Calmer than a group's reveal: there's no suspense when you chose it yourself.

Copy, proposed:

| Key | French | English |
| --- | --- | --- |
| `solo.checkpoint.liked_one` | Tu as aimé 1 film. Il est dans Mes films. | You liked 1 film. It's in My films. |
| `solo.checkpoint.liked_other` | Tu as aimé {{count}} films. Ils sont dans Mes films. | You liked {{count}} films. They're in My films. |
| `solo.checkpoint.none` | Rien pour l'instant. On continue ? | Nothing yet. Keep going? |
| `solo.checkpoint.pick` | Choisir | Pick one |
| `solo.checkpoint.continue` | Continuer | Keep going |
| `solo.pickSheet.title` | Lequel ce soir ? | Which one tonight? |
| `solo.pick.eyebrow` | Ton film du soir | Tonight's pick |

French counts 0 and 1 as singular; the zero case has its own line anyway.

### Option 3B: no end and no pick, a summary only

As 3A without Pick one: the checkpoint says how many films you liked and offers My films or Keep going. Simpler (no pick sheet, no solo pick screen, no `api.solo_pick`), but a person alone tonight has to pick from a grid with no help, and a reviewer never reaches "a pick" ([section 9](#9-the-store-review)).

### Option 3C: the revival plan's Pick for me

After 20 cards the session ends with a vote between your likes (the Final Cut for one: order them), and a super like ends it at once as the pick. Fastest to a film, but a solo vote is just ordering your own list, and a super like that ends the session surprises anyone who meant "I love this one".

## 4. A room with one seat, or a separate flow

### Option 4A: a room with one seat, a `solo` game mode (recommended)

A solo session is a room in the mode `solo`, with `min_players` and `max_players` 1. What it reuses, already built and tested: dealing and the SQL baseline's refills, `api.cast_vote` with its offline queue and idempotent retries, undo, Seen it and its mark in `user_titles`, the swipe screen and its gestures, the age cap and services filters, the after-game data (`rooms.stats`). Rule 1 holds: Postgres decides, the server deals, the phone shows.

What it changes:

| Where | Change |
| --- | --- |
| `game_modes` | A `solo` row: 1 player, `matches_to_end` unset, defaults with no card count, no time limit, no super-like limit and the `hide_seen` rule (alone, you want something new; no rewatch question) |
| Starting | `api.start_solo(settings)` creates the room and starts it in one call: no lobby, no invite, no host handover. The room still draws a code (the column is required), and `api.join_room` answers `not_found` for it, so nobody learns a solo room exists |
| The match check | Nothing to change: "At least 2 voters" already means one seat never matches. No near miss, no shortlist |
| The finale | Never starts: `internal.maybe_start_finale` skips `solo` |
| The sweeper | A solo room is never abandoned for "fewer than 2 players present". It ends `done` after 30 minutes without a vote (starting value), or when the player leaves |
| The deal | Skips films this player answered in an earlier solo room and films in their My films ([section 5](#5-solo-and-the-decks)) |
| The pick | `api.solo_pick(room, title)`: a film this seat liked in this room, recorded as the room's pick (`matches`, `pick_order` 1); the room ends `done` |
| Metrics | Solo rooms are left out of the group metrics (M9.3) |

### Option 4B: a separate flow

`api.solo_cards()` and `api.solo_answer(title, answer)` write straight into the player's film history, with no room. Cleaner tables and metrics, but it rebuilds the deal, refills, undo, the offline queue and idempotency, and the swipe screen would need a second data source. Twice the tests for the same gestures.

### Option 4C: a room, but answers kept only in the film history

As 4A, but solo answers skip `votes` and go to `user_titles` only. It saves nothing: undo, the refill and the deal's "answered before" check all read `votes`.

## 5. Solo and the decks

Three questions: what solo decks remember, whether solo likes change group decks, and whether a solo like counts as a watchlist.

**What solo decks remember.** Without card memory (M17), the launch deck is quality and popularity, reshuffled each time. A player who swipes solo every evening would meet the same top films again and again: "I already said no". Recommended: the solo deal skips every film the player answered in an earlier solo room (a lookup on their own `votes`) and every film in their My films, films saved with the bookmark included (a save is a solo like, Harry, 6 November 2026). Group decks are unchanged, and never read a save: a film you noped alone yesterday can come up tonight with friends, which is right (tonight the question is the group's).

**Do solo likes shape group decks?**

| Option | What it does | Verdict |
| --- | --- | --- |
| 5A: not at launch, taste from M19 (recommended) | At launch nothing reads them: the SQL deal has no per-player fit ([the SQL fallback](../architecture/deck-engine.md#the-sql-fallback)). From M19, solo swipes are taste signals at a game swipe's weight (like +0.4, super like +0.8, nope -0.15), and a silent "My films bonus" (+0.5 in that player's fit, half the watchlist's) is an A/B value in M19 | Costs nothing now. The data is there when the taste builder needs it |
| 5B: a watchlist bonus at launch | A liked solo film gets the watchlist bonus in group rooms | Needs per-player fit in the SQL deal, which the first release doesn't have. And the bonus comes with labels ("On Sam's watchlist") |
| 5C: never | Solo stays separate | Wastes the best cold-start data we'll have |

**Never a watchlist, never a label.** A solo like must not set `on_watchlist`: watchlist labels ("On Sam's watchlist", "On Sam and Jo's watchlists") show in rooms, and the label rule says a room never sees someone's swipes or games played with other people. A silent bonus is safe: a boosted card looks like any other card, so nobody on the couch can tell.

**The cold start.** Today a new player's confidence is 0 until their first game ([from signals to a profile](../architecture/deck-engine.md#from-signals-to-a-profile)). Swipes count half, so 30 solo cards give an n of about 15 and a confidence of about 0.5, higher than the taste check's 0.35. From M19, a player with solo history can skip the [taste check](../architecture/deck-engine.md#the-taste-check).

**Kids.** Solo with an age cap under 13 follows the game's rules: swipes count at 30% for taste, and no PostHog events leave the phone.

**Card memory (M17.1).** When `card_history` lands, solo rooms write it as group rooms do, so freshness is the same everywhere.

## 6. My films: grouping and tiles

### Option 6A: two segments, chips under Liked, a poster grid (recommended)

- **Segments:** Liked and Seen, at the top (a segmented control; « Aimés » and « Vus »).
- **Chips under Liked:** All (default), With friends, Solo (« Tous », « Entre amis », « Solo »). Each shows nothing when it's empty, with its own empty line.
- **The grid:** 3 columns, `px-4` with a gap of 8, so tiles are about 109 by 163 points at 375 wide. Newest first (when you liked it, or marked it seen). Infinite scroll by cursor.
- **A tile:** the poster only, `rounded-sm`, with its placeholder (title and year on the placeholder when there's no poster). At most one badge in the top corner: "Picked" (« Choisi », a marquee `Tag`) for a film a group picked while you sat in the room, or a star for a super like. The screen reader reads the title, the year and the badge.
- **A group's pick** you sat for appears under With friends even if you didn't like it: it's the room's public result, and the night's film is the one you'll look for.
- **Only ever your own.** No count of who else liked it, no "Sam liked this too", no night or group names. Grouping by night and by crew is [M24.4](roadmap.md#m24-more-countries-and-content) (crews and history, Pro), which this doesn't pull forward.

Empty states, proposed:

| | French | English |
| --- | --- | --- |
| Liked, nothing yet | Les films que tu aimes arrivent ici. Joue seul ou entre amis. | Films you like land here. Play alone or with friends. |
| Seen, nothing yet | Les films que tu as déjà vus arrivent ici. | Films you've seen land here. |

**The film sheet.** Tapping a tile opens a bottom sheet with the card's back (the `MovieCard` back already built: poster, title, year, runtime, synopsis), where to watch on the player's saved services with the JustWatch credit, and two actions: Mark as seen (or Not seen, on a seen film) and Remove (« Retirer »). Remove takes the film out of Liked; it never changes a game's votes. No confirmation: a short toast with Undo instead.

### Option 6B: one grid with a filter sheet

All films in one grid, and a filter button for liked, seen, solo, with friends. One screen fewer to design, but the common case (what did I like) is two taps deeper.

### Option 6C: a list by night

Rows grouped by date: "Friday, with Sam and Jo", then its films. That's crews and history (M24.4, Pro), it shows names, and it doesn't fit solo likes.

## 7. What Seen records

Today "Seen it" in a game already writes `user_titles` (`source` `app`, `seen` true), and later rooms leave the film out. Nobody can see that mark or undo it after the game.

### Option 7A: in-app marks only (recommended)

- **What's listed:** films you swiped Seen it on (in a group or alone), films you marked seen in the film sheet, and later films you answered "Yes" to in "Did you watch it?" (M15.5; the function already writes the mark).
- **Removing a mark** (Not seen in the sheet) brings the film back to your decks. This fixes a real problem: a Seen it swiped by mistake today hides that film forever.
- **No ratings** at launch. The after-game "Loved it / It was fine" stays in the taste data, not on the tile.
- **Letterboxd** (M20): its seen films keep filtering decks but aren't listed here. Whether My films may show imported diary data is a question for the lawyer's read (M20.1) and Letterboxd's terms.

### Option 7B: every source, Letterboxd included

The merged `user_title_facts.seen`. Complete, but at M20 a big diary floods the grid, and listing imported data may come close to recreating a Letterboxd feature (their terms, section 6.4).

### Option 7C: no Seen segment at launch

Liked only; Seen marks keep filtering decks invisibly. Saves a segment, keeps the "seen by mistake" problem.

## 8. The cap

monetization.md says no swipe cap is our edge over ReelMatch, and that guests must never be charged to join or swipe ([constraints](monetization.md#constraints)). That's about group games, where guests are the growth loop. A solo cap doesn't touch them, but the doc needs a line saying so. Pro doesn't exist until M21, so at launch a cap has nothing to sell.

What a cap means in time and likes, with the launch deck (bot with made-up tastes):

| Cards a day | Time to reach it (median) | Likes by then (median) |
| --- | --- | --- |
| 50 | 3:19 | 13 |
| 100 | 6:38 | 23 |
| 200 | 13:20 | 43 |

### Option 8A: 100 solo cards a day from launch (recommended)

- **Counted** per profile, per day in Paris time, on solo cards answered. Group rooms never count and are never capped. Undo gives nothing back.
- **Why from launch.** A limit that exists from day one is part of the mode. A limit added later takes something away from people who already play, which reads as a bait and switch. 100 cards is 6 to 7 minutes and about 23 likes: well past what a night needs.
- **At the cap:** the deck ends with a calm card, "That's today's solo deck. New cards tomorrow." (« C'est tout pour le solo aujourd'hui. Nouvelles cartes demain. »), with My films and Host a movie night. Tapping Play alone at the cap shows the same card. No countdown to midnight, no "3 left", no Pro mention until M21. At M21 the card may add one quiet line about Pro.
- **Never mid-gesture.** The deal stops at the cap, so the phone shows the card when the deck runs out, with no network wait (rule 5).
- **Tunable.** The number is `app_config.solo_daily_cards`, so M21 can change it without a release. A guest who reinstalls starts again at 0; the hosting cap has the same hole, and M21 ties both to accounts.

### Option 8B: no cap at launch

Count solo cards per day in the metrics only, and decide the cap at M21 with real numbers. Simplest, and nobody ever meets a limit. The cost is the bait-and-switch risk when a cap arrives.

### Option 8C: a weekly cap (500 a week)

Lets someone binge one evening. Harder to explain ("new cards on Monday"), and a weekly reset is a long wait for someone who hit it on Tuesday.

## 9. The store review

M11.7 and M11.8 plan a demo room: a reserved code where two server bots join and swipe, so a lone reviewer can reach a match and a Final Cut ([passing review](store-listing.md#passing-review)). It's a large server task.

| Option | What reviewers do | Cost |
| --- | --- | --- |
| 9A: solo replaces it, the demo room in reserve (recommended) | "To play on one device: tap Play alone, like a few films, then Pick one at the checkpoint. A group game needs two devices: host on one, join with the code on the other." | Saves M11.7 (L). Risk: a reviewer who wants to see the group flow on one device. Then M11.7 is built, and the review resubmitted |
| 9B: both | Solo and the demo room | Keeps the L task for little gain |
| 9C: the demo room only | As planned | Solo then doesn't help review |

Solo needs Pick one (option 3A) for this: "the reviewer reaches a pick" is what guideline 2.1 checks.

## 10. Storage, privacy, retention, export and deletion

**A correction to the starting sketch.** The sketch said retention deletes room data, so My films couldn't read old votes. That's not what the rules say today: finished rooms, seats, votes and matches are kept while the account exists ([retention](../architecture/data-model.md#retention)). `internal.run_retention` deletes deck entries after a day, cards nobody voted on after 7 days, lobbies that never started, and the swipe log after 13 months ([retention jobs](../architecture/operations.md#retention-jobs)). Votes stay. My films still shouldn't read votes, for the reasons under 10C.

**The film history table already exists.** privacy.md's "Film history" row is `user_titles` ([film history and taste](../architecture/data-model.md#4-film-history-and-taste)): one row per player, film and source, with `seen`, `rating`, `on_watchlist` and `reaction`. It cascades when the profile is deleted, `api.export_my_data` already returns it as `film_history`, `run_retention` never touches it, and Seen it already writes it.

### Option 10A: My films in `user_titles` (recommended)

| Change | What |
| --- | --- |
| A `solo` source | A new `title_fact_source` value (an enum value added, nothing removed). Group games keep writing `app`, solo writes `solo`, so the chips are a filter on the source |
| `liked_at` | When you liked it (null when you didn't, or removed it). Written by `api.cast_vote` on a like, super like or "Watch it again tonight? Yes"; undo clears it if the like set it (the pattern Seen it's mark already uses) |
| `super_liked` | For the star |
| `picked_at` | On `app` rows: a group picked it while you were seated. Written for every seated profile when the pick is made, so the badge never depends on the room's rows |
| Reads | `api.my_films(segment, filter, cursor)` returns your own rows only, newest first. `api.set_film_seen(title, seen)`, `api.remove_my_film(title)` and `api.set_film_saved(title, saved)` change your own rows. A save with the card's bookmark is a solo like (`liked_at` on the `solo` row, `saved_at` marking it as a save's; decided on 6 November 2026, replacing M6.50's Later segment): it is under Liked with the Solo chip, and unsaving takes back only a save's like |

### Option 10B: a new `my_films` table

One row per player, film and kind (liked, seen, picked), with its context. Clearer for this screen, but a second film history next to `user_titles`, with the seen mark in two places that can disagree.

### Option 10C: read from the game tables

No new storage: My films joins your seats, votes and matches. Why not: Remove would have to change a game's votes (they're the game's record and the training data); a later retention change would silently empty the list; and every open of My films scans every room you sat in.

### What changes with 10A

| Where | Change |
| --- | --- |
| [privacy.md](privacy.md#what-we-store-and-why), Film history | Adds "your likes and super likes from games and solo sessions, films a group picked with you, and when". Who else sees it: nobody. Likes are never shown in a room, never a label, never on a card back. Kept: while the account exists (unchanged) |
| privacy.md, Rooms and seats | Solo sessions are rooms with one seat, kept as rooms are |
| privacy.md, what rooms reveal | Adds: never anyone's My films or solo games |
| Consents | None new: My films runs the game you asked for (contract). The "Use my games to improve recommendations" switch covers solo games too |
| Export ([players' rights](privacy.md#players-rights-in-practice)) | `film_history` rows carry `liked_at`, `super_liked` and `picked_at`; solo rooms appear with the other games, marked `solo` |
| Deletion (M8.5) | Nothing to build: the rows cascade with the profile. A pgTAP test proves it |
| Retention (M8.9) | Nothing to change: a test proves `run_retention` leaves `user_titles` alone. Solo rooms follow the room rules |
| Guests | A guest's My films goes when the guest is deleted after 90 days without activity, as all their data does |
| The store privacy forms | No new data type: My films and solo games are Gameplay Content on Apple and Other actions on Google, checked in M11.6 ([privacy-forms.md](../store/privacy-forms.md)) |
| Analytics ([events](analytics.md#events)) | Five events, named as [analytics.md](analytics.md#naming) asks and with no film ids: `solo:session_start` (`service_count`, `has_time_budget`), `solo:checkpoint_view` (`card_count`, `like_count` bucketed), `solo:pick_submit` (`card_count`), `solo:cap_show` (`placement`: `deck`, `play`), `my_films:grid_view` (`segment`, `filter`, `film_count` bucketed). Opening a film, Remove and Mark as seen are read from the database |

## 11. Accounts

Accounts come with M15, after launch ([accounts](onboarding.md#accounts)). Until then My films lives on a guest account tied to this phone: a reinstall or a new phone starts with an empty list. It's no different from today's game history, but now it's visible, so people will notice.

- **11A (recommended):** no accounts at launch. My films says it once, quietly, under the chips: "Saved with this phone for now." (« Enregistré sur ce téléphone pour l'instant. »). When M15 lands, that line becomes the save offer ("Keep your films on any device").
- **11B:** pull Save account (M15.1, M15.2, M15.3, M15.10) before launch. It's four tasks with a spike, and Sign in with Apple's rules then apply to the first release.
- **11C:** say nothing. Honest copy costs one line; finding out after a reinstall costs trust.

## 12. The M6.20 playtest and the launch timeline

- **M6.20 doesn't wait.** It tests group play; solo doesn't change a group rule. It adds one question for every player: "Would you use it on your own?"
- **The new tasks land before the first store builds** (M10.2), so the alpha nights (M10.3) try solo and My films on real phones. Ask in the alpha: did you play alone, did you open My films, did Pick one help you choose?
- **The timeline.** Eight tasks: three large (the specs, Play alone, My films), three medium, two small. Against that, M11.7 (large) leaves the launch path. With two or three lanes and the pace so far, that's about a week of one lane's work, alongside M7 to M9. The closed beta date (from 18 January 2027, [timeline](../agent-workflow.md#timeline)) doesn't move.
- **The tab bar changes Home** after M4.7. Specs that mention `/home` (home.md, settings.md's back, the winner's exit) get updated in M6.39 and M6.43.

## The screens to spec

All in M6.39, with frames drawn on the Figma's First release page. Each spec follows the shape of [home.md](../design/screens/home.md): purpose, layout, states, copy, motion, accessibility, differences from the Figma.

| Screen | Route | What it is |
| --- | --- | --- |
| The tab bar | `(tabs)` | Two tabs, Play and My films, icons and labels; hidden on every room, host, join and Settings screen. A new `TabBar` in `ui/` |
| Play | `/(tabs)/play` (was `/home`) | Today's Home plus the Play alone card under the join card: title "On your own tonight?" (« Tout seul ce soir ? »), body "Swipe at your own pace. Your likes are saved in My films." (« Swipe à ton rythme, tes j'aime sont gardés dans Mes films. »), `Button` secondary S "Play alone" (« Jouer seul ») |
| Play alone setup | `/solo` | Host setup without the invite step: services (prefilled), time budget, age cap; `Button` primary L "Start" (« C'est parti »). At the cap, the cap card instead |
| The solo swipe variant | `/room/[id]/swipe` | The same screen. The top bar: Leave, a "Solo" label, your likes count (a heart and a number; it opens nothing). No player pills, no shortlist, no near miss, no match overlay, no rewatch question. The checkpoint card, the pick sheet and the cap card ([section 3](#3-what-solo-ends-with), [section 8](#8-the-cap)) |
| The solo pick | `/room/[id]/winner` | The [winner screen](../design/screens/winner.md)'s layout, eyebrow "Tonight's pick" (« Ton film du soir »), where to watch, Done. No recap share and no Play again at launch |
| My films | `/(tabs)/my-films` | Segments, chips, the grid, badges, empty, loading (`Skeleton` tiles) and offline states, the accounts line ([section 6](#6-my-films-grouping-and-tiles), [section 11](#11-accounts)) |
| The film sheet | `/(tabs)/my-films/[title]` | A sheet: the card back, where to watch on your services, Mark as seen or Not seen, Remove with an undo toast |

Glossary words to add to the copy skill once Harry agrees: My films (« Mes films »), Play alone (« Jouer seul »), Picked (« Choisi »).

## The simulation

`node tools/sim/solo.mjs` (a few seconds; `--sessions 500` for a quicker run). 2,000 sessions per deck, seed 1. One bot per session. What's made up: a 15% like rate on a random eligible film with a spread of 0.25 between players (as in [simulations.md](simulations.md#what-is-made-up)), 12% of cards answered Seen it, 3.5 seconds per swipe at the median with 4% of swipes paused 5 to 20 seconds, and a pool of 1,500 films. The launch deck's order is taken to correlate 0.25 with one player's taste (it knows quality and popularity, not you); a taste-aware deck after M19 is taken as 0.5.

**Likes after N cards, launch deck:**

| Cards | Time (median) | Likes (median) | No like | 3 or more | 5 or more |
| --- | --- | --- | --- | --- | --- |
| 10 | 0:38 | 3 | 6% | 56% | 18% |
| 20 | 1:18 | 5 | 0% | 89% | 63% |
| 30 | 1:59 | 8 | 0% | 97% | 85% |
| 50 | 3:19 | 13 | 0% | 100% | 97% |

**Time to the Nth like, launch deck:** the 3rd at a median of 0:38 (1:28 at the 90th percentile), the 5th at 1:09 (2:26), the 10th at 2:29 (4:48). The bot likes 26 to 29% of the cards it's dealt.

**With a taste-aware deck** (after M19, deck skill made up): a median of 9 likes after 20 cards, the 5th like at 0:38 and the 10th at 1:25, and 41 to 50% of dealt cards liked. So the checkpoint at 20 cards stays right later; it just has more to show.

What the simulation leaves out: when real people stop a solo session, whether a checkpoint feels like a break or an interruption, whether Pick one helps someone alone choose, and whether solo players go on to host. The alpha nights (M10.3) and the closed beta should look at all four.

---
name: realtime-contract
description: The rooms' Realtime topics, events and payloads, who may see what, and how the phone reacts. Use when adding or changing a broadcast in SQL, handling an event in the app, or deciding what a player may see during a game.
---

# Realtime

Realtime only tells; the database decides. Missed messages are normal: the phone re-reads the room, seats, matches, round and its next cards when the channel comes back, when the app returns to the foreground, and when a vote answers `closed`.

The event list lives in `packages/contract/src/realtime.ts`. Adding an event means adding it there, in the SQL that sends it, and in the app's handler, in the same pull request. The phone drops events it doesn't know.

## Topics (private channels only, public access off)

| Topic | Phone | For |
| --- | --- | --- |
| `room:<id>` | Listens | Server events, sent with `internal.broadcast_room` |
| `room:<id>:live` | Listens and sends | Presence (key: the seat id; payload: swipe count and done, every 5 swipes) and reactions |

## Events on `room:<id>`

| Event | Sent when | The phone |
| --- | --- | --- |
| `member_joined`, `member_left`, `seat_updated` | Seats change | Refetches seats |
| `settings_changed` | The host changes settings | Refetches the room |
| `state_changed` | lobby, dealing, swiping, finale, done, abandoned | Refetches the room; the room layout moves to that state's screen |
| `host_changed` | The host role moves | Refetches seats |
| `deck_updated` | A seat's deck was re-ranked (carries the seat id) | That seat refetches its next cards and replaces what's behind the 3 mounted ones |
| `near_miss` | 2 or more liked a film without a match (Party mode) | "2 of 3 of you liked this" |
| `match` | A match, or the finale's result (`decided`, points, vetoes) | The match overlay; the winner screen if decided |
| `finale_started`, `round_progress` | The finale opens; a seat locks in | Refetches the round |
| `next_room` | The host taps Play again (carries the new code) | Offers "Join" |

## Who sees what

- **Never, in any mode:** who noped a film, another player's swipes while the game runs, anyone's taste check answers.
- **During the game:** counts only ("2 of 3"), and a star on super-liked cards in Party mode, never who.
- **The finale:** who has locked in, not what they voted; vetoed films shown knocked out, never by whom.
- **After the pick:** Party mode may show who liked the runners-up; Blind mode shows counts.

Source: game-modes.md#what-players-see-party-and-blind. When a payload would reveal more than this, it's a blocking review finding.

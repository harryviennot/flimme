# Reconnecting

Screen 24 in the Figma (`30:1722`). Not a route: the room layout (`/room/[id]/_layout.tsx`) owns the connection state, and each room screen shows it. Built in M4.21 (M4.10 was split: M4.10 is the layout, M4.21 Realtime and this banner, M4.22 rejoining). Written on 30 October 2026 from [realtime](../../architecture/app-structure.md#realtime) and [who counts](../../product/game-modes.md#who-counts-presence-joining-and-leaving); updated on 3 November 2026 with the [M3.11 spike's findings](../../architecture/app-structure.md#spike-4-findings-the-private-room-channel-m311-3-november-2026) and slice 7's answers. This slice uses it in the [lobby](lobby.md); the swipe screen's part (votes waiting, the offline header) comes with slice 10.

## Purpose

Say plainly when the room can't hear this phone, keep the player's seat, and catch up without a word once the connection is back. Realtime only tells; the database decides.

## Layout

**`RoomBanner`** (`components/screens/room/room-banner.tsx`, a screen piece, no gallery entry): a `Banner` (`ui/banner`) tone `warn` with the message for the layout's connection state, or nothing. The layout can't draw under each screen's `TopBar`, so the layout keeps the state (both channels' statuses and `useOnline()`) in its context and **each room screen places `RoomBanner` directly under its `TopBar`**, pushing the content down (never covering the code or the Start button). M4.21 puts it on the placeholder lobby, M4.11 on the real one, and every later room screen on its own. One message at a time; offline wins over reconnecting.

## The connection recipe

From the spike (M3.11). The phone opens `room:<id>` and `room:<id>:live`, both `config: { private: true }`.

| What a channel reports | The banner | The phone does |
| --- | --- | --- |
| `CHANNEL_ERROR` or `TIMED_OUT`, including `MissingPartition` on the very first join of a fresh project | `common:states.reconnecting` after a 2-second grace | Nothing more: supabase-js rejoins by itself. **No retry loop on top** |
| `CLOSED` the app didn't ask for (the token expired before a refresh, for a phone that slept offline longer than the token's life) | The same | The channel is dead and nothing brings it back. Remove it, wait for a valid session (`TOKEN_REFRESHED` or `getSession()`), then create and subscribe a new one, with a backoff: 1, 2, 5 and 10 seconds, then every 10 seconds, until it reaches `SUBSCRIBED` |
| `CLOSED` the app asked for (leaving, the layout unmounting) | None | Nothing |
| `SUBSCRIBED`, the first time or any later one | Leaves | Re-reads the room and its seats (in a game also the matches, the round and the next cards: events sent while it was down are lost), calls `track()` again on the live channel (presence doesn't come back by itself), and sends the heartbeat at once. The backoff starts again from 1 second next time |

The app never calls `setAuth` by hand: supabase-js does it on every refresh.

## States

| Situation | Shows | The phone does |
| --- | --- | --- |
| A channel is down (the recipe above) | After a 2-second grace, `common:states.reconnecting` | As the recipe says; the 30-second heartbeat keeps the seat |
| Still not back after 30 seconds | The banner's message becomes `common:states.stillTrying` | Keeps going |
| The device is offline | `common:states.offlineRoom` | Start is disabled; Leave shows the same line as a toast |
| The device is online, a channel not yet `SUBSCRIBED` | `common:states.reconnecting` (no new grace) | As the recipe says |
| Both channels `SUBSCRIBED` and online | The banner leaves | The re-read above |
| The app comes back to the foreground | Nothing, unless something changed | The same re-read, and any channel that is `closed` is recreated at once (then the backoff) |
| The re-read finds the room in another state | The layout replaces the screen with that state's | |
| An event not in `ROOM_EVENTS` | Nothing | Dropped |

While this phone's live channel is down, the others see its seat leave presence; the seat itself is kept, and it is back in their presence within a moment of the next `SUBSCRIBED`. How the lobby turns presence into "away" is in the [lobby](lobby.md#present-and-away).

## Copy (`common` namespace)

`states.reconnecting` already exists ("Reconnexion…" / "Reconnecting…"). New:

| Key | French | English |
| --- | --- | --- |
| `states.stillTrying` | Toujours en train de reconnecter. Ta place est gardée. | Still reconnecting. Your seat is kept. |
| `states.offlineRoom` | Tu es hors ligne. La salle se met à jour à ton retour. | You're offline. The room catches up when you're back. |

## Motion, haptics, sound

- The banner comes in with `layout.fadeIn` and leaves with `layout.fadeOut`; the content below moves with it.
- No haptic: a buzz for a network blip is noise. No sound.

## Accessibility

- The banner is announced once when it appears (a polite live region), not on each retry.
- Disabled buttons say why in their hint (the banner's message).
- Reduce Motion: the banner appears and goes without fading.

## Differences from the Figma

- The Figma draws a toast-like card over the swiping card and an offline status in the header. In the lobby the `Banner` sits under the top bar instead, so the code and Start stay visible. The swipe screen's version is slice 10's to spec.

## Questions

Harry accepted every default below on 30 October 2026.

1. **The grace before showing the banner.** Default: 2 seconds, so a channel that rejoins at once never flashes a banner (a starting value).

Harry accepted every default of slice 7's plan on 3 November 2026; this spec now says each one:

2. **The split** (Q10.1): M4.10 is the room layout, M4.21 Realtime and this banner, M4.22 the splash rejoin and leaving the old seat.
3. **The banner's place** (Q21.3): `RoomBanner`, reading the layout's connection state, under each room screen's `TopBar`.
4. **The recipe** comes from the M3.11 spike, which replaced "rejoins with backoff" for every channel problem.

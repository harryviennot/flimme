# Reconnecting

Screen 24 in the Figma (`30:1722`). Not a route: the room layout (`/room/[id]/_layout.tsx`) shows it over every room screen. Built in M4.10. Written on 30 October 2026 from [realtime](../../architecture/app-structure.md#realtime) and [who counts](../../product/game-modes.md#who-counts-presence-joining-and-leaving). This slice uses it in the [lobby](lobby.md); the swipe screen's part (votes waiting, the offline header) comes with slice 10.

## Purpose

Say plainly when the room can't hear this phone, keep the player's seat, and catch up without a word once the connection is back. Realtime only tells; the database decides.

## Layout

A `Banner` (`ui/banner`) tone `warn` directly under the screen's `TopBar`, pushing the content down (never covering the code or the Start button). One at a time; offline wins over reconnecting.

## States

| Situation | Shows | The phone does |
| --- | --- | --- |
| A Realtime channel errors, times out or closes | After a 2-second grace, the banner with `common:states.reconnecting` | Rejoins with backoff; the 30-second heartbeat keeps trying |
| Still not back after 30 seconds | The banner's message becomes `common:states.stillTrying` | Keeps trying |
| The device is offline | The banner with `common:states.offlineRoom` | Start is disabled; Leave shows the same line as a toast |
| The channel is back, or the device is online again | The banner leaves | Re-reads the room, its seats (and in a game its matches, the round and the next cards), then resumes the heartbeat at once |
| The app comes back to the foreground | Nothing, unless something changed | The same re-read |
| The re-read finds the room in another state | The layout replaces the screen with that state's | |
| An event not in `ROOM_EVENTS` | Nothing | Dropped |

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

1. **The grace before showing the banner.** Default: 2 seconds, so a channel that rejoins at once never flashes a banner (a starting value).

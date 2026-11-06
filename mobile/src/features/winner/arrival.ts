// How the winner screen arrived (winner.md#how-it-arrives). The room layout notes which room
// screen each room was on; the winner screen fades in only when it replaces the swipe or Final
// Cut screen live, not on a cold start, and not under the match overlay.

const last = new Map<string, string>();

/** The room layout calls this whenever its current room screen changes. */
export function rememberRoomScreen(roomId: string, screen: string): void {
  last.set(roomId, screen);
}

/** True when the room was on the swipe or Final Cut screen just before this one. */
export function arrivedFromGame(roomId: string): boolean {
  const from = last.get(roomId);
  return from === 'swipe' || from === 'final-cut';
}

/** The screen fades in: it came from the game, and no match overlay played over it. */
export function arrivedLive(roomId: string, overlayPlayed: boolean): boolean {
  return !overlayPlayed && arrivedFromGame(roomId);
}

// The genre step's rules (docs/design/screens/genre-step.md): who is asked, and what the footer
// says. Memory only: a cold start, a return to the foreground or a reconnect never asks.

const asked = new Set<string>();

/** A path into a room (join, code, host setup) asks for the step once the room is in the lobby. */
export function askGenres(roomId: string): void {
  asked.add(roomId);
}

/** The room layout takes the request: true once, so the step shows once. */
export function takeGenreAsk(roomId: string): boolean {
  return asked.delete(roomId);
}

export function forgetGenreAsk(): void {
  asked.clear();
}

/** Counts show only when other players are present: a "1" on a lone host's pick is noise. */
export function showsCounts(presentSeats: number): boolean {
  return presentSeats > 1;
}

/** The room code grouped as on the ticket ("482 913"). */
export function groupedCode(code: string | undefined): string {
  if (!code) return '';
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export type StepFooter = { primary: 'any' | 'continue'; skip: boolean };

/**
 * The footer: Any genre with no pick (also while loading or after a failed read: skipping never
 * waits), Continue with picks. The ghost Skip shows after a failed save and offline with picks, and
 * never when the read failed (the primary already skips).
 */
export function stepFooter(input: {
  picks: number;
  ready: boolean;
  failed: boolean;
  saveFailed: boolean;
  online: boolean;
}): StepFooter {
  const primary = input.ready && input.picks > 0 ? 'continue' : 'any';
  if (input.failed || !input.ready) return { primary, skip: false };
  const skip = input.saveFailed || (!input.online && primary === 'continue');
  return { primary, skip };
}

/**
 * What the room layout does with a request for the step: ask (the room is in the lobby and the
 * phone is on it), drop it (the room moved past the lobby: picks are locked), or wait.
 */
export function genreAskAction(
  state: string | undefined,
  current: string | undefined,
): 'ask' | 'drop' | 'wait' {
  if (!state) return 'wait';
  if (state !== 'lobby') return 'drop';
  return current === 'lobby' ? 'ask' : 'wait';
}
